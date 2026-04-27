-- Seed a diverse set of volunteers across multiple sectors and regions
INSERT INTO public.volunteers (full_name, contact_number, skills, status, city, region, ngo_id, reputation_score, historical_response_rate, typical_capacity)
VALUES 
-- Medical Sector
('Dr. Arpita Das', '+919000000001', ARRAY['medical', 'doctor', 'first_aid', 'surgery'], 'available', 'Kolkata', 'West Bengal', 'ngo_default', 98, 0.95, 10),
('Sandeep Verma', '+919000000002', ARRAY['medical', 'ambulance', 'paramedic'], 'available', 'Behala', 'West Bengal', 'ngo_default', 92, 0.88, 5),

-- Logistics & Transport
('Karan Singh', '+919000000003', ARRAY['logistics', 'driving', 'truck', 'heavy_vehicle'], 'available', 'New Town', 'West Bengal', 'ngo_default', 85, 0.80, 8),
('Vikram Mehta', '+919000000004', ARRAY['logistics', 'motorcycle', 'delivery'], 'available', 'Salt Lake', 'West Bengal', 'ngo_default', 88, 0.90, 12),

-- Food & Water Supply
('Meera Iyer', '+919000000005', ARRAY['food', 'cooking', 'bulk_kitchen'], 'available', 'Garia', 'West Bengal', 'ngo_default', 90, 0.85, 20),
('Rajesh Khanna', '+919000000006', ARRAY['water_supply', 'plumbing', 'tanker_management'], 'available', 'Howrah', 'West Bengal', 'ngo_default', 82, 0.75, 6),

-- Technical & General Help
('Anita Bose', '+919000000007', ARRAY['it_support', 'communications', 'radio_operator'], 'available', 'Jadavpur', 'West Bengal', 'ngo_default', 94, 0.92, 4),
('Suresh Gopi', '+919000000008', ARRAY['general', 'labor', 'construction', 'rescue'], 'available', 'Dum Dum', 'West Bengal', 'ngo_default', 80, 0.70, 15);

-- Update them with real coordinates for matching
UPDATE public.volunteers SET location = ST_SetSRID(ST_MakePoint(88.3639, 22.5726), 4326)::geography WHERE full_name = 'Dr. Arpita Das';
UPDATE public.volunteers SET location = ST_SetSRID(ST_MakePoint(88.3149, 22.4988), 4326)::geography WHERE full_name = 'Sandeep Verma';
UPDATE public.volunteers SET location = ST_SetSRID(ST_MakePoint(88.4651, 22.5805), 4326)::geography WHERE full_name = 'Karan Singh';
UPDATE public.volunteers SET location = ST_SetSRID(ST_MakePoint(88.4146, 22.5855), 4326)::geography WHERE full_name = 'Vikram Mehta';
UPDATE public.volunteers SET location = ST_SetSRID(ST_MakePoint(88.3773, 22.4646), 4326)::geography WHERE full_name = 'Meera Iyer';
UPDATE public.volunteers SET location = ST_SetSRID(ST_MakePoint(88.3285, 22.5850), 4326)::geography WHERE full_name = 'Rajesh Khanna';
UPDATE public.volunteers SET location = ST_SetSRID(ST_MakePoint(88.3666, 22.4950), 4326)::geography WHERE full_name = 'Anita Bose';
UPDATE public.volunteers SET location = ST_SetSRID(ST_MakePoint(88.4067, 22.6231), 4326)::geography WHERE full_name = 'Suresh Gopi';
