
-- 1. Drop policies (public + storage) that reference app_role
DROP POLICY IF EXISTS "Activity: author or manager delete" ON public.activity_log;
DROP POLICY IF EXISTS "Activity: author or manager update" ON public.activity_log;
DROP POLICY IF EXISTS "Financials: privileged only" ON public.candidate_financials;
DROP POLICY IF EXISTS "Sales/managers manage clients" ON public.clients;
DROP POLICY IF EXISTS "Pipeline delete" ON public.demand_candidates;
DROP POLICY IF EXISTS "Pipeline insert" ON public.demand_candidates;
DROP POLICY IF EXISTS "Pipeline update" ON public.demand_candidates;
DROP POLICY IF EXISTS "Pipeline view" ON public.demand_candidates;
DROP POLICY IF EXISTS "Demands: assignees + privileged update" ON public.demands;
DROP POLICY IF EXISTS "Demands: assignees + privileged view" ON public.demands;
DROP POLICY IF EXISTS "Demands: managers delete" ON public.demands;
DROP POLICY IF EXISTS "Demands: sales/managers create" ON public.demands;
DROP POLICY IF EXISTS "Talent Hub: managers delete" ON public.talent_hub_cvs;
DROP POLICY IF EXISTS "Talent Hub: sourcing+ insert" ON public.talent_hub_cvs;
DROP POLICY IF EXISTS "Talent Hub: sourcing+ update" ON public.talent_hub_cvs;
DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "CVs: managers delete" ON storage.objects;
DROP POLICY IF EXISTS "CVs: sourcing+ update" ON storage.objects;
DROP POLICY IF EXISTS "CVs: sourcing+ upload" ON storage.objects;

-- 2. Drop helper functions
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.has_any_role(uuid, public.app_role[]);

-- 3. Rebuild enum
ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM (
  'sourcing_team', 'division_manager', 'division_director', 'ceo', 'admin'
);
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role
  USING (
    CASE role::text
      WHEN 'sourcing' THEN 'sourcing_team'
      WHEN 'manager'  THEN 'division_manager'
      WHEN 'sales'    THEN 'division_director'
      WHEN 'admin'    THEN 'admin'
      ELSE 'sourcing_team'
    END
  )::public.app_role;
DROP TYPE public.app_role_old;

-- 4. Helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated, service_role;

-- 5. handle_new_user uses new role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'sourcing_team');
  SELECT count(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Recreate policies

CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers manage clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['division_manager','division_director','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['division_manager','division_director','admin']::public.app_role[]));

CREATE POLICY "Demands: privileged + assignee view" ON public.demands FOR SELECT TO authenticated
  USING (assigned_to = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['division_manager','division_director','ceo','admin']::public.app_role[]));
CREATE POLICY "Demands: managers create" ON public.demands FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]));
CREATE POLICY "Demands: assignee + manager update" ON public.demands FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]))
  WITH CHECK (assigned_to = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]));
CREATE POLICY "Demands: managers delete" ON public.demands FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]));

CREATE POLICY "Talent Hub: sourcing+ insert" ON public.talent_hub_cvs FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['sourcing_team','division_manager','division_director','admin']::public.app_role[]));
CREATE POLICY "Talent Hub: sourcing+ update" ON public.talent_hub_cvs FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['sourcing_team','division_manager','division_director','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['sourcing_team','division_manager','division_director','admin']::public.app_role[]));
CREATE POLICY "Talent Hub: managers delete" ON public.talent_hub_cvs FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]));

CREATE POLICY "Pipeline view" ON public.demand_candidates FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['division_manager','division_director','ceo','admin']::public.app_role[])
    OR EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_candidates.demand_id AND d.assigned_to = auth.uid())
  );
CREATE POLICY "Pipeline insert" ON public.demand_candidates FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[])
    OR (public.has_role(auth.uid(), 'sourcing_team')
        AND EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_candidates.demand_id AND d.assigned_to = auth.uid()))
  );
CREATE POLICY "Pipeline update" ON public.demand_candidates FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[])
    OR EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_candidates.demand_id AND d.assigned_to = auth.uid())
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[])
    OR EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_candidates.demand_id AND d.assigned_to = auth.uid())
  );
CREATE POLICY "Pipeline delete" ON public.demand_candidates FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]));

CREATE POLICY "Financials: read" ON public.candidate_financials FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['division_manager','division_director','ceo','admin']::public.app_role[]));
CREATE POLICY "Financials: insert" ON public.candidate_financials FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['division_manager','division_director','admin']::public.app_role[]));
CREATE POLICY "Financials: update" ON public.candidate_financials FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['division_manager','division_director','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['division_manager','division_director','admin']::public.app_role[]));
CREATE POLICY "Financials: delete" ON public.candidate_financials FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['division_director','admin']::public.app_role[]));

CREATE POLICY "Activity: author or manager update" ON public.activity_log FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]))
  WITH CHECK (author_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]));
CREATE POLICY "Activity: author or manager delete" ON public.activity_log FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]));

-- Storage: CVs bucket
CREATE POLICY "CVs: sourcing+ upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cvs' AND public.has_any_role(auth.uid(), ARRAY['sourcing_team','division_manager','division_director','admin']::public.app_role[]));
CREATE POLICY "CVs: sourcing+ update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cvs' AND public.has_any_role(auth.uid(), ARRAY['sourcing_team','division_manager','division_director','admin']::public.app_role[]));
CREATE POLICY "CVs: managers delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cvs' AND public.has_any_role(auth.uid(), ARRAY['division_manager','admin']::public.app_role[]));
