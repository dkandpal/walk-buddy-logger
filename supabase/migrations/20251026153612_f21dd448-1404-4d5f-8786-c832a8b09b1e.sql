-- Create prices table for storing electricity price data
CREATE TABLE IF NOT EXISTS public.electricity_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  zone TEXT NOT NULL DEFAULT 'J',
  lmp_usd_mwh DECIMAL(10, 4) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('real-time', 'day-ahead')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(timestamp, zone, source)
);

-- Create index for faster queries
CREATE INDEX idx_electricity_prices_timestamp_zone ON public.electricity_prices(timestamp DESC, zone);
CREATE INDEX idx_electricity_prices_zone_source ON public.electricity_prices(zone, source);

-- Create windows table for storing optimal time windows
CREATE TABLE IF NOT EXISTS public.electricity_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  zone TEXT NOT NULL DEFAULT 'J',
  label TEXT NOT NULL CHECK (label IN ('great', 'good', 'okay', 'avoid')),
  avg_price DECIMAL(10, 4),
  percentile INTEGER,
  duration_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_electricity_windows_time_zone ON public.electricity_windows(start_time DESC, zone);

-- Create user electricity preferences table
CREATE TABLE IF NOT EXISTS public.user_electricity_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  zip_code TEXT,
  iso_zone TEXT DEFAULT 'J',
  on_tou_plan BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT false,
  email_enabled BOOLEAN DEFAULT false,
  preferred_appliances TEXT[] DEFAULT ARRAY['dishwasher'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create alerts table
CREATE TABLE IF NOT EXISTS public.electricity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  rule_config JSONB NOT NULL,
  last_fired_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_electricity_alerts_user ON public.electricity_alerts(user_id, is_active);

-- Enable RLS on all tables
ALTER TABLE public.electricity_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electricity_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_electricity_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electricity_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for electricity_prices (public read)
CREATE POLICY "Anyone can read electricity prices"
  ON public.electricity_prices FOR SELECT
  USING (true);

-- RLS Policies for electricity_windows (public read)
CREATE POLICY "Anyone can read electricity windows"
  ON public.electricity_windows FOR SELECT
  USING (true);

-- RLS Policies for user_electricity_preferences
CREATE POLICY "Users can view their own preferences"
  ON public.user_electricity_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.user_electricity_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.user_electricity_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for electricity_alerts
CREATE POLICY "Users can view their own alerts"
  ON public.electricity_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own alerts"
  ON public.electricity_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
  ON public.electricity_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
  ON public.electricity_alerts FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at on user preferences
CREATE TRIGGER update_user_electricity_preferences_updated_at
  BEFORE UPDATE ON public.user_electricity_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create trigger for updated_at on alerts
CREATE TRIGGER update_electricity_alerts_updated_at
  BEFORE UPDATE ON public.electricity_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();