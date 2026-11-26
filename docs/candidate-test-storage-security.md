# Candidate test PDF access correction

Scope: only the selected `Test PDFs read` storage finding. No other finding or storage policy changed.

Migration: `0021_bind_candidate_test_reads_to_caller.sql`, applied and read back from the connected project database.

The previous predicate relied on nested candidature row-level security. The updated predicate explicitly checks the signed-in caller and their business role, and requires demand assignment for Sourcers. Existing candidature/demand row-level security remains an additional boundary. Uploaders do not retain access after losing assignment. HRBP, Operations and CEO retain their existing review access; Admin-only and anonymous callers cannot read these PDFs. The bucket remains private.

## Verification

- Fresh basic security scan: no findings from completed basic checks (not a deep code audit).
- Real password sessions with five existing single-role test accounts: 13 authorization scenarios passed against the native Storage API.
- Tested both signed-link creation and authenticated PDF-byte download for assigned/unassigned Sourcers, HRBP, Operations, CEO, Admin-only and anonymous callers.
- Verified new signed-link creation is denied after a Sourcer's demand is unassigned.
- 18 candidate-validation and permission unit tests passed; automatic build passed.
- Synthetic files, clients, demands and candidate records removed; user accounts and role assignments unchanged.
- Short-lived signed links already issued remain usable until expiry; the change governs new authorizations.

Regression script: `tests/security/candidate_test_reads.py`. Credentials are supplied through environment variables, never stored in project code.

## Recovery

If authorized preview access fails, inspect demand assignment and the user's business role first. Do not replace the predicate with a broad authenticated-user or uploader-only rule. Any policy rollback must use a separately reviewed compensating migration; historical migration files must not be edited.