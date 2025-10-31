-- Fix 1: Spotify Tokens - Service Role Only Access
-- Drop all public policies so only edge functions with SERVICE_ROLE_KEY can access
DROP POLICY IF EXISTS "Anyone can insert spotify tokens" ON public.spotify_tokens;
DROP POLICY IF EXISTS "Anyone can read spotify tokens" ON public.spotify_tokens;
DROP POLICY IF EXISTS "Anyone can update spotify tokens" ON public.spotify_tokens;

-- Fix 2: Walks - Require Authentication
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Anyone can view walks" ON public.walks;
DROP POLICY IF EXISTS "Anyone can insert walks" ON public.walks;

-- Create policies requiring authentication for household members
CREATE POLICY "Authenticated users can view walks" ON public.walks
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert walks" ON public.walks
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');