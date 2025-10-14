import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WalkDialog } from "@/components/WalkDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dog, AlertCircle } from "lucide-react";

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
    <div className="min-h-screen bg-background flex">
      {/* Left side - Dog image */}
      <div className="w-1/3 min-h-screen relative">
        <img 
          src="/DERPDOG.jpeg" 
          alt="Derpdog" 
          className="w-full h-full object-cover"
        />
      </div>

      {/* Right side - Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-8 text-center">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Dog className="w-12 h-12 text-primary" />
              <h1 className="text-5xl font-extrabold text-foreground tracking-tight">
                Dog Walk Tracker
              </h1>
            </div>
            
            {/* Last walk info */}
            <p className="text-xl text-muted-foreground">
              <span className="font-semibold">Last walk:</span>{" "}
              {formatLastWalk(lastWalkTime)}
            </p>
          </div>

          {/* Overdue alert */}
          {isOverdue && (
            <div className="bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground rounded-3xl p-8 shadow-lg animate-pulse">
              <AlertCircle className="w-16 h-16 mx-auto mb-4" />
              <h2 className="text-4xl font-extrabold">
                DOG NEEDS A WALK! &lt;3
              </h2>
            </div>
          )}

          {/* Quiet hours message */}
          {isQuietHours && (
            <div className="bg-accent/10 border-4 border-accent rounded-3xl p-6">
              <p className="text-2xl font-bold text-accent-foreground">
                🌙 Quiet hours — timer paused until morning
              </p>
            </div>
          )}

          {/* Timer display */}
          <div className="bg-card border-4 border-border rounded-3xl p-12 shadow-[var(--shadow-soft)]">
            <div className="text-8xl md:text-9xl font-black text-foreground tabular-nums tracking-tight">
              {formatTime(timeRemaining)}
            </div>
            <p className="text-2xl text-muted-foreground mt-4 font-semibold">
              until next walk
            </p>
          </div>

          {/* Walked button */}
          <Button
            onClick={() => setIsDialogOpen(true)}
            size="lg"
            className="w-full h-24 text-4xl font-extrabold rounded-3xl bg-gradient-to-r from-primary to-primary/80 hover:shadow-[var(--shadow-playful)] transition-all duration-200 hover:scale-105"
          >
            WALKED
          </Button>

          {/* Dev button */}
          <Button
            onClick={setTimerToFiveSeconds}
            variant="outline"
            size="sm"
            className="text-sm"
          >
            Dev: Set timer to 5 seconds
          </Button>
        </div>
      </div>

      <WalkDialog
        open={isDialogOpen}
        onConfirm={handleWalkConfirm}
        onCancel={() => setIsDialogOpen(false)}
      />
    </div>
  );
};

export default Index;
