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
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Check for day-ahead prices first
    let dataSource = 'day-ahead';
    const { data: dayAheadPrices, error: dayAheadError } = await supabase
      .from('electricity_prices')
      .select('*')
      .eq('zone', zone)
      .eq('source', 'day-ahead')
      .gte('timestamp', startOfDay.toISOString())
      .lte('timestamp', endOfDay.toISOString())
      .order('timestamp');

    // If no day-ahead data, fetch it
    if (!dayAheadPrices || dayAheadPrices.length === 0) {
      console.log('No day-ahead data found, fetching...');
      try {
        const { error: fetchError } = await supabase.functions.invoke('fetch-electricity-prices');
        if (fetchError) {
          console.error('Error invoking fetch function:', fetchError);
        } else {
          console.log('Successfully triggered price fetch');
        }
      } catch (fetchErr) {
        console.error('Failed to trigger price fetch:', fetchErr);
      }
    }

    // Fetch windows for today (full 24 hours)
    const { data: windows, error: windowError } = await supabase
      .from('electricity_windows')
      .select('*')
      .eq('zone', zone)
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time');

    if (windowError) {
      console.error('Error fetching windows:', windowError);
      throw windowError;
    }

    // Filter for future windows only (windows that haven't ended yet)
    const futureWindows = windows?.filter(w => new Date(w.end_time) > now) || [];
    
    console.log(`Found ${futureWindows.length} future windows out of ${windows?.length || 0} total windows`);

    // Find best windows for appliance (only from future windows)
    const greatWindows = futureWindows.filter(w => 
      w.label === 'great' && w.duration_minutes >= requiredDuration
    );

    // If no single great window is long enough, try to find consecutive great windows
    let bestWindow = null;
    if (greatWindows.length > 0) {
      bestWindow = greatWindows[0];
    } else {
      // Try to combine consecutive great windows (only from future windows)
      for (let i = 0; i < futureWindows.length; i++) {
        if (futureWindows[i].label === 'great') {
          let totalDuration = futureWindows[i].duration_minutes;
          let endWindow = futureWindows[i];
          
          for (let j = i + 1; j < futureWindows.length; j++) {
            if (futureWindows[j].label === 'great') {
              totalDuration += futureWindows[j].duration_minutes;
              endWindow = futureWindows[j];
              
              if (totalDuration >= requiredDuration) {
                bestWindow = {
                  ...futureWindows[i],
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
    
    if (bestWindow) {
      console.log(`Best window: ${new Date(bestWindow.start_time).toLocaleString()} - ${new Date(bestWindow.end_time).toLocaleString()}, avg price: $${bestWindow.avg_price}`);
    } else {
      console.log('No suitable windows found');
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

    // Get hourly breakdown for timeline - prefer day-ahead, fall back to real-time
    let { data: prices, error: priceError } = await supabase
      .from('electricity_prices')
      .select('*')
      .eq('zone', zone)
      .eq('source', 'day-ahead')
      .gte('timestamp', startOfDay.toISOString())
      .lte('timestamp', endOfDay.toISOString())
      .order('timestamp');

    // Fall back to real-time if day-ahead not available
    if (!prices || prices.length === 0) {
      console.log('No day-ahead prices, falling back to real-time');
      dataSource = 'real-time';
      const { data: realtimePrices, error: realtimeError } = await supabase
        .from('electricity_prices')
        .select('*')
        .eq('zone', zone)
        .eq('source', 'real-time')
        .gte('timestamp', startOfDay.toISOString())
        .lte('timestamp', endOfDay.toISOString())
        .order('timestamp');
      
      if (realtimeError) {
        console.error('Error fetching real-time prices:', realtimeError);
        throw realtimeError;
      }
      prices = realtimePrices;
    }

    if (priceError) {
      console.error('Error fetching prices:', priceError);
      throw priceError;
    }

    console.log(`Returning ${prices?.length || 0} price points with source: ${dataSource}`);

    // Find cheapest hour during waking hours (8am-11pm)
    let cheapestWakingHour = null;
    if (prices && prices.length > 0) {
      const wakingHoursPrices = prices.filter(p => {
        const hour = new Date(p.timestamp).getHours();
        return hour >= 8 && hour <= 23;
      });
      
      if (wakingHoursPrices.length > 0) {
        cheapestWakingHour = wakingHoursPrices.reduce((min, p) => 
          Number(p.lmp_usd_mwh) < Number(min.lmp_usd_mwh) ? p : min
        );
      }
    }

    return new Response(
      JSON.stringify({
        recommendation,
        windows: windows || [],
        prices: prices || [],
        appliance,
        requiredDuration,
        dataSource,
        cheapestWakingHour: cheapestWakingHour ? {
          hour: new Date(cheapestWakingHour.timestamp).toLocaleTimeString('en-US', { 
            hour: 'numeric',
            hour12: true 
          }),
          price: Number(cheapestWakingHour.lmp_usd_mwh)
        } : null
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