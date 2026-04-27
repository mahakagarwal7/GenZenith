INSERT INTO public.needs (
  need_id,
  source,
  submitted_at,
  location_geo,
  location_text,
  category,
  urgency,
  status,
  ngo_id,
  confidence,
  raw_text
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'whatsapp',
  now(),
  ST_SetSRID(ST_MakePoint(88.3467759, 22.585127), 4326)::geography,
  'Howrah Bridge, Kolkata',
  'medical',
  'critical',
  'unassigned',
  'ngo_default',
  0.95,
  'Emergency medical assistance needed at Howrah Bridge.'
) ON CONFLICT (need_id) DO UPDATE SET status = 'unassigned';
