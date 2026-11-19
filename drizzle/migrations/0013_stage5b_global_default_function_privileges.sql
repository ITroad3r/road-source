-- Global (no IN SCHEMA) entry is required: schema-level REVOKE cannot remove the built-in PUBLIC EXECUTE default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Remove the schema-level authenticated grant on future public functions; new RPCs must GRANT explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- Self-check with a disposable function (dropped in the same transaction).
CREATE FUNCTION public.zz_stage5b_default_acl_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.zz_stage5b_default_acl_probe()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.zz_stage5b_default_acl_probe()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Default privilege check failed: new function is executable without explicit grant';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.zz_stage5b_default_acl_probe()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost default EXECUTE';
  END IF;
END $$;
DROP FUNCTION public.zz_stage5b_default_acl_probe();

-- Re-assert explicit grants on intentionally exposed RPCs.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_team_members() TO authenticated, service_role;