# RoadSource — Stage 5C Final Release Report (2026-11-19)

**Recommendation: NO-GO (conditional).** The application code and database rules passed every automated check.
Release is blocked only by live-environment readiness items (B1–B3) that require owner action. Once those are cleared and B4 is checked manually, the recommendation becomes GO.

## Isolation evidence
- Drafts list: "Stage 5C — Final release validation" uses its own test database.
- Test backend: `http://127.0.0.1:8001` (local); every script asserts a local host and aborts otherwise.
- Live app was only *read* (counts only, no row data), never written.

## Test matrix (all against isolated draft, real password sessions, no service-role in assertions)
| Suite | Scope | Result |
|---|---|---|
| tests/release/release_suite.py | Auth (login, wrong pw, signup disabled, forged JWT, refresh revoked after sign-out); demand create/dispatch/notify; 5A update/delete blocks; Talent Hub + CV upload/download/delete/signed-URL per role; pipeline; HRBP qualification; TJM create/read/approve per role; final approval gating; approval-vs-amendment race; placement + auto-close filled/won; CEO read + read-only writes; self/other role escalation; admin self-assign/self-revoke; role grant/revoke effect + audit log; auth admin/invite API from user tokens; anonymous sweep of 11 tables; no-role/admin/multi-role isolation; cleanup | **144/144 PASS** (results: docs/stage5c-test-results.json) |
| tests/release/browser_roles.py | Real UI sign-in for 7 accounts × (desktop EN, mobile 390px FR): no page errors, no raw translation keys, no horizontal overflow, financial requests only for Operations/CEO | **14/14 PASS** |
| tests/security/stage5a_demands.py | Demand RLS matrix | **107/107 PASS** |
| tests/security/stage5b_authorization.py | Role probing, directory, privileged functions, escalation | **59/59 PASS** |
| tests/browser/new_demand_access.py | New Demand gate, 7 mocked roles | **7/7 PASS** (fixed draft storage-key detection) |
| Vitest unit + permissions | | **33/33 PASS** |
| Translations | EN/FR key parity | 0 missing either side |
| CEO KPIs | Dashboard vs database (6 demands/3 active, 9 candidatures, 3 placed, 33%, 83% qualif., 3 approved TJM) | Match |
| Build | | OK |
| Migration history | 14 journal entries, strictly increasing, `drizzle-kit check` clean; live has same 14 applied, same newest timestamp | OK |

Fixtures: every run creates 7 users (`<role>.rel<id>@synthetic.test`, random password) plus `[TEST] … rel<id>` rows and deletes them all in a `finally` block; leftover-user check is part of the matrix. Obsolete Stage 3 scripts with hardcoded IDs were removed (their checks are covered by the release suite; the "amendment on an already-placed candidate" case is not yet re-covered — low risk, trigger unchanged since 5B).

## Vulnerabilities found
None in code or database rules.

## Release blockers (live app, owner action — not changed by this draft)
- **B1 — Shared QA admin account in live.** `qa@itroad.test` exists with Admin (+Sourceur/HRBP); its password was shared in chat. Delete it or rotate and strip roles. Also remove live `[TEST]` data (2 clients, 2 demands).
- **B2 — No Operations or CEO user in live.** Live roles: 4 Admin, 1 HRBP, 2 Sourceur. Without Operations nobody can create demands, approve TJM or give final approval. Assign real Operations and CEO users. Review why there are 4 Admins (least privilege).
- **B3 — Admin count.** Confirm each of the 4 Admin holders is intended; Admin is technical-only.

## Must verify manually before go-live
- **B4 — Invitation delivery.** Sign-up is disabled, so invitations are the only way in. No custom sender domain is configured, so the default sender (rate-limited) is used. Send one real invitation, accept it, set a password, sign in. Not executed here (real email side effect).
- Session expiry: forged/invalid tokens and revoked refresh tokens are rejected; natural 1-hour expiry was not waited out.
- Invitation server functions: admin check verified by source review (role read with the caller's own session); not invoked end-to-end.

## Non-blocking issues
- Invitation acceptance tracking: **not essential for initial release.** Admins can resend/delete invites; acceptance is visible because the user appears signed in. Keep as post-launch enhancement (not implemented).
- Logging: errors go to browser console/toasts and backend logs only; no central error monitoring. Recommended post-launch.
- Backup/restore: relies on platform backups (not verifiable from here) plus `user_roles_backup_rbac`. Rollback steps per change are in docs/rbac-runbook.md, stage5a/5b docs. Recommend a manual export before go-live.
- Dashboard header shows profile name verbatim (e.g. "[TEST]" for test users) — expected.

## How to re-run
`python3 tests/release/release_suite.py && python3 tests/release/browser_roles.py` (isolated draft only).
