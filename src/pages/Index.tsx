import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WalkDialog } from "@/components/WalkDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dog, AlertCircle, Cloud, CloudRain, Sun, CloudSnow, Home, ArrowLeft, Zap } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi } from "@/components/ui/carousel";
import { useQuery } from "@tanstack/react-query";
import familyPhoto from "@/assets/family-photo.png";
import Electricity from "./Electricity";
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
  const [currentTime, setCurrentTime] = useState(new Date());

  // Fetch weather data (Fort Greene, NY coordinates) - basic
  const {
    data: weather
  } = useQuery({
    queryKey: ["weather"],
    queryFn: async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.6895&longitude=-73.9733&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=America/New_York');
        if (!res.ok) throw new Error('Failed to fetch weather');
        const data = await res.json();
        return {
          temperature: Math.round(data.current.temperature_2m),
          weatherCode: data.current.weather_code
        };
      } catch (error) {
        console.log('Weather fetch failed:', error);
        return {
          temperature: null,
          weatherCode: null
        };
      }
    },
    refetchInterval: 600000,
    // Refresh every 10 minutes
    retry: 1
  });

  // Fetch detailed weather data
  const {
    data: detailedWeather
  } = useQuery({
    queryKey: ["detailed-weather"],
    queryFn: async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.6895&longitude=-73.9733&hourly=temperature_2m,weather_code,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America/New_York&forecast_days=5');
        if (!res.ok) throw new Error('Failed to fetch detailed weather');
        const data = await res.json();
        return {
          hourly: data.hourly,
          daily: data.daily,
          current_apparent: data.hourly.apparent_temperature[0]
        };
      } catch (error) {
        console.log('Detailed weather fetch failed:', error);
        return null;
      }
    },
    refetchInterval: 600000,
    // Refresh every 10 minutes
    retry: 1
  });

  // Poll Spotify for now playing info
  const {
    data: nowPlaying
  } = useQuery({
    queryKey: ["now-playing"],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify-auth`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
          },
          body: JSON.stringify({
            action: 'now-playing'
          })
        });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        return {
          connected: data.connected || false,
          playing: data.playing || false,
          title: data.title || '',
          artist: data.artist || '',
          image: data.image || ''
        };
      } catch (error) {
        console.log('Spotify fetch failed:', error);
        return {
          connected: false,
          playing: false,
          title: '',
          artist: '',
          image: ''
        };
      }
    },
    refetchInterval: 3000,
    retry: 1,
    retryDelay: 1000
  });

  // Fetch electricity recommendations
  const {
    data: electricityRecs
  } = useQuery({
    queryKey: ['electricity-recommendations', 'laundry'],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.functions.invoke('get-electricity-recommendations', {
        body: {
          appliance: 'laundry',
          zone: 'J'
        }
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
    // Refetch every 5 minutes
    retry: false
  });

  // Load last walk from database
  useEffect(() => {
    const loadLastWalk = async () => {
      const {
        data,
        error
      } = await supabase.from("walks").select("walked_at, walked_by").order("walked_at", {
        ascending: false
      }).limit(1).single();
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
    const isAfterQuietStart = hour > QUIET_START_HOUR || hour === QUIET_START_HOUR && minute >= QUIET_START_MINUTE;
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
      const totalSlides = 5; // Updated to include weather detail screen + electricity

      // Skip slide 1 (dog walker) if time remaining is more than 30 minutes
      const shouldShowDogWalker = timeRemaining < 30 * 60 * 1000; // 30 minutes in ms

      let next = (current + 1) % totalSlides;

      // If we're about to go to slide 1 and shouldn't show it, skip to slide 2
      if (next === 1 && !shouldShowDogWalker) {
        next = 2;
      }

      // Never auto-rotate to weather detail (slide 3) or electricity (slide 4)
      if (next === 3 || next === 4) {
        next = 0;
      }
      api.scrollTo(next);
    }, 20000);
    return () => clearInterval(timer);
  }, [api, timeRemaining]);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
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
        setTimeRemaining(prev => Math.max(0, prev - 1000));
      }

      // Update quiet hours status
      setIsQuietHours(checkQuietHours());
    }, 1000);
    return () => clearInterval(interval);
  }, [checkQuietHours, timerPaused]);
  const handleWalkConfirm = async (walkedBy: string[]) => {
    const now = new Date();

    // Save to database
    const {
      error
    } = await supabase.from("walks").insert({
      walked_by: walkedBy,
      walked_at: now.toISOString()
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
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Format time as HH:MM (hours:minutes for home screen)
  const formatTimeHoursMinutes = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
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
    return date.toLocaleDateString('en-US', {
      weekday: 'short'
    });
  };

  // Format current time
  const formatCurrentTime = () => {
    return currentTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };
  return <>
      <Carousel setApi={setApi} className="h-screen overflow-hidden">
        <CarouselContent>
          {/* Slide 0: Home Screen - Full Screen */}
          <CarouselItem className="h-screen">
            <div className="h-screen w-screen bg-background flex flex-col">
              {/* Header */}
              <div className="h-20 flex items-center justify-between px-8 border-b-2 border-border bg-card">
                <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground tabular-nums">
                  {formatCurrentTime()}
                </div>
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-foreground tracking-tight">
                  ORION HOME
                </h1>
                <div className="w-32"></div> {/* Spacer for centering */}
              </div>

              {/* Main Grid - Updated with 3 sections */}
              <div className="flex-1 grid grid-cols-3 gap-0">
                {/* Left Column: Family Photo */}
                <div className="flex flex-col h-full">
                  {/* Family Photo - Full Height */}
                  <div className="h-full relative overflow-hidden">
                    <img src={familyPhoto} alt="Family" className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* Middle Column: Weather + Dog Timer */}
                <div className="flex flex-col h-full border-l-2 border-border">
                  {/* Weather - Top - Clickable */}
                  <button onClick={() => api?.scrollTo(3)} className="h-1/2 bg-card flex items-center justify-center px-4 hover:bg-accent/5 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      {getWeatherIcon(weather?.weatherCode || null, 16)}
                      <div>
                        <div className="text-5xl md:text-6xl lg:text-8xl font-black text-foreground">
                          {weather?.temperature ? `${weather.temperature}°F` : '--°'}
                        </div>
                        {detailedWeather?.current_apparent && (
                          <div className="text-xl md:text-2xl lg:text-3xl text-muted-foreground font-semibold">
                            Feels like {Math.round(detailedWeather.current_apparent)}°F
                          </div>
                        )}
                        <div className="text-base md:text-lg lg:text-xl text-muted-foreground font-semibold">
                          Fort Greene, NY
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Dog Timer - Bottom - Clickable */}
                  <button onClick={() => api?.scrollTo(1)} className="h-1/2 flex flex-col items-center justify-center bg-background border-t-2 border-border px-4 hover:bg-accent/5 transition-colors cursor-pointer">
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-2 md:mb-4">Dog Walk</h2>
                    <div className="text-6xl md:text-7xl lg:text-9xl font-black text-foreground tabular-nums tracking-tight">
                      {formatTimeHoursMinutes(timeRemaining)}
                    </div>
                    {lastWalkTime && (
                      <div className="text-lg md:text-xl lg:text-2xl text-muted-foreground mt-1 md:mt-2">
                        Last walk: {formatLastWalk(lastWalkTime)}
                      </div>
                    )}
                    {isOverdue && <div className="mt-2 md:mt-4 text-destructive text-xl md:text-2xl lg:text-3xl font-bold animate-pulse">
                        🚨 NEEDS WALK
                      </div>}
                  </button>
                </div>

                {/* Right Column: Music + Electricity */}
                <div className="flex flex-col h-full border-l-2 border-border">
                  {/* Music - Top - Clickable */}
                  <button onClick={() => api?.scrollTo(2)} className="h-1/2 flex flex-col items-center justify-center bg-card px-4 hover:bg-accent/5 transition-colors cursor-pointer gap-2 md:gap-3">
                    {nowPlaying?.playing && nowPlaying.image ? (
                      <>
                        <img 
                          src={nowPlaying.image} 
                          alt="Album Art" 
                          className="flex-1 w-auto object-contain max-h-[65%]" 
                        />
                        <div className="space-y-1 text-center px-2">
                          <p className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground line-clamp-1">{nowPlaying.title}</p>
                          <p className="text-base md:text-lg lg:text-xl text-muted-foreground line-clamp-1">{nowPlaying.artist}</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-2 md:mb-4">Now Playing</h2>
                        <p className="text-xl md:text-xl lg:text-2xl font-semibold text-muted-foreground">Not Playing</p>
                      </div>
                    )}
                  </button>

                  {/* Electricity - Bottom - Clickable */}
                  <button onClick={() => api?.scrollTo(4)} className="h-1/2 flex flex-col items-center justify-center bg-background border-t-2 border-border px-4 hover:bg-accent/5 transition-colors cursor-pointer bg-gradient-to-br from-green-500/10 to-blue-500/10">
                    <Zap className="h-14 w-14 md:h-16 md:w-16 lg:h-20 lg:w-20 text-green-500 mb-2 md:mb-3" />
                    <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">Greenest Hour</h2>
                    {electricityRecs?.cheapestWakingHour ? <>
                        <p className="text-4xl md:text-5xl lg:text-6xl text-foreground mt-2 md:mt-3 font-bold">
                          {electricityRecs.cheapestWakingHour.hour}
                        </p>
                        <p className="text-lg md:text-xl lg:text-2xl text-muted-foreground">
                          ${electricityRecs.cheapestWakingHour.price.toFixed(2)}/MWh
                        </p>
                      </> : <p className="text-base md:text-lg lg:text-xl text-muted-foreground mt-2">Loading...</p>}
                  </button>
                </div>
              </div>
            </div>
          </CarouselItem>

          {/* Slide 1: Dog Walk Tracker */}
          <CarouselItem className="h-screen">
            <div className="h-screen bg-background flex overflow-hidden relative">
              {/* Back to Home Button */}
              <Button onClick={() => api?.scrollTo(0)} variant="outline" size="lg" className="absolute top-6 left-6 z-10 text-lg px-6 py-3">
                <ArrowLeft className="w-6 h-6 mr-2" />
                Home
              </Button>

              {/* Left side - Dog image */}
              <div className="w-1/2 h-screen relative flex-shrink-0">
                <img src="/DERPDOG.jpeg" alt="Derpdog" className="w-full h-full object-cover" />
              </div>

              {/* Right side - Main content */}
              <div className="w-1/2 flex flex-col items-center justify-center p-8 overflow-y-auto">
                <div className="w-full space-y-6 text-center">
                  {/* Header */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-3">
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
                  {isOverdue && <div className="bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground rounded-2xl p-6 shadow-lg animate-pulse">
                      <AlertCircle className="w-12 h-12 mx-auto mb-3" />
                      <h2 className="text-3xl font-extrabold">
                        DOG NEEDS A WALK! &lt;3
                      </h2>
                    </div>}

                  {/* Quiet hours message */}
                  {isQuietHours && <div className="bg-accent/10 border-2 border-accent rounded-2xl p-5">
                      <p className="text-lg font-bold text-accent-foreground">
                        🌙 Quiet hours — timer paused
                      </p>
                    </div>}

                  {/* Timer display */}
                  <div className="bg-card border-2 border-border rounded-2xl p-10 shadow-[var(--shadow-soft)]">
                    <div className="text-8xl font-black text-foreground tabular-nums tracking-tight">
                      {formatTime(timeRemaining)}
                    </div>
                    <p className="text-xl text-muted-foreground mt-4 font-semibold">
                      until next walk
                    </p>
                  </div>

                  {/* Walked button */}
                  <Button onClick={() => setIsDialogOpen(true)} size="lg" className="w-full h-20 text-3xl font-extrabold rounded-2xl bg-gradient-to-r from-primary to-primary/80 hover:shadow-[var(--shadow-playful)] transition-all duration-200">
                    WALKED
                  </Button>

                  {/* Dev button */}
                  <Button onClick={setTimerToFiveSeconds} variant="outline" size="sm" className="text-base py-4">
                    Dev: Set timer to 5 seconds
                  </Button>
                </div>
              </div>
            </div>
          </CarouselItem>

          {/* Slide 2: Now Playing */}
          <CarouselItem className="flex items-center justify-center h-screen bg-background relative">
            {/* Back to Home Button */}
            <Button onClick={() => api?.scrollTo(0)} variant="outline" size="lg" className="absolute top-6 left-6 z-10 text-lg px-6 py-3">
              <ArrowLeft className="w-6 h-6 mr-2" />
              Home
            </Button>

            <div className="flex flex-col items-center justify-center text-center gap-8 px-8">
              {!nowPlaying?.connected ? <>
                  <div className="w-96 h-96 flex items-center justify-center rounded-2xl bg-muted/20">
                    <span className="text-9xl">🎵</span>
                  </div>
                  <h2 className="text-5xl font-extrabold text-foreground">
                    Connect Spotify
                  </h2>
                  <p className="text-2xl text-muted-foreground max-w-2xl">
                    Sign in to Spotify to display what you're currently listening to on the kiosk
                  </p>
                  <Button onClick={async () => {
                try {
                  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify-auth`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
                    },
                    body: JSON.stringify({
                      action: 'authorize',
                      state: window.location.origin
                    })
                  });
                  const data = await res.json();
                  if (data.authUrl) {
                    window.location.href = data.authUrl;
                  }
                } catch (error) {
                  console.error('Failed to start Spotify auth:', error);
                  toast.error('Failed to connect to Spotify');
                }
              }} size="lg" className="w-80 h-20 text-2xl font-bold rounded-2xl bg-[#1DB954] hover:bg-[#1ed760] text-white">
                    Connect Spotify
                  </Button>
                </> : <>
                  {nowPlaying?.image ? <img src={nowPlaying.image} alt="Album Art" className="w-[500px] h-[500px] rounded-2xl shadow-xl object-cover" /> : <div className="w-96 h-96 flex items-center justify-center rounded-2xl bg-muted/20">
                      <span className="text-9xl">🎵</span>
                    </div>}
                  <h2 className="text-5xl font-extrabold text-foreground">
                    {nowPlaying?.title || "Not Playing"}
                  </h2>
                  <p className="text-3xl text-muted-foreground">
                    {nowPlaying?.artist || "—"}
                  </p>
                  <p className="text-xl text-muted-foreground/60">
                    {nowPlaying?.playing ? "Now Playing" : "Paused / Not Playing"}
                  </p>
                </>}
            </div>
          </CarouselItem>

          {/* Slide 3: Detailed Weather */}
          <CarouselItem className="h-screen bg-background relative">
            {/* Back to Home Button */}
            <Button onClick={() => api?.scrollTo(0)} variant="outline" size="lg" className="absolute top-6 left-6 z-10 text-lg px-6 py-3">
              <ArrowLeft className="w-6 h-6 mr-2" />
              Home
            </Button>

            <div className="h-screen overflow-y-auto p-12 pt-20">
              <div className="w-full px-8 space-y-8">
                {/* Header */}
                <div className="text-center space-y-3">
                  <h1 className="text-6xl font-extrabold text-foreground">Weather Details</h1>
                  <p className="text-2xl text-muted-foreground">Fort Greene, NY</p>
                </div>

                {/* Current Conditions */}
                <div className="bg-card border-2 border-border rounded-2xl p-10">
                  <h2 className="text-4xl font-bold text-foreground mb-6">Current Conditions</h2>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="flex items-center gap-6">
                      {getWeatherIcon(weather?.weatherCode || null, 20)}
                      <div>
                        <div className="text-7xl font-black text-foreground">
                          {weather?.temperature ? `${weather.temperature}°F` : '--°'}
                        </div>
                        <div className="text-2xl text-muted-foreground mt-2">
                          {getWeatherDescription(weather?.weatherCode || null)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col justify-center">
                      <div className="text-xl text-muted-foreground">Feels Like</div>
                      <div className="text-5xl font-bold text-foreground mt-2">
                        {detailedWeather?.current_apparent ? `${Math.round(detailedWeather.current_apparent)}°F` : '--°'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hourly Forecast (Next 12 hours) */}
                <div className="bg-card border-2 border-border rounded-2xl p-8">
                  <h2 className="text-4xl font-bold text-foreground mb-6">Hourly Forecast</h2>
                  <div className="grid grid-cols-6 gap-6">
                    {detailedWeather?.hourly?.time.slice(0, 12).map((time: string, idx: number) => {
                    const hour = new Date(time).getHours();
                    const temp = detailedWeather.hourly.temperature_2m[idx];
                    const code = detailedWeather.hourly.weather_code[idx];
                    return <div key={time} className="text-center space-y-3 p-4 rounded-lg bg-background">
                          <div className="text-lg font-semibold text-muted-foreground">
                            {hour === 0 ? '12AM' : hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`}
                          </div>
                          <div className="flex justify-center">
                            {getWeatherIcon(code, 12)}
                          </div>
                          <div className="text-3xl font-bold text-foreground">
                            {Math.round(temp)}°
                          </div>
                        </div>;
                  })}
                  </div>
                </div>

                {/* 5-Day Forecast */}
                <div className="bg-card border-2 border-border rounded-2xl p-8">
                  <h2 className="text-4xl font-bold text-foreground mb-6">5-Day Forecast</h2>
                  <div className="space-y-4">
                    {detailedWeather?.daily?.time.map((date: string, idx: number) => {
                    const maxTemp = detailedWeather.daily.temperature_2m_max[idx];
                    const minTemp = detailedWeather.daily.temperature_2m_min[idx];
                    const code = detailedWeather.daily.weather_code[idx];
                    return <div key={date} className="flex items-center justify-between p-6 bg-background rounded-lg">
                          <div className="flex items-center gap-8 flex-1">
                            <div className="w-32 text-2xl font-semibold text-foreground">
                              {idx === 0 ? 'Today' : formatDay(date)}
                            </div>
                            <div className="flex items-center gap-4">
                              {getWeatherIcon(code, 10)}
                              <span className="text-xl text-muted-foreground">
                                {getWeatherDescription(code)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 text-2xl">
                            <span className="text-muted-foreground">L: {Math.round(minTemp)}°</span>
                            <span className="font-bold text-foreground">H: {Math.round(maxTemp)}°</span>
                          </div>
                        </div>;
                  })}
                  </div>
                </div>
              </div>
            </div>
          </CarouselItem>

          {/* Electricity Screen */}
          <CarouselItem className="h-screen">
            <Electricity onBack={() => {
            api?.scrollTo(0);
            setTimerPaused(false);
          }} />
          </CarouselItem>
        </CarouselContent>
        
        <CarouselPrevious className="left-4" />
        <CarouselNext className="right-4" />
      </Carousel>

      <WalkDialog open={isDialogOpen} onConfirm={handleWalkConfirm} onCancel={() => setIsDialogOpen(false)} />
    </>;
};
export default Index;