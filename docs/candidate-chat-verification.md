# Private candidate communication

## Access rules

Each candidature (candidate on a specific demand) has two independent rooms.

| Account | HRBP–Sourcer room | HRBP–Operations room |
| --- | --- | --- |
| HRBP | Read / send | Read / send |
| Assigned Sourcer | Read / send | Denied |
| Other Sourcer | Denied | Denied |
| Operations | Denied | Read / send |
| CEO / Admin-only / anonymous | Denied | Denied |

Multiple business roles retain their individually authorized rooms; Admin adds
no chat privileges. HRBP accounts share the manager side of both rooms. A
newly assigned Sourcer can read that demand's sourcing conversation history;
the former Sourcer loses access. Conversations are not cross-posted to activity
logs or general notifications.

## Implementation

- `0022_private_candidate_chats.sql`: messages, personal read receipts, audience
  access helper, sender/time validation, read actions, and private live signals.
- `0023_tighten_candidate_chat_grants.sql`: explicitly remove anonymous and
  unauthorized direct modification privileges, regardless of default grants.
- Messages are plain text, 1–5000 characters, immutable through the app API.
- Author names and timestamps are populated by the database; users cannot
  impersonate another sender or mark future, nonexistent messages read.
- Read receipts only advance through the latest fetched message. Opening one
  room does not clear the other room's unread indicator.
- Private broadcasts contain no message content; message reads are RLS-scoped.
  Subscriptions are created in effects, cleaned up on unmount, and coalesce
  refreshes. Reconnects refetch to recover missed signals.
- Conversation history loads in 50-message pages. Message and unread caches
  include user identity; CEO/Admin-only screens mount no chat queries.

## Verification — 26 November 2026

- 60 unit tests passed, including 7 candidate chat tests covering both allowed
  pairs, forbidden audience access, assignment, excluded roles and validation.
- `tests/security/candidate_chat.py`: **46 real authenticated API checks passed**
  using the existing single-role Sourceur, HRBP, Operations, CEO and Admin test
  accounts. No accounts or roles were modified.
- API tests checked send/read isolation, private topic authorization, anonymous
  denial, impersonation, size limits, receipt ownership, immutable messages,
  unread clearing and assignment revocation.
- Browser: HRBP sent to Sourcer; Sourcer's icon updated without reload; Sourcer
  replied and HRBP read the live reply. Both sent/replied in the Operations
  room, with sourcing messages absent. Sourcer readback after reload contained
  no Operations messages. Both list and Kanban chat controls worked.
- CEO/Admin-only showed no message controls. French conversation checked at
  390×844, 705×759 and 768×1024; dialogs and send controls fit. No page errors
  in the final mobile verification. Automatic builds passed.
- Synthetic client, demand, candidature, candidate, messages and receipts were
  removed after verification; existing business records were not changed.

## Safe rollback

Disable the `CandidateChat` controls in the demand screen to hide the feature
without losing messages. For a database rollback, use a new additive migration
to revoke message SELECT/INSERT and receipt SELECT/validated RPC execution from
`authenticated`, preserving both tables and their data. Keep RLS enabled; do not
broaden policies or restore anonymous grants. No deployment or draft acceptance
was performed as part of this implementation.