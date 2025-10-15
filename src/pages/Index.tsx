import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WalkDialog } from "@/components/WalkDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dog, AlertCircle } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";
import { useQuery } from "@tanstack/react-query";

const FOUR_HOURS_IN_MS = 4 * 60 * 60 * 1000;
const QUIET_START_HOUR = 22; // 10:30 PM (we'll check minutes too)
const QUIET_START_MINUTE = 30;
const QUIET_END_HOUR = 6; // 6:00 AM

const Index = () => {
  const [lastWalkTime, setLastWalkTime] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(FOUR_HOURS_IN_MS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isQuietHours, setIsQuietHours] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [api, setApi] = useState<CarouselApi>();

  const NOWPLAYING_URL = import.meta.env.VITE_NOWPLAYING_URL || "http://192.168.0.102:5000/display";

  // Poll PC server for now playing info
  const { data: nowPlaying } = useQuery({
    queryKey: ["now-playing"],
    queryFn: async () => {
      try {
        const res = await fetch(NOWPLAYING_URL);
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json() as Promise<{
          playing: boolean;
          title?: string;
          artist?: string;
          image?: string;
        }>;
      } catch (error) {
        console.log('Now playing fetch failed:', error);
        return { playing: false, title: null, artist: null, image: null };
      }
    },
    refetchInterval: 3000,
    retry: 1,
    retryDelay: 1000,
  });

  // Load last walk from database
  useEffect(() => {
    const loadLastWalk = async () => {
      const { data, error } = await supabase
        .from("walks")
        .select("walked_at, walked_by")
        .order("walked_at", { ascending: false })
        .limit(1)
        .single();

      if (data && !error) {
        const walkTime = new Date(data.walked_at);
        setLastWalkTime(walkTime);
        
        // Calculate time remaining based on last walk
        const elapsed = Date.now() - walkTime.getTime();
        const remaining = Math.max(0, FOUR_HOURS_IN_MS - elapsed);
        setTimeRemaining(remaining);
      }
    };

    loadLastWalk();
  }, []);

  // Check if currently in quiet hours
  const checkQuietHours = useCallback(() => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    const isAfterQuietStart = hour > QUIET_START_HOUR || 
      (hour === QUIET_START_HOUR && minute >= QUIET_START_MINUTE);
    const isBeforeQuietEnd = hour < QUIET_END_HOUR;
    
    return isAfterQuietStart || isBeforeQuietEnd;
  }, []);

  // Auto-switch to Now Playing slide when music is playing
  useEffect(() => {
    if (!api) return;
    if (nowPlaying?.playing) {
      api.scrollTo(1);
    } else {
      api.scrollTo(0);
    }
  }, [nowPlaying?.playing, api]);

  // Auto-rotate slides every 8 seconds when music isn't playing
  useEffect(() => {
    if (!api || nowPlaying?.playing) return;
    const timer = setInterval(() => {
      const current = api.selectedScrollSnap();
      const next = (current + 1) % 2;
      api.scrollTo(next);
    }, 8000);
    return () => clearInterval(timer);
  }, [nowPlaying?.playing, api]);

  // Timer countdown logic
  useEffect(() => {
    const inQuietHours = checkQuietHours();
    setIsQuietHours(inQuietHours);

    // If in quiet hours and timer hasn't been resumed today, pause it
    if (inQuietHours && !timerPaused) {
      setTimerPaused(true);
    }

    // If not in quiet hours and was paused, we keep it paused until next walk
    
    const interval = setInterval(() => {
      // Only countdown if not in quiet hours and not paused
      if (!checkQuietHours() && !timerPaused) {
        setTimeRemaining((prev) => Math.max(0, prev - 1000));
      }
      
      // Update quiet hours status
      setIsQuietHours(checkQuietHours());
    }, 1000);

    return () => clearInterval(interval);
  }, [checkQuietHours, timerPaused]);

  const handleWalkConfirm = async (walkedBy: string[]) => {
    const now = new Date();
    
    // Save to database
    const { error } = await supabase.from("walks").insert({
      walked_by: walkedBy,
      walked_at: now.toISOString(),
    });

    if (error) {
      toast.error("Failed to save walk");
      console.error("Error saving walk:", error);
      return;
    }

    // Update UI
    setLastWalkTime(now);
    setTimeRemaining(FOUR_HOURS_IN_MS);
    setTimerPaused(false); // Resume timer after a walk
    setIsDialogOpen(false);
    
    toast.success(`Walk recorded! ${walkedBy.join(", ")} walked the dog 🐕`);
  };

  // Format time remaining
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Format last walk time
  const formatLastWalk = (date: Date | null) => {
    if (!date) return "Never";
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    } else {
      return date.toLocaleString();
    }
  };

  // Dev function: set timer to 5 seconds
  const setTimerToFiveSeconds = () => {
    setTimeRemaining(5000);
    setTimerPaused(false);
    toast.info("Timer set to 5 seconds (dev mode)");
  };

  const isOverdue = timeRemaining === 0 && !isQuietHours && !timerPaused;

  return (
    <>
      <Carousel setApi={setApi} className="h-screen overflow-hidden">
        <CarouselContent>
          {/* Slide 1: Dog Walk Tracker */}
          <CarouselItem className="h-screen">
            <div className="h-screen bg-background flex overflow-hidden">
              {/* Left side - Dog image */}
              <div className="w-[35%] h-screen relative flex-shrink-0">
                <img 
                  src="/DERPDOG.jpeg" 
                  alt="Derpdog" 
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Right side - Main content */}
              <div className="flex-1 flex flex-col items-center justify-center p-3 overflow-y-auto">
                <div className="w-full space-y-3 text-center">
                  {/* Header */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <Dog className="w-6 h-6 text-primary" />
                      <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
                        Dog Walk Tracker
                      </h1>
                    </div>
                    
                    {/* Last walk info */}
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold">Last walk:</span>{" "}
                      {formatLastWalk(lastWalkTime)}
                    </p>
                  </div>

                  {/* Overdue alert */}
                  {isOverdue && (
                    <div className="bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground rounded-2xl p-4 shadow-lg animate-pulse">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                      <h2 className="text-xl font-extrabold">
                        DOG NEEDS A WALK! &lt;3
                      </h2>
                    </div>
                  )}

                  {/* Quiet hours message */}
                  {isQuietHours && (
                    <div className="bg-accent/10 border-2 border-accent rounded-2xl p-3">
                      <p className="text-sm font-bold text-accent-foreground">
                        🌙 Quiet hours — timer paused
                      </p>
                    </div>
                  )}

                  {/* Timer display */}
                  <div className="bg-card border-2 border-border rounded-2xl p-6 shadow-[var(--shadow-soft)]">
                    <div className="text-5xl font-black text-foreground tabular-nums tracking-tight">
                      {formatTime(timeRemaining)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 font-semibold">
                      until next walk
                    </p>
                  </div>

                  {/* Walked button */}
                  <Button
                    onClick={() => setIsDialogOpen(true)}
                    size="lg"
                    className="w-full h-16 text-2xl font-extrabold rounded-2xl bg-gradient-to-r from-primary to-primary/80 hover:shadow-[var(--shadow-playful)] transition-all duration-200"
                  >
                    WALKED
                  </Button>

                  {/* Dev button */}
                  <Button
                    onClick={setTimerToFiveSeconds}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    Dev: Set timer to 5 seconds
                  </Button>
                </div>
              </div>
            </div>
          </CarouselItem>

          {/* Slide 2: Now Playing */}
          <CarouselItem className="flex items-center justify-center h-screen bg-background">
            <div className="flex flex-col items-center justify-center text-center gap-6 px-4">
              {nowPlaying?.image ? (
                <img
                  src={nowPlaying.image}
                  alt="Album Art"
                  className="max-w-xs rounded-2xl shadow-xl"
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center rounded-2xl bg-muted/20">
                  <span className="text-6xl">🎵</span>
                </div>
              )}
              <h2 className="text-3xl font-extrabold text-foreground">
                {nowPlaying?.title ?? "—"}
              </h2>
              <p className="text-xl text-muted-foreground">
                {nowPlaying?.artist ?? "—"}
              </p>
              <p className="text-sm text-muted-foreground/60">
                {nowPlaying?.playing ? "Now Playing" : "Paused / Not Playing"}
              </p>
            </div>
          </CarouselItem>
        </CarouselContent>
        
        <CarouselPrevious className="left-4" />
        <CarouselNext className="right-4" />
      </Carousel>

      <WalkDialog
        open={isDialogOpen}
        onConfirm={handleWalkConfirm}
        onCancel={() => setIsDialogOpen(false)}
      />
    </>
  );
};

export default Index;
