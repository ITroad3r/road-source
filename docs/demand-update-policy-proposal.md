# Demand UPDATE restriction — future isolated proposal only

Status: **not implemented, not tested against a database, no migration created**.
Outstanding blocker for Stage 5 security sign-off. Review uses repository source only; deployed policy state is unknown.

## Finding and consequences
`drizzle/migrations/0001_rbac_remap_and_policies.sql:118–120` permits UPDATE when the caller is either Operations or a Sourceur assigned to the demand, including a WITH CHECK for the resulting row. `src/lib/permissions.ts` allows demand management only for Operations.

An assigned Sourceur can therefore potentially bypass hidden controls with a direct authenticated API PATCH and change writable demand fields such as title, description, skills, budgets, lifecycle, commercial outcome or client association while retaining assignment to themselves. Validation triggers still apply; this is not a claim that every arbitrary value succeeds. Reassignment away from themselves should fail the existing WITH CHECK unless they also hold Operations. HRBP/CEO/Admin-only do not satisfy the recorded UPDATE predicate.

Frontend guards are not the security remedy. Also audit every permissive UPDATE/ALL policy and writable RPC: permissive policies combine with OR, so adding a stricter policy without removing the broader one does not restrict access.

## Proposed narrow change (separate approval required)
In an independently verified isolated test database, replace only the demand UPDATE policy so **both USING and WITH CHECK require `has_role(auth.uid(), 'operations')`**. Leave demand SELECT, INSERT and DELETE policies, table grants, role mappings and `demand_candidates` policies untouched. Do not edit historical applied migrations. Prepare a new migration only after the isolated proposal is approved.

Sourceur candidate stage changes are governed by the separate `demand_candidates` table. Preserve its assignment-based INSERT/UPDATE access and Stage 3 qualification/placement gates. Verify the SECURITY DEFINER auto-close trigger still performs its intended demand update on a valid placement; do not grant broad demand UPDATE to make that trigger work.

## Future direct authenticated test matrix
Create fresh synthetic accounts and two synthetic demands (one assigned to Sourceur A, another assigned to Sourceur B), with candidate and financial fixtures supporting valid qualification, TJM and placement scenarios. Use real password/token sessions with publishable client credentials, never service-role credentials for assertions.

| Caller / operation | Required result |
| --- | --- |
| Sourceur A SELECT own demand | Row visible |
| Sourceur A PATCH own title, skills, budget, lifecycle, outcome and client association, tested separately | No change |
| Sourceur A PATCH unassigned demand | No change |
| HRBP/CEO PATCH readable demand | No change |
| Admin-only/no-role/anonymous PATCH demand | No change |
| Operations PATCH each management field with valid values | Exactly one updated row; read back matches |
| Sourceur + Operations PATCH | Allowed by explicit Operations membership |
| Sourceur A stage-update candidate on own demand | Allowed for a valid non-placement stage |
| Sourceur A stage-update candidate on someone else's demand | No change |
| Sourceur A alter qualification/final decision/TJM | Blocked by existing rules |
| HRBP qualify assigned synthetic candidate | Allowed; no demand-field change |
| Valid fully approved placement | Existing Stage 3 placement and automatic close succeed |
| Self-grant Operations to bypass restriction | Blocked |

For denied UPDATE, a 200/204 with zero matched rows is not a successful write: request return=representation where available and read back as Operations to assert unchanged stored values. Assert exact affected rows and concrete values for allowed cases. Read all fields, not just the tested column. Repeat through any relevant writable RPC to rule out alternate paths.

## Isolation, backup and rollback guidance
1. Stop unless the isolated project's identity, URL and credentials are proven distinct from production; no production fallback. Keep tokens and configuration out of reports.
2. Before any future change, capture policy definitions (roles, command, permissive/restrictive mode, USING and WITH CHECK), RLS flags, grants, relevant triggers/functions and migration revision. Back up synthetic fixtures and use a reproducible seed manifest; do not copy business records.
3. Apply the narrow policy replacement transactionally in isolation only. Run the matrix, check audit/notification side effects and compare unchanged policies, grants and roles.
4. Roll back in isolation by restoring the captured exact UPDATE policy definition in one transaction; rerun baseline tests. That rollback restores the known Sourceur weakness and is not a secure production end state.
5. Production requires a separate explicit approval after evidence review, a policy-definition backup and an agreed deployment/rollback window. No user-role or business-record updates should be needed. Restoring policy definitions does not undo already committed data changes, so any later production verification must not create such changes without approval.