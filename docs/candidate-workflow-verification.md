# Contact and screening workflow validation

## Delivered
- CV Hub picker and a manual-add action on demand detail. Both manual entry points share CandidateCreateForm. The RLS-enforced, security-invoker RPC atomically creates the Hub record and candidature; failed attachment rolls back the Hub insert.
- Candidature-scoped contact and screening records; forms remain editable in later stages. Clearing a section preserves the other section and the candidate itself.
- Private PDF test result uploads, replacements, removals and on-screen PDF previews. Scores are constrained to 0–100 in the app and database. Default current-pay currency is MAD, editable; current pay is separate from company margins and approved compensation.
- Sourcer edits only visible assigned candidatures; HRBP edits all visible candidatures. Operations/CEO read-only on the new forms; admin-only has no access. Existing decision/compensation permissions are unchanged.
- CV button for every pipeline stage in list and board. PDF renders in-app with PDF.js; DOCX renders locally with docx-preview. Legacy .doc requires download (no third-party document service or private file forwarding).

## Verified using temporary authenticated test account and synthetic [TEST] rows
- HRBP: manual addition saves Hub + pipeline + uploaded CV; full contact details, both scores and PDFs save and read back after reload.
- Sourcer: manual addition; read/edit contact; edit screening; replace PDF; clear screening; contact preserved after reload. List includes CV controls for both synthetic candidates.
- Sourcer: inaccessible candidature insert denied; manual creation against inaccessible demand fails and leaves no orphan Hub record.
- CEO: review UI disabled; direct API INSERT/UPDATE/DELETE blocked; record readback unchanged.
- Desktop, 390px mobile, 768px tablet French checked; no horizontal dialog overflow. PDF canvas contents inspected visually (not just a blank browser PDF frame).
- 53 unit tests passed across permissions, dossier validations, decisions, compensation and dashboard KPI suites. Automatic build passed.

## Limitations
- Legacy binary .doc cannot render in-browser; download fallback is explicit. Use PDF/DOCX for on-screen CV preview.
- Existing financial and compensation approval flows were regression-tested at unit level, not re-run end to end.
- No publishing was performed. Backend additions apply immediately to the current project database.
