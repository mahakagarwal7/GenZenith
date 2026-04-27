-- Allow read-only anon access for live frontend dashboards.
-- This enables browser clients using NEXT_PUBLIC_SUPABASE_ANON_KEY
-- to render realtime operational data without dummy content.

CREATE POLICY needs_anon_read_live
ON public.needs
FOR SELECT
TO anon
USING (true);

CREATE POLICY volunteers_anon_read_live
ON public.volunteers
FOR SELECT
TO anon
USING (true);

CREATE POLICY match_logs_anon_read_live
ON public.match_logs
FOR SELECT
TO anon
USING (true);
