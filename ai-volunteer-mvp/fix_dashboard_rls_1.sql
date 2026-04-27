CREATE POLICY "Public can view default NGO needs" ON public.needs FOR SELECT TO anon USING (ngo_id = 'ngo_default');
