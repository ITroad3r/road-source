# Stage 6 — Business Workflow Alignment (draft only, not accepted)

## Already compliant (no change)
1. HRBP = Sourcing Manager — existing 5-role RBAC kept, no new role.
2. Sourceur sources and submits requested compensation only; cannot review, forward, approve, reject, reopen or amend (DB-enforced in `compensation_action`).
3. HRBP reviews, amends (`manager_review`) and forwards to Operations.
5. Operations returns to HRBP (`return_to_manager`); HRBP returns to Sourceur (`return_to_sourceur`); Sourceur can only correct/resubmit.
6. Candidate approval (qualification/final_decision) and compensation approval are separate columns/flows; neither sets the other. Placement requires qualification + approved compensation + final approval (+ commercial TJM for Freelance).
7. Freelance: candidate compensation TJM (`compensation_proposals.final_amount`) and commercial client TJM (`candidate_financials`) are separate; nothing copies one into the other; both required by `compensation_gate_error`.
4 (partly). Rejection required a reason; candidate status was never changed by a compensation rejection.

## Changed (migration 0016_stage6_business_alignment_rejection_followup)
- `reopen` of a rejected proposal now returns to **HRBP** (`returned_to_manager`) for renegotiation, not to the Sourceur. HRBP or Operations may reopen (reason required).
- New HRBP-only action `request_alternatives` (reason required): compensation stays `rejected`, assigned Sourceur is notified, entry added to the append-only audit.
- HRBP queue/dashboard count now includes rejected proposals awaiting follow-up.
- UI labels EN/FR: "Reopen for renegotiation", "Request alternative candidates".
- Rollback: re-apply the `compensation_action` body from migration 0014 in a new migration.

## Separation of duties — audit and proposal (NOT activated)
Loophole: a user holding both `hrbp` and `operations` can `forward` (sets `manager_by`) and then `approve` (sets `final_by`) the same proposal. Draft data: 0 approved proposals with `manager_by = final_by`.
Proposed DB fix (add inside `compensation_action`, approve branch, before the update):
```sql
IF _action = 'approve' AND EXISTS (SELECT 1 FROM public.compensation_proposals WHERE id = v_id AND manager_by = uid) THEN
  RAISE EXCEPTION 'Separation of duties: the HRBP reviewer cannot also give final Operations approval' USING ERRCODE = '42501';
END IF;
```
Optional: also block the same user forwarding a proposal they originally submitted as Operations. Tests to add: dual-role user forward→approve denied; different Operations user approves OK. Awaiting explicit authorization.

## Verification
Stage 6 API/security 105/105 (incl. new rejection follow-up checks) · browser 36/36 · Stage 3 61/61 · Stage 5A 109/109 · Stage 5B 59/59 · financial confidentiality PASS · unit 43/43.

## Needs business confirmation
- Should HRBP and Operations still be able to create/submit a proposal themselves, or Sourceur only?
- Should Operations keep the right to reopen a rejection, or HRBP only?
- Activate the separation-of-duties rule above?
- Supported currencies (currently any 3-letter code, default EUR).
