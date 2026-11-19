# Roadmap — Stage 3 draft
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
- Stage 3 security scripts need reproducible isolated fixtures and isolation checks before future execution.

## New Demand source-only follow-up
- [x] Guard form mounting, restricted queries and creation handlers.
- [x] Run unit and mocked-role browser checks, including Operations creation flows (33 unit tests; 7 browser scenarios pass).
- [x] Document future isolated demand UPDATE policy proposal and security sign-off blocker; no migration or data changes.
- Stage 5 security sign-off blocker: assigned-Sourceur demand UPDATE discrepancy requires separately approved isolated policy verification; proposal only in docs/demand-update-policy-proposal.md.
