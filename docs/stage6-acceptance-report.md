# RoadSource — Stage 6 Acceptance Report: Contract & Compensation Workflow

Draft: Stage 6 — CDI CDD Freelance Compensation Workflow (isolated). Date: 2026-11-20.
**Recommendation: CONDITIONAL GO** — all technical acceptance checks pass; acceptance conditions are the business decisions in §10.

## 1. Workflow

```text
 Sourceur (assigned)          Sourcing Manager = HRBP            Operations
 ───────────────────          ───────────────────────            ──────────
 draft ──submit──▶ pending_manager_review ──forward──▶ pending_operations_review ──approve──▶ approved
   ▲                  │  ▲   │ manager_review                │   ▲        │                     │
   │   return_to_     │  │   ▼                               │   │        │ reject              │ start_amendment
   └── sourceur ◀─────┘  │ reviewed_by_manager ──forward─────┘   │        ▼                     │ (justification)
 (returned_to_sourceur)  └──── returned_to_manager ◀─return_to_manager   rejected ──reopen──▶ returned_to_sourceur
                                                                  ◀───────────────────────────┘
```
Final approval / placement of a candidature then requires: HRBP qualification + approved compensation
(+ approved commercial TJM for Freelance) + Operations final decision.

## 2. Role & permission matrix

| Capability | Sourceur | HRBP | Operations | CEO | Admin / no role |
|---|---|---|---|---|---|
| See proposals & history | assigned demands | all | all | all (read-only) | none |
| Save draft / submit / resubmit | assigned demands | yes | yes | no | no |
| Review, amend, forward, return to Sourceur | no | yes | no | no | no |
| Approve, amend amount, reject, return to HRBP | no | no | yes | no | no |
| Reopen rejected / amend approved | no | no | yes (justification) | no | no |
| Commercial client rate & margin | no | no | yes | read-only | no |
| Direct table writes (proposals / audit) | no | no | no | no | no |

All transitions run through one database function (`compensation_action`) that checks role, state and an expected version
(optimistic locking). Direct INSERT/UPDATE/DELETE on proposals and audit are not granted to any app user.

## 3. Contract type & compensation field rules
- Exactly three types: CDI, CDD (monthly salary, "DM Salary"), Freelance (daily rate, TJM). Frequency stored per audit entry (monthly/daily).
- Contract type and a positive amount (≤ 10,000,000) are mandatory to submit; drafts may be incomplete.
- Changing contract type requires a new amount (the UI clears the amount when frequency changes; the database rejects stale amounts).
- Currency stored explicitly (EUR default; MAD, USD, GBP, CHF selectable).
- Candidate preference (`preferred_contract_type`, Talent Hub, optional) is separate from the per-candidature proposal.
- Values kept separately: original Sourceur snapshot (immutable, first submission), current Sourceur proposal, HRBP amendment, Operations final.

## 4. Changed files & migrations
Migrations (draft DB only until acceptance):
- `0014_stage6_compensation_workflow.sql` — enums `contract_type`, `compensation_status`; tables `compensation_proposals`, `compensation_audit` (append-only, trigger-protected); `compensation_action`, `compensation_gate_error`; Talent Hub `preferred_contract_type`; final-approval/placement gates updated in `enforce_pipeline_decisions`.
- `0015_stage6_require_compensation_for_new_candidatures.sql` — `demand_candidates.requires_compensation` (existing rows false = compatibility, new rows true, user-immutable); gate blocks new candidatures without an approved proposal.

App: `src/lib/compensation.ts` (+test), `src/lib/decisions.ts`, `src/lib/permissions.ts`, `src/components/CompensationPanel.tsx`, `src/components/PreferredContractType.tsx`, `src/components/dashboards/CompensationQueueCard.tsx`, `src/components/CandidateDecisions.tsx`, routes `compensation.tsx` (new), `dashboard.tsx`, `demands.$demandId.tsx`, `route.tsx`, `talent-hub.$cvId.tsx`, `talent-hub.new.tsx`, EN/FR locales.
Tests: `tests/security/stage6_compensation.py` (new), `tests/security/stage3_fixtures.py` (new), `tests/browser/stage6_compensation_ui.py` (new); adapted `stage3_regression.py`, `stage5a_demands.py`, `tests/browser/new_demand_access.py`.

## 5. Audit & transition rules
Every action writes one `compensation_audit` row: candidature, candidate, demand, actor id + role used, action, previous/new status,
previous/new contract type and amount, currency, frequency, comment, timestamp. Rows cannot be updated or deleted (only cascade when a
candidature is removed by Operations). Return, reject, reopen and amendment require a comment. Leaving `approved` on a non-placed
candidature resets the Operations final decision to pending (logged); placed candidatures keep their placement.

## 6. Regression matrix (isolated draft, real password sessions, synthetic fixtures with cleanup)

| Suite | Result |
|---|---|
| Stage 6 compensation workflow & security (`stage6_compensation.py`) | **99/99 PASS** |
| Stage 6 real browser acceptance (`stage6_compensation_ui.py`) | **36/36 PASS** |
| Stage 3 qualification / final decision / placement / legacy (`stage3_regression.py`, rebuilt fixtures) | **61/61 PASS** |
| Stage 3 lock-order stress, 40 rounds × 5 concurrent requests | **PASS** (0 deadlocks, 0 invariant violations) |
| Stage 5A demand authorization (`stage5a_demands.py`, now re-runnable) | **109/109 PASS** (×2 runs) |
| Stage 5B authorization & function privileges | **59/59 PASS** |
| Commercial financial confidentiality | **PASS** (0 failures) |
| New Demand access browser test (mocked roles) | **7/7 PASS** |
| Unit tests (permissions, decisions, KPIs, compensation) | **43/43 PASS** |
| Production build | **OK** |
| Stage 5C release workflow tests | **NOT RUN** — Stage 5C was a separate unmerged draft; its tests are not present here. |

Key Stage 6 checks include: CDI/CDD/Freelance submission; mandatory fields; HRBP amend/return; Operations approve/amend/reject/return;
reopen; amendment + reapproval; stale-version rejection; one winner in a simultaneous approve vs reject race; forged/edited/deleted audit
blocked; direct table writes blocked for every role; unassigned Sourceur, CEO, Admin, no-role and anonymous denied; Sourceur/HRBP/Admin
see no client rates; CEO reads but cannot write; multi-role actor recorded with the role actually used; **bypass blocked**: a new
candidature with an approved TJM but no compensation cannot be finally approved or placed, and the compatibility flag cannot be changed.

## 7. Browser evidence (Chromium, real sign-in through the app)
CDI — English desktop; CDD — French desktop incl. HRBP return + Sourceur resubmission, then Operations amendment and rejection;
Freelance — English mobile (390×844). CEO read-only view; Admin and no-role: no menu entry and no access by direct URL; pending counts on
Sourceur/HRBP/Operations dashboards; no page errors. HRBP sessions issued no request for commercial financials.
Screenshots: `docs/stage6-evidence/*.png` (also delivered in Files).
Found and fixed during browser testing: the review window closed when an action moved the candidate to another queue.

## 8. Historical data
- Existing candidatures: `requires_compensation = false` → previous rule (approved TJM) still applies; nothing reclassified, no approvals fabricated.
- Existing "permanent"/"freelance" engagement preferences are untouched and shown as "legacy"; `preferred_contract_type` stays empty until a person sets it.
- Freelance compensation is **not** copied into commercial Financials (candidate requested TJM ≠ client billing TJM). Both approvals are required for Freelance, so there is no contradictory final state.
- Records to classify by the business: candidatures without a proposal that are still active (see the "All proposals" tab, status "Not started").

## 9. Backup & rollback
Before acceptance: take a database backup (Cloud backup / `pg_dump` of `public`). Acceptance applies 0014 and 0015 automatically.
Rollback (additive, new migration — never delete migration files):
1. Restore the previous `enforce_pipeline_decisions` body (from migration 0009/0012) so gates use the TJM rule only.
2. `DROP TRIGGER trg_protect_requires_compensation`; `REVOKE EXECUTE ON FUNCTION compensation_action FROM authenticated`.
3. Keep `compensation_proposals` / `compensation_audit` for history (mark DEPRECATED) instead of dropping them.
4. Redeploy the previous app version.

## 10. Business decisions — acceptance conditions
1. **HRBP acts as Sourcing Manager** (no sixth role). Confirm or request a dedicated role.
2. **Return paths**: HRBP → Sourceur; Operations → HRBP; only Operations reopens rejected proposals (to the Sourceur). Confirm.
3. **Separation of duties — multi-role self-approval (open finding)**: a user holding both HRBP and Operations can forward and then
   approve the same proposal (tested and currently allowed; the audit records both roles). **Recommendation:** block final approval by the
   same person who performed the last HRBP review/forward, unless a CEO-approved exception exists. Not implemented without your approval.
4. **Freelance**: compensation approval (candidate TJM) and commercial TJM approval (client rate) are both required; no automatic mapping. Confirm.
5. **Currencies** offered (EUR, MAD, USD, GBP, CHF). Confirm list.
6. Stage 5C tests must be run once 5C is merged (not available in this draft).

## 11. Database isolation
All tests targeted `http://127.0.0.1:8001` (draft-local backend); scripts abort if the backend is not local. The live database, live
users and production data were not touched. Nothing was accepted, merged, published or deployed.
