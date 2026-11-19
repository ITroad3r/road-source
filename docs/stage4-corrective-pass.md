# Post-Stage-4 corrective pass — 19 November 2026

## Scope and changed files
Source code only. No database requests, writes, migrations, role changes, test records, deployment, draft acceptance or Stage 5 implementation.

- `src/locales/en/common.json`: corrected financial restriction wording.
- `src/locales/fr/common.json`: corresponding French wording.
- `src/routes/_authenticated/demands.$demandId.tsx`: Edit, lifecycle and commercial-outcome controls require `demands.manage`; badges remain visible. Mutation callbacks also check the capability. Parent now renders its edit child through Outlet instead of masking that child with the detail page. Added page metadata.
- `src/routes/_authenticated/demands.$demandId.edit.tsx`: wait for role resolution, redirect unauthorized/error states to dashboard, mount form and its queries only for authorized users, recheck capability before update. Added page metadata.
- `src/lib/permissions.test.ts`: four additional rule tests covering unresolved roles, HRBP+Admin restrictions/qualification, Operations management and financial restrictions.
- `AGENTS.md`: recorded role-gated form mounting and edit-child rendering rules.
- `roadmap.md`: corrective pass and deferred enhancement tracking.
- `docs/stage4-corrective-pass.md`: this report.

## Exact verification results
- `bunx vitest run src/lib/permissions.test.ts src/lib/dashboard-kpis.test.ts src/lib/decisions.test.ts`: **32 passed, 0 failed** across 3 files (11 permissions, 14 dashboard/workspace, 7 candidate decision/TJM rules). Existing suite contained 28 tests; 4 were added.
- Harness compilation log: **build OK**, latest checked entry `2026-11-19T09:46:47Z`. No manual build command was run because this environment requires harness builds.
- `git diff --check`: passed.
- Playwright, desktop 1280×1800, five mocked roles: **5 passed, 0 failed**. HRBP/Admin/Sourceur/CEO have no demand Edit link or lifecycle/outcome selectors and direct edit URLs redirect to dashboard without mounting edit-form queries. Operations retains both selectors and can open the edit form. HRBP detail and Operations edit screenshots inspected.
- These browser checks intercepted auth/data requests with synthetic in-memory responses; **not real authenticated sessions or live RLS tests**. Nothing was saved to the database, and no form submission was performed.
- Qualification components and sourceur candidate-pipeline handlers were unchanged. Stage 3 decision rules passed unit tests; full qualification/TJM transaction flows were deliberately not exercised.

## Local RLS source review (not live verification)
`drizzle/migrations/0001_rbac_remap_and_policies.sql:113–122` grants HRBP demand SELECT but not INSERT/UPDATE/DELETE. Operations retains all demand management policies. No later recorded migration replaces these demand policies.

**Discrepancy:** lines 118–120 allow an assigned Sourceur to UPDATE their demand. This conflicts with the Operations-only `demands.manage` capability. Recommend an isolated, separately approved policy change removing the Sourceur UPDATE branch. No migration was created or applied here; deployed policy state is unverified.

## Neighboring screens and remaining gaps
- Demand list assignment/lifecycle and create affordances already use `demands.manage`; unchanged.
- New-demand URL still mounts a creation form without its own role-aware page guard. Reported, not changed in this focused corrective pass.
- Demand detail candidate stage/removal/add/package controls remain outside demand management gating, as requested. Separate CEO/read-only and Admin route-level review would be needed before claiming all business interfaces enforce read-only behavior.
- Other content routes still have incomplete leaf social metadata; only the two edited demand pages were updated here.

## Deferred, not started
- Invitation acceptance tracking is a separate enhancement requiring its own design and approval, not a Stage 4 migration.
- Stage 3 security scripts need reproducible isolated fixtures (users and full client/demand/candidate/financial chains), explicit isolation checks, cleanup and no production fallback before future execution. Current hard-coded fixtures were not used.

## Readiness
The requested source-code corrections are verified and ready for review. This is **not** a fresh all-clear on deployed security: the Sourceur demand UPDATE discrepancy and authenticated end-to-end security checks remain outstanding for isolated verification. No publishing or data changes occurred.