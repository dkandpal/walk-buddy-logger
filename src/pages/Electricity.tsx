import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Zap, Clock, TrendingDown, Calendar, Info } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ElectricityProps {
  onBack: () => void;
}

const APPLIANCES = [
  { id: 'dishwasher', name: 'Dishwasher', duration: 120 },
  { id: 'laundry', name: 'Laundry', duration: 90 },
  { id: 'dryer', name: 'Dryer', duration: 60 }
];

export default function Electricity({ onBack }: ElectricityProps) {
  const [selectedAppliance, setSelectedAppliance] = useState('laundry');
  
  // Get current day info
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Fetch initial data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        await supabase.functions.invoke('fetch-electricity-prices');
      } catch (error) {
        console.error('Error fetching electricity data:', error);
      }
    };
    fetchData();
  }, []);

  // Get recommendations and today's prices
  const { data: recommendations, isLoading, error } = useQuery({
    queryKey: ['electricity-recommendations', selectedAppliance],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-electricity-recommendations', {
        body: { appliance: selectedAppliance, zone: 'J' }
      });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    retry: false,
  });

  const getLabelColor = (label: string) => {
    switch (label) {
      case 'great': return 'bg-green-500';
      case 'good': return 'bg-blue-500';
      case 'okay': return 'bg-yellow-500';
      case 'avoid': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getLabelText = (label: string) => {
    switch (label) {
      case 'great': return 'Great';
      case 'good': return 'Good';
      case 'okay': return 'Okay';
      case 'avoid': return 'Avoid';
      default: return 'Unknown';
    }
  };

  const formatTime12Hr = (date: Date) => {
    const hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}${ampm}`;
  };

  const getPriceLabel = (price: number, prices: any[]) => {
    if (!prices || prices.length === 0) return 'okay';
    const sortedPrices = [...prices].map(p => p.lmp_usd_mwh).sort((a, b) => a - b);
    const p25 = sortedPrices[Math.floor(sortedPrices.length * 0.25)];
    const p50 = sortedPrices[Math.floor(sortedPrices.length * 0.50)];
    const p75 = sortedPrices[Math.floor(sortedPrices.length * 0.75)];
    
    if (price <= p25) return 'great';
    if (price <= p50) return 'good';
    if (price <= p75) return 'okay';
    return 'avoid';
  };

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      {/* Header */}
      <div className="h-[60px] flex items-center justify-between px-8 border-b-2 border-border bg-card">
        <Button
          onClick={onBack}
          variant="ghost"
          size="sm"
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Button>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Zap className="h-6 w-6 text-green-500" />
          Electricity Prices
        </h1>
        <div className="w-32"></div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Hero Section */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-3">
              <h2 className="text-3xl font-bold text-foreground">
                Use power when it's cheapest and cleanest
              </h2>
            </div>
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{dateStr}</span>
              <Badge variant={isWeekend ? "default" : "secondary"} className="ml-2">
                {dayOfWeek}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Today's day-ahead auction prices for NYC (NYISO Zone J)
            </p>
          </div>

          {/* Weekday vs Weekend Info Banner */}
          <Card className={`border-l-4 ${isWeekend ? 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20'}`}>
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className={`h-5 w-5 mt-0.5 ${isWeekend ? 'text-blue-600' : 'text-orange-600'}`} />
                <div className="space-y-1">
                  <p className={`font-semibold ${isWeekend ? 'text-blue-900 dark:text-blue-100' : 'text-orange-900 dark:text-orange-100'}`}>
                    {isWeekend ? 'Weekend Pricing Pattern' : 'Weekday Pricing Pattern'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isWeekend 
                      ? 'Weekend electricity demand is typically lower, resulting in more consistent pricing throughout the day. Great for running large appliances anytime!'
                      : 'Weekday demand peaks during morning (7-9 AM) and evening (5-9 PM) hours. Plan energy-intensive tasks during off-peak times for maximum savings.'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content - Side by Side */}
          <div className="flex gap-4">
            {/* Best Window Card - 20% */}
            <div className="w-1/5">
              {error && (
                <Card className="border-2 border-red-500 h-full">
                  <CardContent className="py-8">
                    <p className="text-center text-red-600 font-semibold">
                      Data Unavailable
                    </p>
                    <p className="text-center text-sm text-muted-foreground mt-2">
                      Unable to fetch electricity pricing data. Please try again later.
                    </p>
                  </CardContent>
                </Card>
              )}
              
              {!error && !isLoading && recommendations?.recommendation && (
                <Card className="border-2 border-green-500 h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-600">
                      <TrendingDown className="h-5 w-5" />
                      Best Window {recommendations.recommendation.time === 'tonight' ? 'Tonight' : 'Today'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-2xl font-bold text-foreground">
                        {recommendations.recommendation.startTime} - {recommendations.recommendation.endTime}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Avg. Price: ${recommendations.recommendation.avgPrice?.toFixed(2)}/MWh
                      </p>
                      <p className="text-sm text-green-600 font-semibold">
                        Bottom 25% - Perfect time to run appliances!
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!error && !isLoading && !recommendations?.recommendation && (
                <Card className="border-2 border-yellow-500 h-full">
                  <CardContent className="py-8">
                    <p className="text-center text-muted-foreground">
                      No optimal windows found today. Check back later!
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* 24-Hour Timeline Chart - 80% */}
            <Card className="w-4/5">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Today's 24-Hour Price Timeline</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {isWeekend ? '🏖️ Weekend' : '💼 Weekday'} Rates
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <div className="py-12 text-center">
                  <p className="text-red-600 font-semibold text-lg">Data Unavailable</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Unable to fetch electricity pricing data. Please try again later.
                  </p>
                </div>
              ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-500 rounded"></div>
                    <span>Great (0-25%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded"></div>
                    <span>Good (25-50%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                    <span>Okay (50-75%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-500 rounded"></div>
                    <span>Avoid (75-100%)</span>
                  </div>
                </div>

                {/* Vertical Bar Chart */}
                {recommendations?.prices && recommendations.prices.length > 0 ? (
                  <div className="space-y-2">
                    {/* Build chart data with per-label series so each bar is colored */}
                    {(() => {
                      // Sort prices by timestamp to ensure chart starts at midnight
                      const sortedPrices = [...recommendations.prices].sort((a: any, b: any) => 
                        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                      );

                      // Rotate so the first item is local midnight (00:00)
                      const midnightIndex = sortedPrices.findIndex((p: any) => new Date(p.timestamp).getHours() === 0);
                      const ordered = midnightIndex > -1
                        ? [...sortedPrices.slice(midnightIndex), ...sortedPrices.slice(0, midnightIndex)]
                        : sortedPrices;
                      
                      const chartData = ordered.map((price: any) => {
                        const ts = new Date(price.timestamp);
                        const p = Number(price.lmp_usd_mwh);
                        const lbl = getPriceLabel(p, recommendations.prices);
                        return {
                          time: formatTime12Hr(ts),
                          price: p,
                          great: lbl === 'great' ? p : 0,
                          good: lbl === 'good' ? p : 0,
                          okay: lbl === 'okay' ? p : 0,
                          avoid: lbl === 'avoid' ? p : 0,
                        };
                      });

                      return (
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="time" interval={0} tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => `$${v}`} domain={[0, 'auto']} />
                              <Tooltip formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Price']} />
                              {/* One bar per label, stacked so only one segment shows per hour */}
                              <Bar dataKey="great" stackId="a" fill="#22c55e" />
                              <Bar dataKey="good" stackId="a" fill="#3b82f6" />
                              <Bar dataKey="okay" stackId="a" fill="#f59e0b" />
                              <Bar dataKey="avoid" stackId="a" fill="#ef4444" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}

                    {/* X-axis label */}
                    <div className="text-xs text-muted-foreground text-center">
                      Time of Day (Day-Ahead Auction Prices)
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No price data available
                  </p>
                )}
              </div>
              )}
            </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}