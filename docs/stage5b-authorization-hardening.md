# Stage 5B — Authorization hardening (isolated draft only, NOT accepted)

Migrations: `0012_stage5b_authorization_hardening.sql`, `0013_stage5b_global_default_function_privileges.sql` (0012 left unchanged because it was already applied; 0013 corrects its ineffective default-privilege line).

## Findings
| # | Area | Severity | Finding | Fix |
|---|------|----------|---------|-----|
| F1 | has_role / has_any_role | Medium | SECURITY DEFINER, EXECUTE granted to PUBLIC (incl. anon). Any caller could probe any user's roles via `/rpc/has_role` (e.g. find admins). | Result is true only for own id, admin callers, service_role, or no-JWT internal contexts. EXECUTE revoked from PUBLIC/anon. All RLS uses `has_role(auth.uid(), …)` and triggers pass `auth.uid()`, so policies are unaffected. |
| F2 | list_team_members | Medium | Any authenticated user (incl. no-role / invited accounts) could enumerate ids+names of everyone with any role, incl. admins. | Returns rows only when caller holds a business role (sourceur/hrbp/operations/ceo); lists only business-role members. Admin and no-role get `[]`. |
| F3 | Trigger functions | Low | 6 SECURITY DEFINER trigger functions had PUBLIC/anon/authenticated EXECUTE (not invocable via RPC, but excess privilege). | Revoked; triggers still fire (EXECUTE is only checked at CREATE TRIGGER). |
| F4 | Default privileges | Low | `postgres` had no global function default entry, so new functions still got the built-in PUBLIC EXECUTE (the schema-specific REVOKE in 0012 does not override it). The `public` schema entry also granted `authenticated` EXECUTE automatically. | 0013: global `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`, plus a schema-level revoke for anon/authenticated in `public`. Result: new functions created by postgres → postgres + service_role only (storage keeps its own explicit grants). Built-in check creates and drops a throwaway function in the same transaction and fails if anon/authenticated can run it. New RPCs need an explicit GRANT. |
| — | search_path / ownership | OK | All SECURITY DEFINER functions owned by `postgres`, pinned `search_path=public`, fully-qualified tables. No dynamic SQL. | none |

## Default privileges after fix (pg_default_acl, owner postgres, functions)
- GLOBAL: `postgres=X` (PUBLIC removed)
- public: `postgres=X, service_role=X`
- storage: unchanged (anon/authenticated/service_role explicit)
- Roles owned by supabase_admin / supabase_auth_admin / supabase_storage_admin: unchanged. They aren't used by migrations, and postgres can't change them.

## Tests (real password sessions, local draft backend)
- `tests/security/stage5b_authorization.py`: 59/59 PASS (5 roles + multi-role + no-role + anon; RPC + REST; escalation attempts).
- Throwaway-function check: PASS. Anon and authenticated lacked EXECUTE, service_role had it, and the function was dropped (0 left).
- `stage5a_demands.py`: 107/107 PASS (incl. Stage 3 qualification, TJM approval, placement).
- `financial_confidentiality.py`: 47/47 PASS + activity-log leak checks PASS.
- Unit tests: 33/33 PASS.
- `stage3_regression.py`: not runnable — hardcoded fixture id from an older draft (pre-existing, unrelated).

## Rollback (new migration)
```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)) $$;
CREATE OR REPLACE FUNCTION public.list_team_members() RETURNS TABLE(id uuid, full_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT p.id, p.full_name FROM public.profiles p WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id) ORDER BY p.full_name NULLS LAST $$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role), public.has_any_role(uuid, app_role[]) TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
```
Undo 0013:
```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
```
(Trigger-function revokes need no rollback. The 0012 schema-level PUBLIC/anon revoke had no effect, so it needs no undo.)

## Consequences
- Sign-in, invitations, role management and dashboards: no change. They use existing functions with explicit grants, server-side admin calls (service_role), or table access controlled by RLS.
- Future work: every new function the app calls must include `GRANT EXECUTE … TO authenticated` (or anon) explicitly, otherwise calls fail with permission denied.
- `stage5a_demands.py` runs only once per draft; to run it again, remove its candidate fixture first (done here as Operations through the API).

## Merge readiness
Ready for review. Not accepted, not deployed. Stage 5 not declared complete. Residual: refresh `stage3_regression.py` fixtures; email/invite tracking still pending.
