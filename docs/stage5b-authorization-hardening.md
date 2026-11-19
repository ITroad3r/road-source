# Stage 5B — Authorization hardening (isolated draft only, NOT accepted)

Migration: `drizzle/migrations/0012_stage5b_authorization_hardening.sql`

## Findings
| # | Area | Severity | Finding | Fix |
|---|------|----------|---------|-----|
| F1 | has_role / has_any_role | Medium | SECURITY DEFINER, EXECUTE granted to PUBLIC (incl. anon). Any caller could probe any user's roles via `/rpc/has_role` (e.g. find admins). | Result is true only for own id, admin callers, service_role, or no-JWT internal contexts. EXECUTE revoked from PUBLIC/anon. All RLS uses `has_role(auth.uid(), …)` and triggers pass `auth.uid()`, so policies are unaffected. |
| F2 | list_team_members | Medium | Any authenticated user (incl. no-role / invited accounts) could enumerate ids+names of everyone with any role, incl. admins. | Returns rows only when caller holds a business role (sourceur/hrbp/operations/ceo); lists only business-role members. Admin and no-role get `[]`. |
| F3 | Trigger functions | Low | 6 SECURITY DEFINER trigger functions had PUBLIC/anon/authenticated EXECUTE (not invocable via RPC, but excess privilege). | Revoked; triggers still fire (EXECUTE is only checked at CREATE TRIGGER). |
| F4 | Default privileges | Low | New functions would default to PUBLIC EXECUTE. | `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM PUBLIC, anon`. New RPCs must GRANT explicitly. |
| — | search_path / ownership | OK | All SECURITY DEFINER functions owned by `postgres`, pinned `search_path=public`, fully-qualified tables. No dynamic SQL. | none |

## Tests (real password sessions, local draft backend)
- `tests/security/stage5b_authorization.py`: 59/59 PASS (5 roles + multi-role + no-role + anon; RPC + REST; escalation attempts).
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
(Trigger-function revokes need no rollback.)

## Merge readiness
Ready for review. Not accepted, not deployed. Stage 5 not declared complete. Residual: refresh `stage3_regression.py` fixtures; email/invite tracking still pending.
