-- Restore open access to walks table for household convenience
DROP POLICY IF EXISTS "Authenticated users can view walks" ON public.walks;
DROP POLICY IF EXISTS "Authenticated users can insert walks" ON public.walks;

-- Restore permissive policies for personal home use
CREATE POLICY "Anyone can view walks" ON public.walks
  FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can insert walks" ON public.walks
  FOR INSERT 
  WITH CHECK (true);