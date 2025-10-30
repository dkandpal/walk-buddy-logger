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

    const now = new Date();
    let prices: PriceData[] = [];
    let uniquePrices: PriceData[] = [];
    let dataSource = 'day-ahead';

    try {
      // Build NYISO CSV URL for today's date in Eastern Time
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(now);
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const year = parts.find(p => p.type === 'year')?.value;
      const dateStr = `${year}${month}${day}`;
      
      const nyisoUrl = `http://mis.nyiso.com/public/csv/damlbmp/${dateStr}damlbmp_zone.csv`;
      console.log(`Fetching NYISO Day-Ahead Market data from: ${nyisoUrl}`);
      
      const response = await fetch(nyisoUrl);
      
      if (!response.ok) {
        throw new Error(`NYISO API returned ${response.status}`);
      }
      
      const csvText = await response.text();
      const lines = csvText.split('\n');
      
      // Parse CSV header to find column indices - remove quotes from headers
      const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
      const timeStampIdx = header.findIndex(h => h.toLowerCase().includes('time stamp'));
      const nameIdx = header.findIndex(h => h.toLowerCase() === 'name');
      const lbmpIdx = header.findIndex(h => h.toLowerCase().includes('lbmp'));
      
      console.log('CSV Headers:', header);
      console.log('Column indices - timeStamp:', timeStampIdx, 'name:', nameIdx, 'lbmp:', lbmpIdx);
      
      if (timeStampIdx === -1 || nameIdx === -1 || lbmpIdx === -1) {
        throw new Error('Could not find required columns in NYISO CSV');
      }
      
      // Parse data rows for Zone J (NYC)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV line properly handling quoted values
        const columns = line.split(',').map(col => col.replace(/^"|"$/g, '').trim());
        const zoneName = columns[nameIdx];
        
        // Filter for Zone J which is N.Y.C. in the CSV
        if (zoneName === 'N.Y.C.') {
          const timeStamp = columns[timeStampIdx]?.trim();
          const lbmp = parseFloat(columns[lbmpIdx]?.trim());
          
          if (timeStamp && !isNaN(lbmp)) {
            // Parse NYISO timestamp format: "MM/DD/YYYY HH:MM:SS"
            const [datePart, timePart] = timeStamp.split(' ');
            const [month, day, year] = datePart.split('/');
            const [hour, minute] = timePart.split(':');
            
            // Create date in Eastern Time
            const estDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-05:00`);
            
            prices.push({
              timestamp: estDate.toISOString(),
              lmp_usd_mwh: Math.round(lbmp * 100) / 100
            });
          }
        }
      }
      
      if (prices.length === 0) {
        throw new Error('No N.Y.C. (Zone J) data found in NYISO CSV');
      }
      
      console.log(`Fetched ${prices.length} Day-Ahead Market price points for Zone J`);
      
      // Deduplicate by timestamp - keep the latest value for each unique timestamp
      const priceMap = new Map<string, PriceData>();
      prices.forEach(price => {
        priceMap.set(price.timestamp, price);
      });
      uniquePrices = Array.from(priceMap.values());
      
      console.log(`After deduplication: ${uniquePrices.length} unique timestamps`);
      
    } catch (error) {
      console.error('Error fetching NYISO data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch NYISO data';
      return new Response(
        JSON.stringify({ error: errorMessage, details: 'NYISO data unavailable' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        }
      );
    }

    // Insert prices into database
    const priceInserts = uniquePrices.map(p => ({
      timestamp: p.timestamp,
      zone: 'J',
      lmp_usd_mwh: p.lmp_usd_mwh,
      source: dataSource
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
        percentiles: { p25, p50, p75 },
        dataSource
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