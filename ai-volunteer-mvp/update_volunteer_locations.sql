-- Update volunteers with real coordinates so they can be matched
UPDATE public.volunteers 
SET location = ST_SetSRID(ST_MakePoint(88.3639, 22.5726), 4326)::geography -- Central Kolkata
WHERE full_name = 'Rahul Sharma';

UPDATE public.volunteers 
SET location = ST_SetSRID(ST_MakePoint(88.3285, 22.5850), 4326)::geography -- Howrah
WHERE full_name = 'Priya Singh';
