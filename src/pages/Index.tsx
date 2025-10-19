import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WalkDialog } from "@/components/WalkDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dog, AlertCircle, Cloud, CloudRain, Sun, CloudSnow, Home, ArrowLeft } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";
import { useQuery } from "@tanstack/react-query";
import familyPhoto from "@/assets/family-photo.png";

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

  // Fetch weather data (Fort Greene, NY coordinates) - basic
  const { data: weather } = useQuery({
    queryKey: ["weather"],
    queryFn: async () => {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=40.6895&longitude=-73.9733&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=America/New_York'
        );
        if (!res.ok) throw new Error('Failed to fetch weather');
        const data = await res.json();
        return {
          temperature: Math.round(data.current.temperature_2m),
          weatherCode: data.current.weather_code,
        };
      } catch (error) {
        console.log('Weather fetch failed:', error);
        return { temperature: null, weatherCode: null };
      }
    },
    refetchInterval: 600000, // Refresh every 10 minutes
    retry: 1,
  });

  // Fetch detailed weather data
  const { data: detailedWeather } = useQuery({
    queryKey: ["detailed-weather"],
    queryFn: async () => {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=40.6895&longitude=-73.9733&hourly=temperature_2m,weather_code,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America/New_York&forecast_days=5'
        );
        if (!res.ok) throw new Error('Failed to fetch detailed weather');
        const data = await res.json();
        return {
          hourly: data.hourly,
          daily: data.daily,
          current_apparent: data.hourly.apparent_temperature[0],
        };
      } catch (error) {
        console.log('Detailed weather fetch failed:', error);
        return null;
      }
    },
    refetchInterval: 600000, // Refresh every 10 minutes
    retry: 1,
  });

  // Poll Spotify for now playing info
  const { data: nowPlaying } = useQuery({
    queryKey: ["now-playing"],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify-auth`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ action: 'now-playing' }),
        });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        return {
          connected: data.connected || false,
          playing: data.playing || false,
          title: data.title || '',
          artist: data.artist || '',
          image: data.image || '',
        };
      } catch (error) {
        console.log('Spotify fetch failed:', error);
        return { connected: false, playing: false, title: '', artist: '', image: '' };
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

  // Check for Spotify connection success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify_connected') === 'true') {
      toast.success('Spotify connected successfully!');
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Auto-rotate slides every 20 seconds (only for home screen)
  useEffect(() => {
    if (!api) return;
    const timer = setInterval(() => {
      const current = api.selectedScrollSnap();
      // Only auto-rotate if on home screen (slide 0)
      if (current !== 0) return;
      
      const totalSlides = 4; // Updated to include weather detail screen
      
      // Skip slide 1 (dog walker) if time remaining is more than 30 minutes
      const shouldShowDogWalker = timeRemaining < 30 * 60 * 1000; // 30 minutes in ms
      
      let next = (current + 1) % totalSlides;
      
      // If we're about to go to slide 1 and shouldn't show it, skip to slide 2
      if (next === 1 && !shouldShowDogWalker) {
        next = 2;
      }
      
      // Never auto-rotate to weather detail (slide 3)
      if (next === 3) {
        next = 0;
      }
      
      api.scrollTo(next);
    }, 20000);
    return () => clearInterval(timer);
  }, [api, timeRemaining]);

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

  // Format time remaining (HH:MM:SS)
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Format time as HH:MM (hours:minutes for home screen)
  const formatTimeHoursMinutes = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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

  // Get weather icon based on weather code
  const getWeatherIcon = (code: number | null, size: number = 12) => {
    const className = `w-${size} h-${size}`;
    if (!code) return <Cloud className={className} />;
    if (code === 0 || code === 1) return <Sun className={className} />;
    if (code >= 2 && code <= 3) return <Cloud className={className} />;
    if (code >= 51 && code <= 67) return <CloudRain className={className} />;
    if (code >= 71 && code <= 77) return <CloudSnow className={className} />;
    return <Cloud className={className} />;
  };

  // Get weather description
  const getWeatherDescription = (code: number | null) => {
    if (!code) return "Unknown";
    if (code === 0) return "Clear";
    if (code === 1) return "Mostly Clear";
    if (code === 2) return "Partly Cloudy";
    if (code === 3) return "Overcast";
    if (code >= 51 && code <= 67) return "Rainy";
    if (code >= 71 && code <= 77) return "Snowy";
    return "Cloudy";
  };

  // Format day name
  const formatDay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  return (
    <>
      <Carousel setApi={setApi} className="h-screen overflow-hidden">
        <CarouselContent>
          {/* Slide 0: Home Screen - Optimized for 800x480 */}
          <CarouselItem className="h-screen">
            <div className="h-[480px] w-[800px] mx-auto bg-background flex flex-col">
              {/* Header */}
              <div className="h-[60px] flex items-center justify-center border-b-2 border-border bg-card">
                <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
                  ORION HOME
                </h1>
              </div>

              {/* Main Grid */}
              <div className="flex-1 grid grid-cols-2 gap-0">
                {/* Left Column: Family Photo + Weather */}
                <div className="flex flex-col h-full">
                  {/* Family Photo - Top */}
                  <div className="h-[260px] relative overflow-hidden">
                    <img 
                      src={familyPhoto} 
                      alt="Family" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  {/* Weather - Bottom - Clickable */}
                  <button
                    onClick={() => api?.scrollTo(3)}
                    className="h-[160px] bg-card border-t-2 border-border flex items-center justify-center px-4 hover:bg-accent/5 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      {getWeatherIcon(weather?.weatherCode || null, 12)}
                      <div>
                        <div className="text-4xl font-black text-foreground">
                          {weather?.temperature ? `${weather.temperature}°F` : '--°'}
                        </div>
                        <div className="text-sm text-muted-foreground font-semibold">
                          Fort Greene, NY
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Right Column: Dog Timer + Music */}
                <div className="flex flex-col h-full border-l-2 border-border">
                  {/* Dog Timer - Top - Clickable */}
                  <button
                    onClick={() => api?.scrollTo(1)}
                    className="h-[210px] flex flex-col items-center justify-center bg-background px-6 hover:bg-accent/5 transition-colors cursor-pointer"
                  >
                    <h2 className="text-2xl font-bold text-foreground mb-3">Dog Walk</h2>
                    <div className="text-5xl font-black text-foreground tabular-nums tracking-tight">
                      {formatTimeHoursMinutes(timeRemaining)}
                    </div>
                    {isOverdue && (
                      <div className="mt-3 text-destructive text-sm font-bold animate-pulse">
                        🚨 NEEDS WALK
                      </div>
                    )}
                  </button>

                  {/* Music - Bottom - Clickable */}
                  <button
                    onClick={() => api?.scrollTo(2)}
                    className="h-[210px] flex flex-col items-center justify-center bg-card border-t-2 border-border px-6 hover:bg-accent/5 transition-colors cursor-pointer"
                  >
                    <h2 className="text-2xl font-bold text-foreground mb-3">Now Playing</h2>
                    {nowPlaying?.playing ? (
                      <div className="space-y-2 text-center">
                        <p className="text-xl font-bold text-foreground line-clamp-2">{nowPlaying.title}</p>
                        <p className="text-base text-muted-foreground line-clamp-1">{nowPlaying.artist}</p>
                      </div>
                    ) : (
                      <p className="text-lg font-semibold text-muted-foreground">Not Playing</p>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </CarouselItem>

          {/* Slide 1: Dog Walk Tracker */}
          <CarouselItem className="h-screen">
            <div className="h-screen bg-background flex overflow-hidden relative">
              {/* Back to Home Button */}
              <Button
                onClick={() => api?.scrollTo(0)}
                variant="outline"
                size="sm"
                className="absolute top-4 left-4 z-10"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Home
              </Button>

              {/* Left side - Dog image */}
              <div className="w-1/2 h-screen relative flex-shrink-0">
                <img 
                  src="/DERPDOG.jpeg" 
                  alt="Derpdog" 
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Right side - Main content */}
              <div className="w-1/2 flex flex-col items-center justify-center p-3 overflow-y-auto">
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
          <CarouselItem className="flex items-center justify-center h-screen bg-background relative">
            {/* Back to Home Button */}
            <Button
              onClick={() => api?.scrollTo(0)}
              variant="outline"
              size="sm"
              className="absolute top-4 left-4 z-10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Home
            </Button>

            <div className="flex flex-col items-center justify-center text-center gap-6 px-4">
              {!nowPlaying?.connected ? (
                <>
                  <div className="w-64 h-64 flex items-center justify-center rounded-2xl bg-muted/20">
                    <span className="text-6xl">🎵</span>
                  </div>
                  <h2 className="text-3xl font-extrabold text-foreground">
                    Connect Spotify
                  </h2>
                  <p className="text-lg text-muted-foreground max-w-md">
                    Sign in to Spotify to display what you're currently listening to on the kiosk
                  </p>
                  <Button
                    onClick={async () => {
                      try {
                        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify-auth`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                          },
                          body: JSON.stringify({ 
                            action: 'authorize',
                            state: window.location.origin 
                          }),
                        });
                        const data = await res.json();
                        if (data.authUrl) {
                          window.location.href = data.authUrl;
                        }
                      } catch (error) {
                        console.error('Failed to start Spotify auth:', error);
                        toast.error('Failed to connect to Spotify');
                      }
                    }}
                    size="lg"
                    className="w-64 h-14 text-xl font-bold rounded-2xl bg-[#1DB954] hover:bg-[#1ed760] text-white"
                  >
                    Connect Spotify
                  </Button>
                </>
              ) : (
                <>
                  {nowPlaying?.image ? (
                    <img
                      src={nowPlaying.image}
                      alt="Album Art"
                      className="w-[280px] h-[280px] rounded-2xl shadow-xl object-cover"
                    />
                  ) : (
                    <div className="w-64 h-64 flex items-center justify-center rounded-2xl bg-muted/20">
                      <span className="text-6xl">🎵</span>
                    </div>
                  )}
                  <h2 className="text-3xl font-extrabold text-foreground">
                    {nowPlaying?.title || "Not Playing"}
                  </h2>
                  <p className="text-xl text-muted-foreground">
                    {nowPlaying?.artist || "—"}
                  </p>
                  <p className="text-sm text-muted-foreground/60">
                    {nowPlaying?.playing ? "Now Playing" : "Paused / Not Playing"}
                  </p>
                </>
              )}
            </div>
          </CarouselItem>

          {/* Slide 3: Detailed Weather */}
          <CarouselItem className="h-screen bg-background relative">
            {/* Back to Home Button */}
            <Button
              onClick={() => api?.scrollTo(0)}
              variant="outline"
              size="sm"
              className="absolute top-4 left-4 z-10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Home
            </Button>

            <div className="h-screen overflow-y-auto p-8 pt-16">
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="text-center space-y-2">
                  <h1 className="text-4xl font-extrabold text-foreground">Weather Details</h1>
                  <p className="text-lg text-muted-foreground">Fort Greene, NY</p>
                </div>

                {/* Current Conditions */}
                <div className="bg-card border-2 border-border rounded-2xl p-6">
                  <h2 className="text-2xl font-bold text-foreground mb-4">Current Conditions</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      {getWeatherIcon(weather?.weatherCode || null, 10)}
                      <div>
                        <div className="text-3xl font-black text-foreground">
                          {weather?.temperature ? `${weather.temperature}°F` : '--°'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {getWeatherDescription(weather?.weatherCode || null)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Feels Like</div>
                      <div className="text-2xl font-bold text-foreground">
                        {detailedWeather?.current_apparent ? `${Math.round(detailedWeather.current_apparent)}°F` : '--°'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hourly Forecast (Next 12 hours) */}
                <div className="bg-card border-2 border-border rounded-2xl p-6">
                  <h2 className="text-2xl font-bold text-foreground mb-4">Hourly Forecast</h2>
                  <div className="grid grid-cols-6 gap-4">
                    {detailedWeather?.hourly?.time.slice(0, 12).map((time: string, idx: number) => {
                      const hour = new Date(time).getHours();
                      const temp = detailedWeather.hourly.temperature_2m[idx];
                      const code = detailedWeather.hourly.weather_code[idx];
                      return (
                        <div key={time} className="text-center space-y-2">
                          <div className="text-sm font-semibold text-muted-foreground">
                            {hour === 0 ? '12AM' : hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour-12}PM`}
                          </div>
                          <div className="flex justify-center">
                            {getWeatherIcon(code, 8)}
                          </div>
                          <div className="text-lg font-bold text-foreground">
                            {Math.round(temp)}°
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 5-Day Forecast */}
                <div className="bg-card border-2 border-border rounded-2xl p-6">
                  <h2 className="text-2xl font-bold text-foreground mb-4">5-Day Forecast</h2>
                  <div className="space-y-3">
                    {detailedWeather?.daily?.time.map((date: string, idx: number) => {
                      const maxTemp = detailedWeather.daily.temperature_2m_max[idx];
                      const minTemp = detailedWeather.daily.temperature_2m_min[idx];
                      const code = detailedWeather.daily.weather_code[idx];
                      return (
                        <div key={date} className="flex items-center justify-between p-3 bg-background rounded-lg">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-20 font-semibold text-foreground">
                              {idx === 0 ? 'Today' : formatDay(date)}
                            </div>
                            <div className="flex items-center gap-2">
                              {getWeatherIcon(code, 6)}
                              <span className="text-sm text-muted-foreground">
                                {getWeatherDescription(code)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">L: {Math.round(minTemp)}°</span>
                            <span className="font-bold text-foreground">H: {Math.round(maxTemp)}°</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
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
