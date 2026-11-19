CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
     AND (
       _user_id = auth.uid()
       OR coalesce(current_setting('request.jwt.claims', true), '') = ''
       OR coalesce(auth.role(), '') = 'service_role'
       OR EXISTS (SELECT 1 FROM public.user_roles a WHERE a.user_id = auth.uid() AND a.role = 'admin')
     )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
     AND (
       _user_id = auth.uid()
       OR coalesce(current_setting('request.jwt.claims', true), '') = ''
       OR coalesce(auth.role(), '') = 'service_role'
       OR EXISTS (SELECT 1 FROM public.user_roles a WHERE a.user_id = auth.uid() AND a.role = 'admin')
     )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_team_members()
 RETURNS TABLE(id uuid, full_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id
                  AND r.role IN ('sourceur','hrbp','operations','ceo'))
    AND EXISTS (SELECT 1 FROM public.user_roles c WHERE c.user_id = auth.uid()
                  AND c.role IN ('sourceur','hrbp','operations','ceo'))
  ORDER BY p.full_name NULLS LAST
$$;
REVOKE EXECUTE ON FUNCTION public.list_team_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_team_members() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.audit_user_roles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_pipeline_decisions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_tjm_approval() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_last_admin_removal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_decision_audit() FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;