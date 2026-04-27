-- Upgrade matching logic to use a weighted score (Startup-Level Enhancement)

DROP FUNCTION IF EXISTS public.match_volunteers_for_need(double precision, double precision, integer, text, integer);

CREATE OR REPLACE FUNCTION public.match_volunteers_for_need(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters integer DEFAULT 20000,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  location text,
  skills text[],
  historical_response_rate double precision,
  typical_capacity integer,
  total_assignments integer,
  active_tasks integer,
  contact_number text,
  city text,
  region text,
  match_score double precision
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_max_dist double precision := COALESCE(p_radius_meters, 50000);
BEGIN
  RETURN QUERY
  WITH candidate_pool AS (
    SELECT
      v.*,
      ST_Distance(
        v.location,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      ) as dist_meters
    FROM public.volunteers v
    WHERE v.status = 'available'
      AND v.location IS NOT NULL
      AND ST_DWithin(
        v.location,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        v_max_dist
      )
  )
  SELECT
    cp.id,
    ST_AsText(cp.location::geometry) AS location,
    cp.skills,
    cp.historical_response_rate,
    cp.typical_capacity,
    cp.total_assignments,
    cp.active_tasks,
    cp.contact_number,
    cp.city,
    cp.region,
    (
      -- 1. Proximity Score (0.0 to 1.0) - Exponential decay
      (0.4 * exp(-cp.dist_meters / 5000.0)) + 
      
      -- 2. Skill Match (0.3)
      (0.3 * CASE WHEN p_category = ANY(cp.skills) THEN 1.0 ELSE 0.2 END) +
      
      -- 3. Reputation / Reliability (0.2)
      (0.2 * cp.historical_response_rate) +
      
      -- 4. Workload Balancing (0.1)
      (0.1 * (1.0 - LEAST(1.0, cp.active_tasks::double precision / GREATEST(cp.typical_capacity, 1))))
    ) as match_score
  FROM candidate_pool cp
  ORDER BY 11 DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_volunteers_for_need(double precision, double precision, integer, text, integer)
TO anon, authenticated, service_role;
