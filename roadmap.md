# Roadmap — RBAC refactoring
- [x] Stage 1: roles, migration, RLS, audit (applied to shared DB)
- [x] Stage 2: admin console with permissions + role history (UI)
- [x] Block admins changing their own roles in the database
- [x] Financial access test in isolated test copy (all pass)
- [ ] Optional: refuse not-signed-in visitors outright (awaiting approval)
- [ ] Stage 3: qualification + TJM approval workflow
- [ ] Stage 4: dashboards + FR/EN labels
- [ ] Stage 5: role-scoped security tests, regression, readiness runbook
Decisions: demands created/dispatched by Operations only; HRBP reads all demands; Elias admin only.
