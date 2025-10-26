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
                <div className="flex items-center gap-4 text-sm">
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

                {/* Timeline Bars */}
                <div className="grid grid-cols-24 gap-1">
                  {recommendations?.windows?.map((window: any, idx: number) => {
                    const startHour = new Date(window.start_time).getHours();
                    const durationHours = Math.ceil(window.duration_minutes / 60);
                    
                    return Array.from({ length: durationHours }).map((_, hourIdx) => (
                      <div
                        key={`${idx}-${hourIdx}`}
                        className={`h-16 ${getLabelColor(window.label)} rounded flex flex-col items-center justify-center text-xs text-white font-semibold`}
                        title={`${startHour + hourIdx}:00 - ${getLabelText(window.label)} - $${window.avg_price?.toFixed(2)}/MWh`}
                      >
                        <span>{(startHour + hourIdx) % 24}</span>
                      </div>
                    ));
                  })}
                </div>
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