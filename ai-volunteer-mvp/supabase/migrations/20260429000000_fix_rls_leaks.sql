-- Revoke anon access to fix RLS leak reported by test suite
DROP POLICY IF EXISTS needs_anon_read_live ON public.needs;
DROP POLICY IF EXISTS volunteers_anon_read_live ON public.volunteers;
DROP POLICY IF EXISTS match_logs_anon_read_live ON public.match_logs;

-- Re-enable Row Level Security to be safe
ALTER TABLE public.needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_logs ENABLE ROW LEVEL SECURITY;
