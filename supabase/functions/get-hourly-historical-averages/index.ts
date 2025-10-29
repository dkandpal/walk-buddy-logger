import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { zone = 'J', weeks_back = 2 } = await req.json();

    console.log(`Fetching historical averages for zone ${zone}, past ${weeks_back} weeks`);

    // Get current day of week (0 = Sunday, 6 = Saturday)
    const now = new Date();
    const currentDayOfWeek = now.getDay();

    console.log(`Current day of week: ${currentDayOfWeek}`);

    // Query for the past N weeks, filtered to the current day of week
    // Extract day_of_week and hour, then compute averages
    const { data: prices, error } = await supabase
      .from('electricity_prices')
      .select('timestamp, lmp_usd_mwh')
      .eq('zone', zone)
      .gte('timestamp', new Date(Date.now() - weeks_back * 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching prices:', error);
      throw error;
    }

    console.log(`Fetched ${prices?.length || 0} price records`);

    // Filter to only include the current day of week and compute hourly averages
    const hourlyData: { [hour: number]: number[] } = {};
    
    for (const price of prices || []) {
      const ts = new Date(price.timestamp);
      const dayOfWeek = ts.getDay();
      
      // Only include data from the same day of week as today
      if (dayOfWeek === currentDayOfWeek) {
        const hour = ts.getHours();
        if (!hourlyData[hour]) {
          hourlyData[hour] = [];
        }
        hourlyData[hour].push(Number(price.lmp_usd_mwh));
      }
    }

    console.log(`Filtered to current day of week. Hours with data: ${Object.keys(hourlyData).length}`);

    // Compute averages for each hour (0-23)
    const hourlyAverages = [];
    for (let hour = 0; hour < 24; hour++) {
      const pricesForHour = hourlyData[hour] || [];
      const avgPrice = pricesForHour.length > 0
        ? pricesForHour.reduce((sum, p) => sum + p, 0) / pricesForHour.length
        : null;
      
      hourlyAverages.push({
        hour,
        avgPrice,
        sampleCount: pricesForHour.length
      });
    }

    console.log(`Computed averages for ${hourlyAverages.filter(h => h.avgPrice !== null).length} hours`);

    return new Response(
      JSON.stringify({
        hourlyAverages,
        dayOfWeek: currentDayOfWeek,
        weeksAnalyzed: weeks_back,
        zone
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error in get-hourly-historical-averages:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
