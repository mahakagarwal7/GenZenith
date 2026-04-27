-- Enable public (anon) read access for the default NGO so the dashboard is visible in local dev
CREATE POLICY "Public can view default NGO needs"
ON public.needs FOR SELECT
TO anon
USING (ngo_id = 'ngo_default');

-- Also allow public to view match logs for visibility
CREATE POLICY "Public can view default NGO match logs"
ON public.match_logs FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.needs
    WHERE public.needs.need_id = public.match_logs.need_id
    AND public.needs.ngo_id = 'ngo_default'
  )
);
