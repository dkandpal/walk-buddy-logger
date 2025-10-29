import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Zap, Clock, TrendingDown, Calendar, Info, DollarSign, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine, ReferenceArea } from "recharts";

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

  // Aggregate 5-minute data into hourly averages
  const aggregateToHourly = (prices: any[]) => {
    if (!prices || prices.length === 0) return [];
    
    const hourlyData: { [hour: number]: { sum: number; count: number; timestamps: Date[] } } = {};
    
    prices.forEach((price: any) => {
      const timestamp = new Date(price.timestamp);
      const hour = timestamp.getHours();
      
      if (!hourlyData[hour]) {
        hourlyData[hour] = { sum: 0, count: 0, timestamps: [] };
      }
      
      hourlyData[hour].sum += Number(price.lmp_usd_mwh);
      hourlyData[hour].count += 1;
      hourlyData[hour].timestamps.push(timestamp);
    });
    
    return Object.entries(hourlyData).map(([hour, data]) => ({
      hour: parseInt(hour),
      avgPrice: data.sum / data.count,
      count: data.count
    })).sort((a, b) => a.hour - b.hour);
  };

  const getPriceLabel = (price: number, allPrices: number[]) => {
    if (!allPrices || allPrices.length === 0) return 'okay';
    const sorted = [...allPrices].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const p50 = sorted[Math.floor(sorted.length * 0.50)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    
    if (price <= p25) return 'great';
    if (price <= p50) return 'good';
    if (price <= p75) return 'okay';
    return 'avoid';
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return '12AM';
    if (hour === 12) return '12PM';
    if (hour < 12) return `${hour}AM`;
    return `${hour - 12}PM`;
  };

  // Calculate statistics
  const calculateStats = (hourlyData: any[]) => {
    if (!hourlyData || hourlyData.length === 0) return null;
    
    const prices = hourlyData.map(d => d.avgPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    
    const cheapestHour = hourlyData.find(d => d.avgPrice === minPrice);
    const peakHour = hourlyData.find(d => d.avgPrice === maxPrice);
    
    return {
      minPrice,
      maxPrice,
      avgPrice,
      cheapestHour: cheapestHour?.hour,
      peakHour: peakHour?.hour
    };
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
                Smart Energy Timing Dashboard
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
              NYISO Zone J (NYC) • Day-Ahead Market Prices
            </p>
          </div>

          {error ? (
            <Card className="border-2 border-destructive">
              <CardContent className="py-12 text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <p className="text-destructive font-semibold text-lg">Data Unavailable</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Unable to fetch electricity pricing data. Please try again later.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Statistics */}
              {recommendations?.prices && recommendations.prices.length > 0 && (() => {
                const hourlyData = aggregateToHourly(recommendations.prices);
                const stats = calculateStats(hourlyData);
                const allPrices = hourlyData.map(d => d.avgPrice);

                return (
                  <>
                    {/* Summary Tiles */}
                    <div className="grid grid-cols-3 gap-4">
                      {/* Cheapest Hour */}
                      <Card className="border-2 border-green-500/50 bg-green-50/50 dark:bg-green-950/20">
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-green-500/20">
                              <TrendingDown className="h-5 w-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Cheapest Hour</p>
                              <p className="text-2xl font-bold text-foreground">
                                {stats?.cheapestHour !== undefined ? formatHour(stats.cheapestHour) : '--'}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            ${stats?.minPrice.toFixed(2)}/MWh
                          </p>
                        </CardContent>
                      </Card>

                      {/* Average Price */}
                      <Card className="border-2 border-primary/50 bg-primary/5">
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-primary/20">
                              <DollarSign className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Daily Average</p>
                              <p className="text-2xl font-bold text-foreground">
                                ${stats?.avgPrice.toFixed(2)}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Per MWh
                          </p>
                        </CardContent>
                      </Card>

                      {/* Peak Hour */}
                      <Card className="border-2 border-red-500/50 bg-red-50/50 dark:bg-red-950/20">
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-red-500/20">
                              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Peak Hour</p>
                              <p className="text-2xl font-bold text-foreground">
                                {stats?.peakHour !== undefined ? formatHour(stats.peakHour) : '--'}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            ${stats?.maxPrice.toFixed(2)}/MWh
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Main Chart */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>24-Hour Price Overview</span>
                          <Badge variant="outline" className="font-normal">
                            {isWeekend ? '🏖️ Weekend Pattern' : '💼 Weekday Pattern'}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-6">
                          {/* Legend */}
                          <div className="flex items-center justify-center gap-6 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-green-500"></div>
                              <span className="text-muted-foreground">Great (0-25%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                              <span className="text-muted-foreground">Good (25-50%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                              <span className="text-muted-foreground">Okay (50-75%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-red-500"></div>
                              <span className="text-muted-foreground">Avoid (75-100%)</span>
                            </div>
                          </div>

                          {/* Chart */}
                          <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart 
                                data={hourlyData.map(d => ({
                                  ...d,
                                  label: getPriceLabel(d.avgPrice, allPrices),
                                  hourLabel: formatHour(d.hour)
                                }))}
                                margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
                              >
                                <defs>
                                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                                <XAxis 
                                  dataKey="hourLabel" 
                                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                  interval={2}
                                  stroke="hsl(var(--border))"
                                />
                                <YAxis 
                                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                  tickFormatter={(v) => `$${v.toFixed(0)}`}
                                  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.2)]}
                                  width={50}
                                  stroke="hsl(var(--border))"
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px',
                                    padding: '8px 12px'
                                  }}
                                  formatter={(value: any, name: string, props: any) => {
                                    const label = props.payload.label;
                                    const labelColors: any = {
                                      'great': '#22c55e',
                                      'good': '#3b82f6',
                                      'okay': '#f59e0b',
                                      'avoid': '#ef4444'
                                    };
                                    return [
                                      <span style={{ color: labelColors[label] }}>
                                        ${Number(value).toFixed(2)}/MWh
                                      </span>,
                                      'Price'
                                    ];
                                  }}
                                  labelFormatter={(label) => `${label}`}
                                />
                                
                                {/* Reference lines for cheapest and peak */}
                                {stats?.cheapestHour !== undefined && (
                                  <ReferenceLine 
                                    x={formatHour(stats.cheapestHour)} 
                                    stroke="#22c55e" 
                                    strokeDasharray="3 3"
                                    label={{ 
                                      value: '↓ Cheapest', 
                                      position: 'top',
                                      fill: '#22c55e',
                                      fontSize: 11
                                    }}
                                  />
                                )}
                                {stats?.peakHour !== undefined && (
                                  <ReferenceLine 
                                    x={formatHour(stats.peakHour)} 
                                    stroke="#ef4444" 
                                    strokeDasharray="3 3"
                                    label={{ 
                                      value: '↑ Peak', 
                                      position: 'top',
                                      fill: '#ef4444',
                                      fontSize: 11
                                    }}
                                  />
                                )}
                                
                                <Area
                                  type="monotone"
                                  dataKey="avgPrice"
                                  stroke="hsl(var(--primary))"
                                  strokeWidth={3}
                                  fill="url(#priceGradient)"
                                  dot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    const colors: any = {
                                      'great': '#22c55e',
                                      'good': '#3b82f6',
                                      'okay': '#f59e0b',
                                      'avoid': '#ef4444'
                                    };
                                    return (
                                      <circle
                                        cx={cx}
                                        cy={cy}
                                        r={4}
                                        fill={colors[payload.label]}
                                        stroke="white"
                                        strokeWidth={2}
                                      />
                                    );
                                  }}
                                  activeDot={{ r: 6, strokeWidth: 2, stroke: 'white' }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Chart Footer */}
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">
                              Hourly averages from day-ahead market prices • Updated every 5 minutes
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Best Window Recommendation */}
                    {recommendations?.recommendation && (
                      <Card className="border-2 border-green-500 bg-green-50/30 dark:bg-green-950/10">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                            <Zap className="h-5 w-5" />
                            Recommended Action Window
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-2xl font-bold text-foreground mb-1">
                                {recommendations.recommendation.startTime} - {recommendations.recommendation.endTime}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Best time to run appliances • Avg: ${recommendations.recommendation.avgPrice?.toFixed(2)}/MWh
                              </p>
                            </div>
                            <Badge className="bg-green-500 text-white px-4 py-2 text-sm">
                              Bottom 25% Pricing
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                );
              })()}
            </>
          )}

        </div>
      </div>
    </div>
  );
}