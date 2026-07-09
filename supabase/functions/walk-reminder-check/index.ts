import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Config — tune here.
const RECIPIENT_EMAIL = 'devashish.kandpal@gmail.com'
const THRESHOLD_HOURS = 5
const REPEAT_EVERY_HOURS = 1
// Quiet hours in Eastern Time (24h). Skip texting between these hours.
const QUIET_START_HOUR_ET = 22 // 10 PM
const QUIET_END_HOUR_ET = 8 //  8 AM

function getEtHour(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const hour = parts.find((p) => p.type === 'hour')?.value
  return parseInt(hour ?? '0', 10)
}

function isQuietHour(hourEt: number): boolean {
  // Quiet from 22 (10 PM) through 07 inclusive (before 8 AM)
  if (QUIET_START_HOUR_ET > QUIET_END_HOUR_ET) {
    return hourEt >= QUIET_START_HOUR_ET || hourEt < QUIET_END_HOUR_ET
  }
  return hourEt >= QUIET_START_HOUR_ET && hourEt < QUIET_END_HOUR_ET
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const now = new Date()

  // 1. Latest walk
  const { data: latestWalk, error: walkError } = await supabase
    .from('walks')
    .select('walked_at')
    .order('walked_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (walkError) {
    console.error('Failed to read latest walk', walkError)
    return new Response(JSON.stringify({ error: walkError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!latestWalk) {
    return new Response(JSON.stringify({ skipped: 'no walks yet' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const walkedAt = new Date(latestWalk.walked_at)
  const hoursSinceWalk = (now.getTime() - walkedAt.getTime()) / 3_600_000
  if (hoursSinceWalk < THRESHOLD_HOURS) {
    return new Response(
      JSON.stringify({ skipped: 'under threshold', hoursSinceWalk }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 2. Quiet hours
  const etHour = getEtHour(now)
  if (isQuietHour(etHour)) {
    return new Response(
      JSON.stringify({ skipped: 'quiet hours', etHour }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 3. Rate limit: check the last reminder we sent for THIS walk (or newer).
  //    Match by walk timestamp stored in metadata so a new walk resets the cycle.
  const { data: lastReminder } = await supabase
    .from('email_send_log')
    .select('created_at, metadata')
    .eq('template_name', 'walk-reminder')
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastReminder) {
    const lastWalkIso = (lastReminder.metadata as any)?.walked_at as string | undefined
    // If the last reminder was for the same (or older) walk, enforce cadence.
    if (lastWalkIso && new Date(lastWalkIso).getTime() >= walkedAt.getTime()) {
      const hoursSinceReminder =
        (now.getTime() - new Date(lastReminder.created_at).getTime()) / 3_600_000
      if (hoursSinceReminder < REPEAT_EVERY_HOURS) {
        return new Response(
          JSON.stringify({ skipped: 'cadence', hoursSinceReminder }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }
  }

  // 4. Send the email.
  const idempotencyKey = `walk-reminder-${walkedAt.toISOString()}-${Math.floor(
    now.getTime() / (REPEAT_EVERY_HOURS * 3_600_000),
  )}`

  const { data: sendResult, error: sendError } = await supabase.functions.invoke(
    'send-transactional-email',
    {
      body: {
        templateName: 'walk-reminder',
        recipientEmail: RECIPIENT_EMAIL,
        idempotencyKey,
        templateData: { hoursSinceWalk: Math.round(hoursSinceWalk) },
        metadata: { walked_at: walkedAt.toISOString() },
      },
    },
  )

  if (sendError) {
    console.error('send-transactional-email failed', sendError)
    return new Response(JSON.stringify({ error: sendError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      sent: true,
      hoursSinceWalk: Math.round(hoursSinceWalk),
      result: sendResult,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
