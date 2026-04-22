-- ============================================================================
-- Firestore -> Supabase PostgreSQL Migration
-- Project: NGO Volunteer Matching App
-- Date: 2026-04-22
-- ============================================================================
-- This migration is idempotent and safe to run multiple times.
-- It creates enums, extensions, tables, indexes, triggers, and RLS placeholders.

-- ============================================================================
-- 1) Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2) Enum Types
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'need_urgency') THEN
    CREATE TYPE public.need_urgency AS ENUM ('critical', 'urgent', 'normal', 'low');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'need_status') THEN
    CREATE TYPE public.need_status AS ENUM ('needs_validation', 'unassigned', 'pending_acceptance', 'assigned', 'completed');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'volunteer_status') THEN
    CREATE TYPE public.volunteer_status AS ENUM ('available', 'on-mission', 'offline');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'coordinator', 'volunteer');
  END IF;
END
$$;

-- ============================================================================
-- 3) Shared Trigger Function for updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4) Profiles Table (extends auth.users)
--    Firestore users -> auth.users + public.profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'volunteer',
  ngo_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 5) Volunteers Table (Firestore volunteers -> public.volunteers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.volunteers (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  location geography(Point, 4326),
  skills text[] NOT NULL DEFAULT '{}',
  status public.volunteer_status NOT NULL DEFAULT 'offline',
  historical_response_rate double precision NOT NULL DEFAULT 0,
  typical_capacity integer NOT NULL DEFAULT 0,
  total_assignments integer NOT NULL DEFAULT 0,
  active_tasks integer NOT NULL DEFAULT 0,
  last_active_hour integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteers_historical_response_rate_chk
    CHECK (historical_response_rate >= 0 AND historical_response_rate <= 1),
  CONSTRAINT volunteers_typical_capacity_chk
    CHECK (typical_capacity >= 0),
  CONSTRAINT volunteers_total_assignments_chk
    CHECK (total_assignments >= 0),
  CONSTRAINT volunteers_active_tasks_chk
    CHECK (active_tasks >= 0),
  CONSTRAINT volunteers_last_active_hour_chk
    CHECK (last_active_hour IS NULL OR (last_active_hour >= 0 AND last_active_hour <= 23))
);

DROP TRIGGER IF EXISTS trg_volunteers_set_updated_at ON public.volunteers;
CREATE TRIGGER trg_volunteers_set_updated_at
BEFORE UPDATE ON public.volunteers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6) Needs Table (Firestore needs_raw -> public.needs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.needs (
  need_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  location_geo geography(Point, 4326),
  location_text text,
  category text NOT NULL,
  subcategory text,
  urgency public.need_urgency NOT NULL,
  raw_text text NOT NULL,
  confidence double precision NOT NULL DEFAULT 0,
  status public.need_status NOT NULL DEFAULT 'needs_validation',
  assigned_to uuid,
  ngo_id text NOT NULL,
  contact_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT needs_confidence_chk CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT needs_source_chk CHECK (source IN ('whatsapp', 'sms'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'needs_assigned_to_fkey'
  ) THEN
    ALTER TABLE public.needs
      ADD CONSTRAINT needs_assigned_to_fkey
      FOREIGN KEY (assigned_to)
      REFERENCES public.volunteers(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_needs_set_updated_at ON public.needs;
CREATE TRIGGER trg_needs_set_updated_at
BEFORE UPDATE ON public.needs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 7) Match Logs Table (Firestore match_logs -> public.match_logs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.match_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id uuid NOT NULL,
  volunteer_id uuid,
  match_score double precision,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'match_logs_need_id_fkey'
  ) THEN
    ALTER TABLE public.match_logs
      ADD CONSTRAINT match_logs_need_id_fkey
      FOREIGN KEY (need_id)
      REFERENCES public.needs(need_id)
      ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'match_logs_volunteer_id_fkey'
  ) THEN
    ALTER TABLE public.match_logs
      ADD CONSTRAINT match_logs_volunteer_id_fkey
      FOREIGN KEY (volunteer_id)
      REFERENCES public.volunteers(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_match_logs_set_updated_at ON public.match_logs;
CREATE TRIGGER trg_match_logs_set_updated_at
BEFORE UPDATE ON public.match_logs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 8) Indexes
-- ============================================================================
-- Geo indexes (GiST)
CREATE INDEX IF NOT EXISTS idx_needs_location_geo_gist
  ON public.needs USING gist (location_geo);

CREATE INDEX IF NOT EXISTS idx_volunteers_location_gist
  ON public.volunteers USING gist (location);

-- JSONB index (GIN)
CREATE INDEX IF NOT EXISTS idx_match_logs_metadata_gin
  ON public.match_logs USING gin (metadata);

-- Common filter B-tree indexes
CREATE INDEX IF NOT EXISTS idx_needs_status
  ON public.needs (status);

CREATE INDEX IF NOT EXISTS idx_needs_urgency
  ON public.needs (urgency);

CREATE INDEX IF NOT EXISTS idx_needs_category
  ON public.needs (category);

CREATE INDEX IF NOT EXISTS idx_needs_ngo_id
  ON public.needs (ngo_id);

CREATE INDEX IF NOT EXISTS idx_needs_submitted_at
  ON public.needs (submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_needs_assigned_to
  ON public.needs (assigned_to);

CREATE INDEX IF NOT EXISTS idx_volunteers_status
  ON public.volunteers (status);

CREATE INDEX IF NOT EXISTS idx_volunteers_user_id
  ON public.volunteers (user_id);

CREATE INDEX IF NOT EXISTS idx_match_logs_need_id
  ON public.match_logs (need_id);

CREATE INDEX IF NOT EXISTS idx_match_logs_volunteer_id
  ON public.match_logs (volunteer_id);

CREATE INDEX IF NOT EXISTS idx_match_logs_timestamp
  ON public.match_logs ("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles (role);

CREATE INDEX IF NOT EXISTS idx_profiles_ngo_id
  ON public.profiles (ngo_id);

-- ============================================================================
-- 9) RLS Enablement + Policy Placeholders
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_logs ENABLE ROW LEVEL SECURITY;

-- RLS: volunteers can only read own volunteer profile
-- Example policy (to implement later):
-- CREATE POLICY volunteers_select_own
-- ON public.volunteers
-- FOR SELECT
-- USING (auth.uid() = user_id OR auth.uid() = id);

-- RLS: coordinators/admin can read all needs
-- Example policy (to implement later):
-- CREATE POLICY needs_select_coordinator_admin
-- ON public.needs
-- FOR SELECT
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.profiles p
--     WHERE p.id = auth.uid()
--       AND p.role IN ('coordinator', 'admin')
--   )
-- );

-- RLS: service role can write via backend; clients have limited direct writes
-- Define explicit INSERT/UPDATE/DELETE policies per role and flow.

-- RLS: match_logs read-only for coordinator/admin
-- Example policy (to implement later):
-- CREATE POLICY match_logs_select_coordinator_admin
-- ON public.match_logs
-- FOR SELECT
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.profiles p
--     WHERE p.id = auth.uid()
--       AND p.role IN ('coordinator', 'admin')
--   )
-- );

-- ============================================================================
-- 10) Compatibility View (optional helper during transition)
-- ============================================================================
-- Keeps a Firestore-like naming bridge for migration scripts/tools.
CREATE OR REPLACE VIEW public.needs_raw AS
SELECT
  need_id AS "needId",
  source,
  submitted_at AS "submittedAt",
  location_geo AS "location_geo",
  location_text AS "location_text",
  category,
  subcategory,
  urgency,
  raw_text AS "rawText",
  confidence,
  status,
  assigned_to AS "assignedTo",
  ngo_id AS "ngoId",
  contact_number AS "contactNumber",
  created_at,
  updated_at
FROM public.needs;

-- End of migration

-- ============================================================================
-- 11) Row Level Security (RLS) Policies
-- ============================================================================
-- Note:
-- - service_role bypasses RLS automatically.
-- - "Limited fields" for UPDATE are best enforced with application logic,
--   RPC functions, column privileges, or triggers. RLS is row-level, not column-level.

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.role() = 'authenticated' AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'coordinator'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_volunteer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'volunteer'
  );
$$;

-- Re-enable RLS explicitly for clarity in migration logs.
ALTER TABLE public.needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- Coordinators/Admins: full read/write access.
DROP POLICY IF EXISTS needs_staff_all ON public.needs;
CREATE POLICY needs_staff_all
ON public.needs
FOR ALL
TO authenticated
USING (public.is_admin() OR public.is_coordinator())
WITH CHECK (public.is_admin() OR public.is_coordinator());

-- Volunteers: read only the needs assigned to them.
DROP POLICY IF EXISTS needs_volunteer_select_assigned ON public.needs;
CREATE POLICY needs_volunteer_select_assigned
ON public.needs
FOR SELECT
TO authenticated
USING (public.is_volunteer() AND assigned_to = auth.uid());

-- ---------------------------------------------------------------------------
-- volunteers table
-- ---------------------------------------------------------------------------
-- Users can read/write only their own profile.
DROP POLICY IF EXISTS volunteers_self_select ON public.volunteers;
CREATE POLICY volunteers_self_select
ON public.volunteers
FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS volunteers_self_insert ON public.volunteers;
CREATE POLICY volunteers_self_insert
ON public.volunteers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS volunteers_self_update ON public.volunteers;
CREATE POLICY volunteers_self_update
ON public.volunteers
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Coordinators can read all volunteer profiles.
DROP POLICY IF EXISTS volunteers_coord_select_all ON public.volunteers;
CREATE POLICY volunteers_coord_select_all
ON public.volunteers
FOR SELECT
TO authenticated
USING (public.is_coordinator() OR public.is_admin());

-- Coordinators can update volunteer operational data.
-- NOTE: Column-level limits are not enforced by RLS alone; use app logic / triggers.
DROP POLICY IF EXISTS volunteers_coord_update ON public.volunteers;
CREATE POLICY volunteers_coord_update
ON public.volunteers
FOR UPDATE
TO authenticated
USING (public.is_coordinator() OR public.is_admin())
WITH CHECK (public.is_coordinator() OR public.is_admin());

-- Admins have full access.
DROP POLICY IF EXISTS volunteers_admin_all ON public.volunteers;
CREATE POLICY volunteers_admin_all
ON public.volunteers
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- match_logs table
-- ---------------------------------------------------------------------------
-- Coordinators/Admins: read only.
DROP POLICY IF EXISTS match_logs_read_staff ON public.match_logs;
CREATE POLICY match_logs_read_staff
ON public.match_logs
FOR SELECT
TO authenticated
USING (public.is_coordinator() OR public.is_admin());

-- Volunteers: no access by default (no policy created).

-- ---------------------------------------------------------------------------
-- profiles table
-- ---------------------------------------------------------------------------
-- Users can read their own profile.
DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
CREATE POLICY profiles_self_select
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Users can update their own profile, but app logic should restrict sensitive fields.
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Coordinators can read all volunteer profiles.
DROP POLICY IF EXISTS profiles_coord_select_volunteers ON public.profiles;
CREATE POLICY profiles_coord_select_volunteers
ON public.profiles
FOR SELECT
TO authenticated
USING ((public.is_coordinator() OR public.is_admin()) AND role = 'volunteer');

-- Admins have full access.
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all
ON public.profiles
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Testing note
-- ---------------------------------------------------------------------------
-- Test RLS locally with:
--   supabase db test
-- You can also verify policies in the Supabase SQL editor and by using
-- auth.uid() test contexts in your application or integration tests.
