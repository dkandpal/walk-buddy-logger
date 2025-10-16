-- Create table to store Spotify access tokens
CREATE TABLE IF NOT EXISTS public.spotify_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.spotify_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read tokens (since we're using a single token for the kiosk)
CREATE POLICY "Anyone can read spotify tokens"
  ON public.spotify_tokens
  FOR SELECT
  USING (true);

-- Allow anyone to insert tokens
CREATE POLICY "Anyone can insert spotify tokens"
  ON public.spotify_tokens
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update tokens
CREATE POLICY "Anyone can update spotify tokens"
  ON public.spotify_tokens
  FOR UPDATE
  USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.spotify_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();