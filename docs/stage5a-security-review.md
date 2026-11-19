# Stage 5A — isolated demand RLS remediation

## Isolation and scope
The drafts tool confirmed the current **Stage 5A — Demand RLS security fix** draft has its own test database. Catalog inspection used this draft's managed psql connection. API tests refused any backend whose hostname was not exactly localhost or 127.0.0.1, used runtime draft configuration (never repository .env), and never contacted production.

Existing `db/seed.sql` supplied eight invented example accounts and synthetic business rows. No real records were copied. Real password sessions were obtained for Sourceur, second Sourceur, HRBP, Operations, CEO, Admin-only and no-role; no service-role bearer was used in authorization tests. The synthetic candidate created by the workflow test remains in this draft for review; the test-created disposable demand was deleted through Operations' API session.

## Migration for review
`drizzle/migrations/0011_operations_only_demand_updates.sql` was created/applied by the migration tool against the isolated draft and recorded in its journal/snapshot. Generated client types refreshed automatically.

```sql
ALTER POLICY "Demands: update" ON public.demands
USING (public.has_role(auth.uid(), 'operations'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'operations'::public.app_role));
CREATE POLICY "Demands: operations update guard" ON public.demands
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'operations'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'operations'::public.app_role));
```

The existing permissive policy is narrowed and an additive restrictive guard also requires Operations. This prevents a future permissive UPDATE/ALL policy from accidentally reopening authenticated UPDATE. No SELECT/INSERT/DELETE policy, table grant, pipeline policy, trigger or business record was changed by the migration.

## Active catalog and privileged-path review
- Before: four demand policies; assigned Sourceur OR Operations satisfied UPDATE USING/WITH CHECK. After: five policies; UPDATE has Operations-only permissive and restrictive predicates. Demand SELECT still permits assigned Sourceur and HRBP/Operations/CEO.
- RLS enabled; not forced; table owner postgres. Effective authenticated SELECT/INSERT/UPDATE/DELETE privileges exist; anon has none; service_role has all. Grants alone do not confer business rights; RLS is evaluated under authenticated sessions.
- Demand triggers inspected: updated timestamp, outcome validation, demand activity history and assignment notifications. No trigger grants ordinary callers a direct demand-write bypass.
- All public function definitions and execute ACLs inspected. The only public SECURITY DEFINER function directly updating demands is `auto_close_demand_on_hire`, a trigger-returning function with authenticated/anon execution revoked, fixed public search_path, called by candidate stage transition. Stage 3 qualification/TJM/final-decision and placement checks still precede the legitimate automatic close. Owner/service-role bypass is intentional for system work; not used for authorization assertions.
- Other privileged functions: role predicates, team-list read RPC, signup profile handler, role auditing/guards, candidate decision/TJM triggers and activity/notification triggers. No directly callable scalar/table-returning demand-management RPC was found. Trigger-returning functions cannot be called as ordinary mutation RPCs. Admin server actions concern user administration, not demand editing.

## Exact test evidence
`python3 tests/security/stage5a_demands.py`: **107 PASS, 0 FAIL**. Detailed case-by-case status and HTTP codes: `docs/stage5a-test-results.json`.

| Coverage | Result |
| --- | --- |
| Seven real password sessions | PASS |
| Sourceur SELECT assigned demand; other demand hidden | PASS |
| Sourceur/HRBP/CEO/Admin-only/no-role PATCH: title, description, skills, min/max budget, lifecycle, outcome, client association, assignment | PASS — blocked, full row read-back unchanged |
| Same five roles existing-row merge upsert | PASS — refused, full row unchanged |
| Same five roles self-grant Operations | PASS — blocked |
| Anonymous PATCH | PASS — refused, row unchanged |
| Operations each of those nine fields, upsert, create and delete | PASS |
| Sourceur candidate create/contact/screen/submit; other Sourceur edit denied | PASS |
| Sourceur/CEO/Admin qualification denied; HRBP qualification succeeds | PASS |
| Premature placement, TJM approval before qualification, final approval without TJM | PASS — blocked |
| Non-Operations financial edit/approval blocked; CEO SELECT only, other tested roles see no financial rows | PASS |
| Operations draft/qualified TJM approval at submitted; final decision | PASS |
| Non-Operations final decision | PASS — blocked |
| Edited approved TJM resets draft and active final decision | PASS |
| Sourceur placement after reapproval/reconfirmation and automatic filled/won/status=placed close | PASS |

Denied PATCH often returns HTTP 200 with an empty array because RLS filters the target row; tests assert unchanged complete rows via Operations read-back, not HTTP status alone. Upsert denial is verified on a real existing synthetic record. Operations checks assert an affected row and exact values. Test-created workflow records are application API actions, not privileged fixture inserts.

Unit regression: **33 PASS, 0 FAIL**, 3 files (12 permissions, 14 dashboard/workspace KPI, 7 Stage 3 decisions). Harness compilation **build OK**, last checked `2026-11-19T10:08:18Z`. No manual build command. No browser workflow run in this pass; the end-to-end Stage 3 checks were direct authenticated API flows. Historical hard-coded Stage 3 concurrency scripts were not rerun, and concurrency is not newly certified here.

## Reproduction and backup
Run the script once on a fresh isolated draft whose database has replayed `db/seed.sql`; it refuses non-local API URLs. Use the recorded seed and migrations to recreate the same fixtures. Do not rerun blindly on the completed placement: existing candidate uniqueness and changed demand state require a fresh isolated database. Before any future acceptance, capture live policy definitions, RLS flags, grants and dependent trigger/function definitions under a separate approved read-only review. Keep backup credentials private and compare the live baseline to this reviewed snapshot; do not assume it is identical.

## Rollback instructions (not executed)
Use a separately reviewed reverse migration in isolation first. Drop only `"Demands: operations update guard"` and restore `"Demands: update"` USING/WITH CHECK to:

```sql
((assigned_to = auth.uid() AND public.has_role(auth.uid(), 'sourceur'::public.app_role))
 OR public.has_role(auth.uid(), 'operations'::public.app_role))
```

Apply both changes atomically through the migration tool, without changing historical migration files or touching pipeline policies. This rollback deliberately restores the original vulnerability; it is not a secure final state. A policy rollback does not undo synthetic workflow data. Prefer deleting this unaccepted draft if abandoning the experiment. Do not run rollback or production changes without the corresponding approval.

## Remaining review items and readiness
No failed demand UPDATE/upsert or Stage 3 functional checks in this tested scope. The original discrepancy is remediated in this draft only.

Pre-existing review items, not changed:
- `has_role`/`has_any_role` accept arbitrary user IDs and have PUBLIC execute grants, potentially exposing role-membership booleans. They do not assign roles or bypass this demand UPDATE policy.
- `list_team_members()` returns role-bearing users' IDs/names to any authenticated caller, including no-role; review whether that visibility matches the intended directory policy.
- Several trigger-only SECURITY DEFINER functions retain PUBLIC execute grants. They cannot be called as ordinary mutation functions, but least-privilege cleanup warrants a separate reviewed scope.
- UI read-only affordances, wider permission coverage, invitation acceptance tracking and fresh concurrent Stage 3 verification remain separate work. Stage 5 is **not complete**.

Ready for review of Stage 5A's recorded migration and evidence; not accepted and not deployed. Accepting would apply this recorded migration to the app, while this draft's synthetic rows never transfer. No acceptance was queued.