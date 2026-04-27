-- Multi-Tenancy and RBAC Migration (Startup-Level Enhancement)

-- 1. Helper function to get current user's NGO ID
CREATE OR REPLACE FUNCTION public.get_my_ngo_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT ngo_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Enable RLS on all relevant tables
ALTER TABLE public.needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Profiles Policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "NGO Admins can view profiles in their NGO" ON public.profiles;
CREATE POLICY "NGO Admins can view profiles in their NGO"
ON public.profiles FOR SELECT
TO authenticated
USING (ngo_id = public.get_my_ngo_id());

-- 4. Needs Policies (Tenancy Isolation)
DROP POLICY IF EXISTS "NGO members can manage their own needs" ON public.needs;
CREATE POLICY "NGO members can manage their own needs"
ON public.needs
FOR ALL
TO authenticated
USING (ngo_id = public.get_my_ngo_id())
WITH CHECK (ngo_id = public.get_my_ngo_id());

-- 5. Volunteers Policies (Tenancy Isolation)
DROP POLICY IF EXISTS "NGO members can manage their own volunteers" ON public.volunteers;
CREATE POLICY "NGO members can manage their own volunteers"
ON public.volunteers
FOR ALL
TO authenticated
USING (ngo_id = public.get_my_ngo_id())
WITH CHECK (ngo_id = public.get_my_ngo_id());

-- 6. Match Logs Policies
DROP POLICY IF EXISTS "NGO members can view their match logs" ON public.match_logs;
CREATE POLICY "NGO members can view their match logs"
ON public.match_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.needs
    WHERE public.needs.need_id = public.match_logs.need_id
    AND public.needs.ngo_id = public.get_my_ngo_id()
  )
);
