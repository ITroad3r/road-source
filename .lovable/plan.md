# RoadSource — RBAC refactoring (impact assessment + plan)

## 1. Current-state audit (summary)
- Roles today: `sourcing_team`, `division_manager`, `division_director`, `ceo`, `admin` (enum `app_role`, table `user_roles`, functions `has_role` / `has_any_role`).
- Role checks are scattered: ~14 frontend files (sidebar, dashboards, admin, financials, reports, demands, clients) plus RLS on 9 tables and the `cvs` storage bucket.
- `admin` currently acts as a superuser: it is included in almost every write policy (demands, pipeline, financials, CVs). The spec says admin must NOT get operational/financial authority — this is the biggest behavioural change.
- `candidate_financials` has one `client_rate` with no approval state; anyone with write rights can change it at any time.
- No HRBP qualification step exists; pipeline goes identified → … → placed directly.
- Role changes are not audited.

## 2. Proposed permission matrix

| Capability | Sourceur | HRBP | Operations | CEO | Admin |
|---|---|---|---|---|---|
| View assigned demands | yes | yes | yes | read | no |
| View all demands / clients | no | yes | yes | read | no |
| Create / dispatch demands & clients | no | no* | yes | no | no |
| Create / edit candidates, upload CVs | yes | yes | yes | no | no |
| Add candidate to a demand (submit) | yes | yes | yes | no | no |
| Qualify / reject (HRBP step) | no | yes | yes | no | no |
| Final approve / reject candidature | no | no | yes | no | no |
| See candidate rate expectation | yes | yes | yes | read | no |
| See / set / approve company TJM & margins | no | no | yes | read | no |
| Generate branded CV | yes | yes | yes | no | no |
| Reports & executive dashboards | no | own scope | yes | read | no |
| Invite users, assign/revoke roles | no | no | no | no | yes |

`*` Demand creation was a Division Manager task. Flagged — see decision below.

## 3. Role mapping for existing users (proposed, no auto-escalation)
- `sourcing_team` → `sourceur`
- `division_manager` → `hrbp`
- `division_director` → `operations`
- `ceo` → `ceo` (loses any write access)
- `admin` → `admin` (loses operational/financial rights). Elias keeps admin; if he also needs operations rights, he must be given the `operations` role explicitly.
- Old enum values are kept but no longer referenced (Postgres can't drop enum values safely) → rollback = re-insert old roles from a backup table `user_roles_backup_rbac`.

## 4. Qualification & TJM workflow
- New columns on `demand_candidates`: `qualification_status` (pending / qualified / rejected), `qualified_by`, `qualified_at`, `qualification_notes`, `final_decision` (pending / approved / rejected), `decided_by`, `decided_at`.
- On `candidate_financials`: keep `candidate_rate` (expectation), `client_rate` = validated TJM, plus `tjm_status` (draft / approved), `tjm_approved_by`, `tjm_approved_at`.
- Database triggers enforce: only HRBP/Operations can set qualification; only Operations can set final decision or approve TJM; approved TJM becomes read-only except for Operations; final approval requires qualified status. Every decision is written to the activity log.
- Existing stage Kanban kept as-is.

## 5. Frontend
- One central `src/lib/permissions.ts` (capability → roles) used by sidebar, routes, buttons; replaces scattered checks.
- Dashboards reused: Sourcing → Sourceur, Manager → HRBP (qualification queue), Director → Operations (decisions + pending TJM), CEO read-only, Admin = users console only.
- Admin console: multi-role assign/revoke, effective permissions view, last-admin protection (DB trigger), role-change audit table.
- FR/EN labels for the new roles.
- Apify / LinkedIn: untouched, stays disabled.

## 6. Tests & readiness
- Vitest tests for the permission map (one per rule).
- Scripted checks against the database with test users of each of the 5 roles: unauthorized direct requests, attempted TJM/approval bypass, last-admin removal.
- Production readiness checklist delivered at the end with what was and wasn't verified.

## Stages
1. Migration: new roles, mapping, backup, functions, RLS + storage policies, audit table, last-admin guard.
2. Central permissions + sidebar/routes/admin console.
3. Qualification + TJM workflow (DB + UI).
4. Dashboards adaptation + i18n.
5. Tests, regression pass, checklist.

## Decisions needed
- Who creates and dispatches demands now (was Division Manager)? Default: Operations only.
- Should HRBP see all demands or only assigned? Default: all (read).
- Does Elias need operations rights in addition to admin?
