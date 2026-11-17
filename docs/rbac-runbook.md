# RBAC refactoring — migration & rollback runbook

## Applied (Stage 1, shared database, 17 Nov 2026)
- `drizzle/migrations/0000_rbac_add_roles.sql` — adds enum values sourceur, hrbp, operations.
- `drizzle/migrations/0001_rbac_remap_and_policies.sql` — backup to `user_roles_backup_rbac`, role remap,
  role audit (`role_audit_log`), last-admin guard, no default role on signup, rewritten RLS + `cvs` storage policies.
- Data change: removed sourceur + operations from e.habib@itroad.ma (Admin only, per decision).

Mapping: sourcing_team→sourceur, division_manager→hrbp, division_director→operations, ceo/admin unchanged.
Old enum values remain (Postgres cannot drop enum values) but are not referenced by any policy.

## Verification
- `tests/security/rls_role_matrix.sql`: runs as `authenticated` with real JWT claims per role, self-rolls-back.
- `bunx vitest run src/lib/permissions.test.ts`.

## Rollback
1. Restore role rows:
   `DELETE FROM user_roles WHERE role IN ('sourceur','hrbp','operations');`
   `INSERT INTO user_roles(id,user_id,role,created_at) SELECT id,user_id,role,created_at FROM user_roles_backup_rbac ON CONFLICT DO NOTHING;`
2. Re-apply the previous policies from `supabase/migrations/20260606104406_*.sql` and `20260607114513_*.sql` (policy sections).
3. Revert frontend commit "RBAC stage 1–2".
The last-admin trigger may need `ALTER TABLE user_roles DISABLE TRIGGER trg_prevent_last_admin` during step 1.

## Self-role-change guard (applied 17 Nov 2026, `0002_block_self_role_change.sql`)
- No signed-in user can add or remove their own roles; admins manage other accounts only.
- Verified: self-grant blocked, self-revoke blocked, granting another user allowed (auto-rolled-back test).
- Recovery with no second admin: run the role change from the backend SQL console (no signed-in user);
  it is recorded in role_audit_log with actor "System".
- Rollback: `DROP TRIGGER trg_prevent_self_role_change ON public.user_roles;`

## Isolated financial authorization test (17 Nov 2026)
Ran in draft "Financial RBAC test (isolated)" with its own test database; 5 synthetic users, synthetic rates.
Result: all checks PASS (see chat report). Production verified unchanged afterwards
(0 rate rows, 0 @test.local users, 7 role rows, 2 audit rows).
Recommended (not applied): REVOKE ALL on business tables FROM anon.
- Applied `0003_revoke_anon_business_tables.sql`: anon has no grants on business tables. Rollback: re-GRANT SELECT to anon (not recommended).

## Stage 3 — qualification & TJM approval (draft only, not yet in production)
Migration: `drizzle/migrations/0004_qualification_and_tjm_approval.sql` (applies to production only if the draft is accepted).
- All existing pipeline rows start qualification=pending, decision=pending; rows already `placed` keep their stage (placement not invalidated) with pending decision fields.
- All existing rates start tjm_status=draft (never auto-approved).
- Changing rates on an approved TJM resets it to draft; re-approval is a separate Operations step.
- Backend console (no signed-in user) bypasses these triggers for recovery.

Rollback:
```sql
DROP TRIGGER IF EXISTS trg_enforce_pipeline_decisions ON public.demand_candidates;
DROP TRIGGER IF EXISTS trg_enforce_tjm_approval ON public.candidate_financials;
DROP FUNCTION IF EXISTS public.enforce_pipeline_decisions();
DROP FUNCTION IF EXISTS public.enforce_tjm_approval();
-- Columns can stay (harmless) or be marked deprecated:
COMMENT ON COLUMN public.demand_candidates.qualification_status IS 'DEPRECATED: stage 3 rolled back';
COMMENT ON COLUMN public.candidate_financials.tjm_status IS 'DEPRECATED: stage 3 rolled back';
```

### Stage 3 final corrections (draft only)
- `0005_tjm_audit_previous_approval.sql`: editing an approved TJM resets it to draft (even if `approved` is sent in the same update) and logs previous approver/date and old/new rates.
- `0006_restrict_tjm_activity_entries.sql`: `tjm_approval` history entries (contain rates) readable only by operations/ceo.
- Financials page lists candidates with qualification `qualified` at any stage, plus historical offer/placed rows; fixed one-to-one financials display bug (values previously shown as "—").
- Known gap: a final decision already `approved` stays approved if its TJM is later edited back to draft.

Full rollback (in order):
1. Code: revert the Stage 3 commits in this draft (or delete the draft before accepting — nothing reaches production until accept).
2. Database, if already accepted:
```sql
DROP POLICY IF EXISTS "Activity: business read" ON public.activity_log;
CREATE POLICY "Activity: business read" ON public.activity_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[]));
-- then the Stage 3 rollback block above (drops both triggers + functions; 0005 only redefines enforce_tjm_approval)
```
3. Access policies on candidate_financials, user_roles and storage are unchanged by Stage 3; no rollback needed.
4. Data: new columns are additive; historical stages and rates are untouched, so no data restore is required.

### TJM amendment invalidates final approval (`0007_tjm_amendment_resets_final_decision.sql`, draft only)
- Operations edits an approved TJM → TJM draft; if candidature final_decision=approved and stage≠placed, final_decision → pending in the same transaction; audit keeps previous approver/time/notes and old rates.
- Placed candidates: stage and decision untouched; `candidate_financials.amendment_pending=true` until Operations reapproves the TJM.
- Final approval locks the financial row (`FOR UPDATE`) and TJM edits lock the candidature, so concurrent requests serialize.
- `qualification` / `final_decision` / `tjm_approval` audit rows are system-written only and immutable for signed-in users.
- Regression: `tests/security/stage3_regression.py`, `tests/security/financial_confidentiality.py` (draft backend only).
Rollback: `DROP TRIGGER trg_protect_decision_audit ON public.activity_log; DROP FUNCTION public.protect_decision_audit();` then re-run function bodies from 0005 (enforce_tjm_approval) and 0004 (enforce_pipeline_decisions); `amendment_pending` column can stay (mark DEPRECATED).
