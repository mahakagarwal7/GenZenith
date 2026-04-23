-- ============================================================================
-- Add volunteer matching RPC used by edge functions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_volunteers_for_need(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters integer DEFAULT 10000,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  location text,
  skills text[],
  historical_response_rate double precision,
  typical_capacity integer,
  total_assignments integer,
  active_tasks integer,
  contact_number text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.id,
    ST_AsText(v.location::geometry) AS location,
    v.skills,
    v.historical_response_rate,
    v.typical_capacity,
    v.total_assignments,
    v.active_tasks,
    v.contact_number
  FROM public.volunteers v
  WHERE v.status = 'available'
    AND v.location IS NOT NULL
    AND ST_DWithin(
      v.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_meters
    )
    AND (
      p_category IS NULL
      OR p_category = ''
      OR p_category = ANY(v.skills)
    )
  ORDER BY
    ST_Distance(
      v.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) ASC,
    v.historical_response_rate DESC,
    (v.typical_capacity - v.active_tasks) DESC,
    v.total_assignments ASC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_volunteers_for_need(double precision, double precision, integer, text, integer)
TO anon, authenticated, service_role;
