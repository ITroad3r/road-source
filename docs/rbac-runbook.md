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
