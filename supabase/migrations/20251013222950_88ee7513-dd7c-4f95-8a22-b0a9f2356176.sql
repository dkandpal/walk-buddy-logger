-- Create walks table to track who walked the dog and when
CREATE TABLE public.walks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  walked_by TEXT[] NOT NULL,
  walked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_walks_walked_at ON public.walks(walked_at DESC);

-- Enable RLS (public app, no auth needed)
ALTER TABLE public.walks ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read walks
CREATE POLICY "Anyone can view walks"
ON public.walks
FOR SELECT
USING (true);

-- Allow anyone to insert walks
CREATE POLICY "Anyone can insert walks"
ON public.walks
FOR INSERT
WITH CHECK (true);