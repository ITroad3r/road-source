# Revised candidate review order

## Implemented
- All nine pipeline columns remain visible to users with business access, including read-only CEO access; Admin-only remains technical-only. This change does not widen row access, financial access or chat audiences.
- `screened` remains the stored enum value for compatibility; EN label is **For Screening/Approval**, with its French equivalent on the board, list, candidate profile, financials and contact/screening tab.
- Sourcers advance sequentially: Identified → Contacted → For Screening/Approval. Before screening, saved communication method/time, employment, availability (notes or joining date), country/city are mandatory. Employed candidates also need current contract and remuneration type/amount; unemployed candidates do not need current-job details. Free-text observations and test PDFs remain optional and editable.
- Only HRBP performs first qualification; Operations no longer substitutes for HRBP. The HRBP queue excludes Identified and Contacted.
- HRBP-qualified candidates with pending final decisions appear in **Candidates awaiting final approval** regardless of TJM/compensation state. Operations approves or rejects the candidate at this step.
- Operations-approved candidates with absent/draft TJM move to **TJM awaiting approval / re-approval**. Financials shows approved candidates and historical placements; TJM approval requires both reviews (grandfathered placements retain their exemption).
- Approved rate edits reset TJM to draft without undoing candidate approval. Placement still needs approved compensation and, for Freelance, approved commercial TJM; legacy candidatures retain their prior placement financial gate.
- Submitted and subsequent stages require both reviews. Candidate packages exclude candidates missing either approval.

## Database change
`drizzle/migrations/0024_candidate_review_before_tjm.sql` updates existing decision/TJM trigger functions and adds a progression trigger. Existing RLS policies, grants and user assignments are unchanged; no historical records were backfilled or reinterpreted. The migration checks the original function shapes before modifying them.

## Verification
- 66 unit tests passed across permissions, decisions, dashboard queues, compensation, dossiers, chat and stage transitions.
- `tests/security/candidate_review_order.py`: 46 real-session API checks passed using existing single-role accounts. Tested skipping stages, each required contact field, HRBP-only qualification, review-before-TJM on INSERT/UPDATE, CEO/Admin write denial, rate-edit reapproval, later Sourcer progression, compensation workflow and placement/automatic demand closure. All run-scoped fixtures removed.
- Signed-in browser flow: Sourcer saved contact details and moved to screening; Operations queue excluded candidate before HRBP qualification; HRBP qualified via UI; Operations candidate approval moved candidate from review queue to TJM queue; draft rates saved and TJM approved via UI; Sourcer moved to Submitted on 390px mobile. Readback confirmed persisted values and screenshots inspected. Temporary records removed.
- Automatic build passed. No publishing performed.

## Compatibility and recovery
Existing records are not changed. Older already-qualified candidates continue into Operations review; existing placements remain grandfathered where applicable. An older candidate with approved TJM but pending Operations review still appears in the first queue.

To reverse this order, use a new reviewed migration restoring the previous function definitions from pre-change migrations and removing the progression trigger; do not edit applied migration history. Reverting source labels alone is not enough. Restoring the previous final-approval financial gate would change pending candidate eligibility, so review affected pending records before rollback.