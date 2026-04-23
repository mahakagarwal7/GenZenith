ALTER TABLE public.volunteers
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS city text;

CREATE INDEX IF NOT EXISTS idx_volunteers_full_name
  ON public.volunteers (full_name);

CREATE INDEX IF NOT EXISTS idx_volunteers_city
  ON public.volunteers (city);
