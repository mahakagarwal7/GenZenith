-- ============================================================================
-- Migration: Enable RLS on predictions table
-- Date: 2026-04-22
-- ============================================================================
-- The predictions table needs RLS enabled.
-- Service role bypasses RLS automatically; this protects against anon/auth reads.

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- Coordinators and Admins can read predictions.
DROP POLICY IF EXISTS predictions_read_staff ON public.predictions;
CREATE POLICY predictions_read_staff
ON public.predictions
FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_coordinator());

-- Admins have full write access.
DROP POLICY IF EXISTS predictions_admin_all ON public.predictions;
CREATE POLICY predictions_admin_all
ON public.predictions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
