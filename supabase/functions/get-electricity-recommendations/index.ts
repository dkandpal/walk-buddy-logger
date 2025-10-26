import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APPLIANCE_DURATIONS = {
  dishwasher: 120,
  laundry: 90,
  dryer: 60
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { appliance = 'laundry', zone = 'J' } = await req.json();
    const requiredDuration = APPLIANCE_DURATIONS[appliance as keyof typeof APPLIANCE_DURATIONS] || 90;

    console.log(`Getting recommendations for ${appliance} (${requiredDuration} min) in zone ${zone}`);

    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch windows for today
    const { data: windows, error: windowError } = await supabase
      .from('electricity_windows')
      .select('*')
      .eq('zone', zone)
      .gte('start_time', now.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time');

    if (windowError) {
      console.error('Error fetching windows:', windowError);
      throw windowError;
    }

    // Find best windows for appliance
    const greatWindows = windows?.filter(w => 
      w.label === 'great' && w.duration_minutes >= requiredDuration
    ) || [];

    // If no single great window is long enough, try to find consecutive great windows
    let bestWindow = null;
    if (greatWindows.length > 0) {
      bestWindow = greatWindows[0];
    } else {
      // Try to combine consecutive great windows
      for (let i = 0; i < (windows?.length || 0); i++) {
        if (windows![i].label === 'great') {
          let totalDuration = windows![i].duration_minutes;
          let endWindow = windows![i];
          
          for (let j = i + 1; j < windows!.length; j++) {
            if (windows![j].label === 'great') {
              totalDuration += windows![j].duration_minutes;
              endWindow = windows![j];
              
              if (totalDuration >= requiredDuration) {
                bestWindow = {
                  ...windows![i],
                  end_time: endWindow.end_time,
                  duration_minutes: totalDuration
                };
                break;
              }
            } else {
              break;
            }
          }
          
          if (bestWindow) break;
        }
      }
    }

    // Determine if it's "today" or "tonight"
    const currentHour = now.getHours();
    const windowHour = bestWindow ? new Date(bestWindow.start_time).getHours() : 0;
    const timeOfDay = windowHour >= 18 || windowHour < 6 ? 'tonight' : 'today';

    // Format recommendation
    const recommendation = bestWindow ? {
      time: timeOfDay,
      startTime: new Date(bestWindow.start_time).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }),
      endTime: new Date(bestWindow.end_time).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }),
      label: bestWindow.label,
      avgPrice: bestWindow.avg_price,
      duration: bestWindow.duration_minutes
    } : null;

    // Get hourly breakdown for timeline
    const { data: prices, error: priceError } = await supabase
      .from('electricity_prices')
      .select('*')
      .eq('zone', zone)
      .gte('timestamp', now.toISOString())
      .lte('timestamp', endOfDay.toISOString())
      .order('timestamp');

    if (priceError) {
      console.error('Error fetching prices:', priceError);
      throw priceError;
    }

    return new Response(
      JSON.stringify({
        recommendation,
        windows: windows || [],
        prices: prices || [],
        appliance,
        requiredDuration
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});