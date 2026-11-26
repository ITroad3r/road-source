# Compensation renegotiation verification

## Business workflow

1. Operations opens a compensation proposal and sees the original candidate request, current revised terms and final approval values, including contract type, amount and currency.
2. Operations selects **Request renegotiation from HRBP** and enters mandatory instructions.
3. The proposal enters **Renegotiation requested by Operations**. HRBP receives a notification linking to the compensation workspace.
4. HRBP or the Sourceur assigned to the demand can revise contract type, salary/TJM and currency. The Sourceur uses **Save revised terms for HRBP validation** and cannot submit directly to Operations.
5. An intermediate HRBP review keeps the proposal in renegotiation, so either editor can still revise it.
6. HRBP validates and forwards the latest values. Operations receives a notification and can approve or request another renegotiation round.
7. Original values, every revision, actor, timestamp and comment remain visible in compensation history.

Candidate qualification and Operations candidate approval are not undone by compensation renegotiation. Placement remains blocked until compensation is approved; the existing commercial-TJM and sequential-stage gates remain unchanged.

## Authorization

- Only Operations can request HRBP renegotiation or give final compensation approval.
- Only the assigned Sourceur can use the Sourcer revision action.
- HRBP can revise, save an intermediate review and resubmit.
- Unassigned Sourceurs, CEO and Admin-only users cannot revise.
- Direct compensation-table writes remain unavailable; all changes use the guarded compensation action with expected-version checking and append-only audit.

## Verification

- `bunx vitest run`: **71/71 tests passed**.
- `oj typecheck -b --noEmit`: passed.
- Preview build log: **build OK**.
- `python3 tests/security/compensation_renegotiation.py`: **28/28 authenticated checks passed** with temporary real Sourceur, unassigned Sourceur, HRBP, Operations, CEO and Admin accounts.
- `python3 tests/browser/compensation_renegotiation_ui.py`: **4/4 signed-in UI scenarios passed** with no browser page errors:
  - Operations review and renegotiation request, English desktop.
  - Assigned Sourcer contract/TJM revision without direct resubmission, French mobile.
  - HRBP revision, validation and resubmission, English desktop.
  - Operations approval and revision history, English desktop.
- All temporary users, notifications and business fixtures were removed after both integration runs.

Test note: a negative stale-version request repeatedly timed out at the hosted backend during this focused test run and is not counted among the 28 checks. The expected-version guard itself was not changed.
