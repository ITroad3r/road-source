-- 1. Backup (idempotent)
CREATE TABLE IF NOT EXISTS public.user_roles_backup_rbac (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.user_roles_backup_rbac TO service_role;
ALTER TABLE public.user_roles_backup_rbac ENABLE ROW LEVEL SECURITY;
INSERT INTO public.user_roles_backup_rbac (id, user_id, role, created_at)
SELECT id, user_id, role, created_at FROM public.user_roles r
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles_backup_rbac b WHERE b.id = r.id);

-- 2. Role audit table
CREATE TABLE IF NOT EXISTS public.role_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.role_audit_log TO authenticated;
GRANT ALL ON public.role_audit_log TO service_role;
ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Role audit: admins read" ON public.role_audit_log;
CREATE POLICY "Role audit: admins read" ON public.role_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.role_audit_log (target_user_id, role, action, actor_id) VALUES (NEW.user_id, NEW.role, 'granted', auth.uid());
    RETURN NEW;
  ELSE
    INSERT INTO public.role_audit_log (target_user_id, role, action, actor_id) VALUES (OLD.user_id, OLD.role, 'revoked', auth.uid());
    RETURN OLD;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'admin' AND (SELECT count(*) FROM public.user_roles WHERE role = 'admin' AND id <> OLD.id) = 0 THEN
    RAISE EXCEPTION 'Cannot remove the last administrator';
  END IF;
  RETURN OLD;
END; $$;

-- 3. Map old roles -> new roles (no escalation)
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT r.user_id, m.new_role::public.app_role
FROM public.user_roles r
JOIN (VALUES ('sourcing_team','sourceur'),('division_manager','hrbp'),('division_director','operations')) AS m(old_role,new_role)
  ON r.role::text = m.old_role
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id = r.user_id AND x.role::text = m.new_role);

DELETE FROM public.user_roles WHERE role IN ('sourcing_team','division_manager','division_director');

COMMENT ON TABLE public.user_roles_backup_rbac IS 'Snapshot of user_roles before RBAC refactoring; used for rollback';

-- Triggers installed after mapping so the remap is not audited as user actions
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();
DROP TRIGGER IF EXISTS trg_prevent_last_admin ON public.user_roles;
CREATE TRIGGER trg_prevent_last_admin BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- 4. New users: no business role by default (first user bootstrap = admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  SELECT count(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;

-- 5. Drop all existing policies on business tables, then recreate
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN
      ('clients','demands','demand_candidates','candidate_financials','talent_hub_cvs','generated_cvs','activity_log','profiles')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'CVs:%'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- clients
CREATE POLICY "Clients: business read" ON public.clients FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[]));
CREATE POLICY "Clients: operations insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Clients: operations update" ON public.clients FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'operations')) WITH CHECK (public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Clients: operations delete" ON public.clients FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'operations'));

-- demands
CREATE POLICY "Demands: read" ON public.demands FOR SELECT TO authenticated
  USING ((assigned_to = auth.uid() AND public.has_role(auth.uid(), 'sourceur'))
    OR public.has_any_role(auth.uid(), ARRAY['hrbp','operations','ceo']::public.app_role[]));
CREATE POLICY "Demands: operations insert" ON public.demands FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Demands: update" ON public.demands FOR UPDATE TO authenticated
  USING ((assigned_to = auth.uid() AND public.has_role(auth.uid(), 'sourceur')) OR public.has_role(auth.uid(), 'operations'))
  WITH CHECK ((assigned_to = auth.uid() AND public.has_role(auth.uid(), 'sourceur')) OR public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Demands: operations delete" ON public.demands FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'operations'));

-- demand_candidates
CREATE POLICY "Pipeline: read" ON public.demand_candidates FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['hrbp','operations','ceo']::public.app_role[])
    OR (public.has_role(auth.uid(), 'sourceur') AND EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_id AND d.assigned_to = auth.uid())));
CREATE POLICY "Pipeline: insert" ON public.demand_candidates FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['hrbp','operations']::public.app_role[])
    OR (public.has_role(auth.uid(), 'sourceur') AND EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_id AND d.assigned_to = auth.uid())));
CREATE POLICY "Pipeline: update" ON public.demand_candidates FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['hrbp','operations']::public.app_role[])
    OR (public.has_role(auth.uid(), 'sourceur') AND EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_id AND d.assigned_to = auth.uid())))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['hrbp','operations']::public.app_role[])
    OR (public.has_role(auth.uid(), 'sourceur') AND EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_id AND d.assigned_to = auth.uid())));
CREATE POLICY "Pipeline: operations delete" ON public.demand_candidates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'operations'));

-- candidate_financials (confidential)
CREATE POLICY "Financials: read" ON public.candidate_financials FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['operations','ceo']::public.app_role[]));
CREATE POLICY "Financials: operations insert" ON public.candidate_financials FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Financials: operations update" ON public.candidate_financials FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'operations')) WITH CHECK (public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Financials: operations delete" ON public.candidate_financials FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'operations'));

-- talent_hub_cvs
CREATE POLICY "Talent Hub: read" ON public.talent_hub_cvs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[]));
CREATE POLICY "Talent Hub: insert" ON public.talent_hub_cvs FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]));
CREATE POLICY "Talent Hub: update" ON public.talent_hub_cvs FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]));
CREATE POLICY "Talent Hub: operations delete" ON public.talent_hub_cvs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'operations'));

-- generated_cvs
CREATE POLICY "Generated CVs: read" ON public.generated_cvs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[]));
CREATE POLICY "Generated CVs: insert" ON public.generated_cvs FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]));
CREATE POLICY "Generated CVs: delete" ON public.generated_cvs FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]));

-- activity_log
CREATE POLICY "Activity: business read" ON public.activity_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[]));
CREATE POLICY "Activity: insert as self" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]));
CREATE POLICY "Activity: author or operations update" ON public.activity_log FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'operations'))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Activity: author or operations delete" ON public.activity_log FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'operations'));

-- profiles
CREATE POLICY "Profiles: self or privileged read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_any_role(auth.uid(), ARRAY['hrbp','operations','ceo','admin']::public.app_role[]));
CREATE POLICY "Profiles: insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles: update own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- storage: cvs bucket
CREATE POLICY "CVs: business read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cvs' AND public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[]));
CREATE POLICY "CVs: upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cvs' AND public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]));
CREATE POLICY "CVs: update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cvs' AND public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]));
CREATE POLICY "CVs: delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cvs' AND public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]));