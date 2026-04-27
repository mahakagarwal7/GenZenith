CREATE POLICY "Public can view default NGO volunteers" ON public.volunteers FOR SELECT TO anon USING (ngo_id = 'ngo_default');
