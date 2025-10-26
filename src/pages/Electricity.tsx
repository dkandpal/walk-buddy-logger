import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Zap, Clock, TrendingDown } from "lucide-react";
import { toast } from "sonner";

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

  // Get recommendations
  const { data: recommendations, isLoading } = useQuery({
    queryKey: ['electricity-recommendations', selectedAppliance],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-electricity-recommendations', {
        body: { appliance: selectedAppliance, zone: 'J' }
      });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
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
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-foreground">
              Use power when it's cheapest and cleanest
            </h2>
            <p className="text-muted-foreground">
              Real-time electricity pricing for NYC (NYISO Zone J)
            </p>
          </div>

          {/* Appliance Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Your Appliance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                {APPLIANCES.map((appliance) => (
                  <Button
                    key={appliance.id}
                    onClick={() => setSelectedAppliance(appliance.id)}
                    variant={selectedAppliance === appliance.id ? 'default' : 'outline'}
                    className="flex-1"
                  >
                    {appliance.name}
                    <span className="ml-2 text-xs opacity-70">
                      ({appliance.duration} min)
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Best Time Recommendations */}
          {!isLoading && recommendations?.recommendation && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="border-2 border-green-500">
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
                      Bottom 25% - Perfect time to run your {selectedAppliance}!
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Duration Needed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-2xl font-bold text-foreground">
                      {recommendations.requiredDuration} minutes
                    </p>
                    <p className="text-sm text-muted-foreground">
                      For {APPLIANCES.find(a => a.id === selectedAppliance)?.name}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {!isLoading && !recommendations?.recommendation && (
            <Card className="border-2 border-yellow-500">
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">
                  No optimal windows found for {selectedAppliance} today. Check back later!
                </p>
              </CardContent>
            </Card>
          )}

          {/* 24-Hour Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>24-Hour Price Timeline</CardTitle>
            </CardHeader>
            <CardContent>
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
                    <div className="flex gap-2">
                      {/* Y-axis */}
                      <div className="flex flex-col justify-between h-64 text-xs text-muted-foreground pr-2">
                        {[60, 45, 30, 15, 0].map((value) => (
                          <div key={value} className="text-right">
                            ${value}
                          </div>
                        ))}
                      </div>
                      
                      {/* Chart Area */}
                      <div className="flex-1 relative">
                        {/* Gridlines */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} className="w-full border-t border-border/30" />
                          ))}
                        </div>
                        
                        {/* Bars */}
                        <div className="relative flex items-end justify-between gap-1 h-64">
                          {recommendations.prices.map((price: any, idx: number) => {
                            const timestamp = new Date(price.timestamp);
                            const label = getPriceLabel(price.lmp_usd_mwh, recommendations.prices);
                            const maxScale = 60; // Fixed scale to $60/MWh
                            const barHeight = Math.min((price.lmp_usd_mwh / maxScale) * 100, 100);
                            
                            return (
                              <div key={idx} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                                <div className="w-full flex flex-col items-center justify-end h-full">
                                  <span className="text-[10px] font-semibold text-foreground mb-1">
                                    ${price.lmp_usd_mwh.toFixed(0)}
                                  </span>
                                  <div
                                    className={`w-full ${getLabelColor(label)} rounded-t transition-all relative group cursor-pointer`}
                                    style={{ height: `${barHeight}%` }}
                                    title={`${formatTime12Hr(timestamp)} - ${getLabelText(label)} - $${price.lmp_usd_mwh.toFixed(2)}/MWh`}
                                  >
                                  </div>
                                </div>
                                <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                                  {formatTime12Hr(timestamp)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    
                    {/* X-axis label */}
                    <div className="text-xs text-muted-foreground text-center">
                      Time of Day
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No price data available
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Coming Soon Section */}
          <Card className="border-2 border-muted">
            <CardHeader>
              <CardTitle className="text-muted-foreground">Coming Soon</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Web push notifications for optimal pricing windows</li>
                <li>• Custom alert rules (e.g., "Alert me at 6pm if there's a great window tonight")</li>
                <li>• Time-of-Use (TOU) plan support with peak hour detection</li>
                <li>• Additional regions and ISO zones</li>
                <li>• Google Login authentication</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}