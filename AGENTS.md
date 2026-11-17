# Agent rules
- Role→capability mapping lives only in src/lib/permissions.ts and must mirror RLS; admin is technical-only and never implies business access (least privilege).
- Dashboards: one workspace per role (workspace.* in permissions.ts), KPI math lives in src/lib/dashboard-kpis.ts and shared cached reads in components/dashboards/data.ts; financial rows are fetched only when can(financials.view) so other roles never issue the request.
