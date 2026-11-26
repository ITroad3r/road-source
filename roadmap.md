# Roadmap — Stage 3 draft
## Revised candidate review order
- [x] Gate Sourcer progression and rename screening across visible status labels.
- [x] Require HRBP qualification before Operations review, then Operations approval before TJM.
- [x] Update queues, database safeguards and regression tests; 66 unit and 46 authenticated API checks pass, full signed-in desktop/mobile UI flow verified (docs/candidate-review-order.md).

## Stage 5A isolated remediation
- [x] Verify separate draft database and inspect active policies/grants/privileged paths.
- [x] Restrict demand UPDATE with recorded migration; preserve pipeline policies (0011, isolated only).
- [x] Run real-session API matrix and full qualification/TJM/placement regression (107 PASS, 0 FAIL; 33 unit PASS).
- [x] Record evidence, rollback and remaining issues in docs/stage5a-security-review.md; do not accept, deploy or mark Stage 5 complete.

- [x] Qualification + final decision + TJM approval (database rules, activity log)
- [x] Pipeline badges/buttons, Financials TJM status/approve, FR/EN
- [x] Financials lists qualified candidates regardless of stage; Operations can create/edit/approve TJM early
- [x] Audit trail keeps previous approval when approved TJM is edited (reset to draft)
- [x] Column-level confidentiality check (sourceur/hrbp/admin none, CEO read-only)
- [x] UI end-to-end flow per role (Playwright) + DB-level blocks
- [x] Security finding status, privileged access review, rollback doc, tests + build
- [x] Stage 4 role dashboards + workspace switcher (draft only; not accepted)
- [x] TJM amendment invalidates active final approval; placed rows flagged (0007)

## Post-Stage-4 corrective pass (main, source code only)
- [x] Correct FR/EN financial restriction wording.
- [x] Gate demand-detail management controls and direct edit-page access; preserve qualification and candidate workflows.
- [x] Run permission, dashboard and decision regression tests; inspect local RLS source without database requests.
- [x] Report neighboring gaps and correction readiness; no data changes, migrations or deployment (docs/stage4-corrective-pass.md).

## Deferred enhancements (not started)
- Invitation acceptance tracking requires separate design and approval.

## New Demand source-only follow-up
- [x] Guard form mounting, restricted queries and creation handlers.
- [x] Run unit and mocked-role browser checks, including Operations creation flows (33 unit tests; 7 browser scenarios pass).
- [x] Document future isolated demand UPDATE policy proposal and security sign-off blocker; no migration or data changes.
- Stage 5 security sign-off blocker: assigned-Sourceur demand UPDATE discrepancy requires separately approved isolated policy verification; proposal only in docs/demand-update-policy-proposal.md.

## Stage 6 — Contract & compensation (isolated draft)
- [x] Data rules, workflow function, append-only history, approval gates (0014, 0015)
- [x] Compensation panel, role queues, dashboard counts, preferred contract type, EN/FR
- [x] Full regression (Stage 3, 5A, 5B, financials, unit) + Stage 6 API and browser acceptance
- [x] Acceptance report: docs/stage6-acceptance-report.md
- Waiting on business: HRBP-as-manager, return paths, multi-role self-approval policy, currencies (report §10)
- Waiting on Stage 5C merge: its release workflow tests are not in this draft

## Stage 5C — Final release validation (isolated draft)
- [x] Replace hardcoded Stage 3 fixtures with run-scoped synthetic fixtures + automatic cleanup (tests/release/).
- [x] Full workflow + authorization suite (144/144), browser role/FR/mobile checks (14/14), prior suites re-run.
- [x] Release report with GO/NO-GO (docs/stage5c-release-report.md).
- Open, blocked on owner action in the live app: remove shared QA admin + [TEST] data, assign Operations/CEO users, verify one real invitation email.

## Candidate contact and screening workflow
- [x] Shared manual candidate creation on demand; save to Hub and pipeline atomically.
- [x] Editable contact and screening records, private PDFs, Sourcer/HRBP access rules.
- [x] CV preview in every pipeline stage, list and board; FR/EN and mobile checks (PDF/DOCX; legacy DOC download fallback).
- [x] 53 unit tests; real-session HRBP/Sourcer workflows and CEO write denial; temporary fixtures cleaned; docs/candidate-workflow-verification.md.

## Private candidate chat
- [x] Add separate HRBP–Sourcer and HRBP–Operations messages with enforced access and read receipts.
- [x] Add candidate chat buttons, unread colours, live updates and FR/EN conversation panels.
- [x] Test role separation, real message exchange/readback and mobile; 46 real API checks and 60 unit tests pass; docs/candidate-chat-verification.md.
