-- Add metadata column to needs table
ALTER TABLE public.needs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Ensure region column exists (it should have been added by a previous migration, but double check)
ALTER TABLE public.needs
  ADD COLUMN IF NOT EXISTS region text;

CREATE INDEX IF NOT EXISTS idx_needs_metadata_gin
  ON public.needs USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_needs_region
  ON public.needs (region);
