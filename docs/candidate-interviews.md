# Client interview scheduling

## Delivered
- Interview action on every candidate ticket in both demand board and list views.
- HRBP and the assigned Sourcer may schedule, reschedule or delete multiple client interview rounds.
- Required date/time and onsite or online/visio format; optional client address, meeting link and observations.
- Interview details display only candidate mobile number and email as contact fields, with call/email links and explicit missing-data states.
- Today's interviews appear on Sourcer, HRBP and Operations workspaces, sorted by time. Operations is read-only.
- UTC timestamps plus scheduling timezone; input and daily date boundaries use the viewer's browser timezone, visibly labelled. If different, appointment details also show the original timezone/time.
- Scheduling does not move candidates between stages or bypass existing qualification, compensation or placement gates.
- EN/FR copy, loading/error/retry/empty states, and narrow phone layouts.

## Data boundary
`0028_candidate_client_interviews.sql` creates separate candidature-scoped records, explicit grants, four RLS policies and indexed date queries. HRBP has management access; Sourceur access is bound to current demand assignment, not appointment creation. Operations can read only; CEO, Admin-only and anonymous callers have no new interview access.

`0029_validate_interview_timezone.sql` rejects invalid timezone identifiers through a validation trigger. Date/time, supported formats, text lengths and safe meeting URL protocols are validated in the UI and database.

## Verification
- `bunx vitest run src/lib`: 80 passing tests, including nine interview rules.
- `python3 tests/security/candidate_interviews.py`: 38 passing real authenticated checks covering view/create/edit/delete/upsert denials, assigned Sourcer and HRBP writes, Operations read-only, candidate contact reads, today/tomorrow filtering, invalid input, reassignment and unchanged stage.
- `python3 tests/browser/candidate_interviews_ui.py`: four signed-in scenarios: Sourcer schedules a visio interview; Operations sees date/time and contacts without edit controls; HRBP changes time and format to onsite on French mobile; Sourcer sees the revised appointment on English mobile with tomorrow excluded.
- Reviewed dialog and daily-section screenshots at desktop and 390px phone width; no page errors or phone-page overflow in the exercised flow.
- Preview build reports `build OK`.
- All temporary users, interview records and business fixtures are removed in `finally`; no existing users or business rows changed by the tests.

## Release scope
Not published. No automatic client invitations, email reminders or calendar-provider integration were requested or added.