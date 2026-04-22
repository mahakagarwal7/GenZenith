ALTER TABLE public.volunteers
  ADD COLUMN IF NOT EXISTS contact_number text;

CREATE INDEX IF NOT EXISTS idx_volunteers_contact_number
  ON public.volunteers (contact_number);