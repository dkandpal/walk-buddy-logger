ALTER TABLE public.walks ADD COLUMN IF NOT EXISTS walk_type text NOT NULL DEFAULT 'pee_poop' CHECK (walk_type IN ('pee', 'pee_poop'));
ALTER TABLE public.walks ALTER COLUMN walked_by DROP NOT NULL;
ALTER TABLE public.walks ALTER COLUMN walked_by SET DEFAULT '{}'::text[];