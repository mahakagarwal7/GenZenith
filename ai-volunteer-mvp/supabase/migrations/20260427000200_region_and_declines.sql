-- Add region support and basic decline cooldown tracking

ALTER TABLE public.needs
  ADD COLUMN IF NOT EXISTS region text;

CREATE INDEX IF NOT EXISTS idx_needs_region
  ON public.needs (region);

ALTER TABLE public.volunteers
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS ngo_id text;

CREATE INDEX IF NOT EXISTS idx_volunteers_region
  ON public.volunteers (region);

CREATE INDEX IF NOT EXISTS idx_volunteers_ngo_id
  ON public.volunteers (ngo_id);

-- Backfill: if region was never set, treat city as region (best-effort).
UPDATE public.volunteers
SET region = city
WHERE region IS NULL
  AND city IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.volunteer_declines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL REFERENCES public.volunteers(id) ON DELETE CASCADE,
  declined_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_volunteer_declines_active
  ON public.volunteer_declines (volunteer_id, expires_at);
