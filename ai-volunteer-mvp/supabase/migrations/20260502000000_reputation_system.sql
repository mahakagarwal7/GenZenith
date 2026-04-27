-- Reputation and Gamification Schema (Startup-Level Enhancement)

-- 1. Create reputation_logs table
CREATE TABLE IF NOT EXISTS public.reputation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid REFERENCES public.volunteers(id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- 2. Add reputation_score to volunteers if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='volunteers' AND column_name='reputation_score') THEN
    ALTER TABLE public.volunteers ADD COLUMN reputation_score integer DEFAULT 0;
  END IF;
END $$;

-- 3. Trigger to update volunteer reputation_score on new log
CREATE OR REPLACE FUNCTION public.update_volunteer_reputation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.volunteers
  SET reputation_score = reputation_score + NEW.points
  WHERE id = NEW.volunteer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_reputation
AFTER INSERT ON public.reputation_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_volunteer_reputation();

-- 4. RLS for reputation_logs
ALTER TABLE public.reputation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "NGO members can view reputation logs in their NGO"
ON public.reputation_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.volunteers
    WHERE public.volunteers.id = public.reputation_logs.volunteer_id
    AND public.volunteers.ngo_id = public.get_my_ngo_id()
  )
);
