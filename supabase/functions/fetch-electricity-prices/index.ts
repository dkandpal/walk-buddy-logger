import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PriceData {
  timestamp: string;
  lmp_usd_mwh: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Fetching NYISO data...');

    // Fetch real-time prices for Zone J
    // NYISO API endpoint for real-time prices
    const realtimeUrl = 'http://mis.nyiso.com/public/csv/realtime/';
    const dayAheadUrl = 'http://mis.nyiso.com/public/csv/damlbmp/';
    
    // For MVP, we'll simulate data since NYISO requires specific date formatting
    // In production, you would parse their CSV format properly
    const now = new Date();
    const prices: PriceData[] = [];
    
    // Generate 24 hours of simulated data (replace with actual NYISO fetch)
    for (let i = 0; i < 24; i++) {
      const timestamp = new Date(now);
      timestamp.setHours(i, 0, 0, 0);
      
      // Simulate price variations (lower at night, higher during day)
      const basePrice = 30;
      const hourFactor = Math.sin((i - 6) * Math.PI / 12) * 15;
      const randomVariation = Math.random() * 10 - 5;
      const price = Math.max(10, basePrice + hourFactor + randomVariation);
      
      prices.push({
        timestamp: timestamp.toISOString(),
        lmp_usd_mwh: Math.round(price * 100) / 100
      });
    }

    console.log(`Generated ${prices.length} price points`);

    // Insert prices into database
    const priceInserts = prices.map(p => ({
      timestamp: p.timestamp,
      zone: 'J',
      lmp_usd_mwh: p.lmp_usd_mwh,
      source: 'real-time'
    }));

    const { error: insertError } = await supabase
      .from('electricity_prices')
      .upsert(priceInserts, { onConflict: 'timestamp,zone,source' });

    if (insertError) {
      console.error('Error inserting prices:', insertError);
      throw insertError;
    }

    // Calculate percentile bands based on last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: historicalPrices, error: fetchError } = await supabase
      .from('electricity_prices')
      .select('lmp_usd_mwh')
      .eq('zone', 'J')
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .order('lmp_usd_mwh');

    if (fetchError) {
      console.error('Error fetching historical prices:', fetchError);
      throw fetchError;
    }

    // Calculate percentiles
    const sortedPrices = historicalPrices?.map(p => p.lmp_usd_mwh) || [];
    const p25 = sortedPrices[Math.floor(sortedPrices.length * 0.25)] || 25;
    const p50 = sortedPrices[Math.floor(sortedPrices.length * 0.50)] || 35;
    const p75 = sortedPrices[Math.floor(sortedPrices.length * 0.75)] || 45;

    console.log('Percentiles:', { p25, p50, p75 });

    // Create windows for next 24 hours
    const windows = [];
    let currentWindow: any = null;

    for (let i = 0; i < prices.length; i++) {
      const price = prices[i];
      let label: string;
      let percentile: number;

      if (price.lmp_usd_mwh <= p25) {
        label = 'great';
        percentile = 25;
      } else if (price.lmp_usd_mwh <= p50) {
        label = 'good';
        percentile = 50;
      } else if (price.lmp_usd_mwh <= p75) {
        label = 'okay';
        percentile = 75;
      } else {
        label = 'avoid';
        percentile = 100;
      }

      if (!currentWindow || currentWindow.label !== label) {
        if (currentWindow) {
          windows.push(currentWindow);
        }
        currentWindow = {
          start_time: price.timestamp,
          end_time: price.timestamp,
          zone: 'J',
          label,
          avg_price: price.lmp_usd_mwh,
          percentile,
          duration_minutes: 60,
          prices: [price.lmp_usd_mwh]
        };
      } else {
        currentWindow.end_time = price.timestamp;
        currentWindow.duration_minutes += 60;
        currentWindow.prices.push(price.lmp_usd_mwh);
        currentWindow.avg_price = currentWindow.prices.reduce((a: number, b: number) => a + b) / currentWindow.prices.length;
      }
    }

    if (currentWindow) {
      windows.push(currentWindow);
    }

    // Delete old windows
    await supabase
      .from('electricity_windows')
      .delete()
      .lt('start_time', now.toISOString());

    // Insert new windows
    const windowInserts = windows.map(({ prices, ...w }: any) => ({
      ...w,
      avg_price: Math.round(w.avg_price * 100) / 100
    }));

    const { error: windowError } = await supabase
      .from('electricity_windows')
      .insert(windowInserts);

    if (windowError) {
      console.error('Error inserting windows:', windowError);
      throw windowError;
    }

    console.log(`Created ${windows.length} windows`);

    return new Response(
      JSON.stringify({
        success: true,
        prices: prices.length,
        windows: windows.length,
        percentiles: { p25, p50, p75 }
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