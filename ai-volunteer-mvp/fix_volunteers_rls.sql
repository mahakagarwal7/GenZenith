-- Allow public (anon) read access for volunteers in the default NGO
CREATE POLICY "Public can view default NGO volunteers"
ON public.volunteers FOR SELECT
TO anon
USING (ngo_id = 'ngo_default');

-- Seed some test volunteers for the dashboard
INSERT INTO public.volunteers (full_name, contact_number, skills, status, city, ngo_id, reputation_score)
VALUES 
('Rahul Sharma', '+919876543210', ARRAY['medical', 'first_aid'], 'available', 'Kolkata', 'ngo_default', 95),
('Priya Singh', '+919876543211', ARRAY['logistics', 'driving'], 'available', 'Howrah', 'ngo_default', 88),
('Amit Patel', '+919876543212', ARRAY['water_supply', 'plumbing'], 'busy', 'Kolkata', 'ngo_default', 72),
('Sneha Reddy', '+919876543213', ARRAY['food', 'cooking'], 'available', 'Salt Lake', 'ngo_default', 91)
ON CONFLICT DO NOTHING;
