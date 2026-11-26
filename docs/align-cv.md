# Align CV

## Scope
- `/align-cv` is available only to Sourceur and HRBP through `cv.align`.
- Two PDF documents, at most 10 MB each: source CV and client job specification.
- Lovable AI produces a factual tailored CV plus evidence, gaps, editorial changes and submission constraints. French and English outputs are supported.
- The output uses the ITROAD GROUP logo extracted from the supplied aligned CV, a dark header, cyan rules and grey education/skills/languages sidebar.
- Source history is preserved, including freelance employment. Unknown requirements must stay in the report, not the CV. A human verification toggle is required for download; edits invalidate verification.
- Anonymous and no-logo exports are optional. The supplied Saham specification explicitly requires both, so the app flags these requirements instead of silently removing the requested branding.
- Files and results stay transient in the current browser page. They are sent to managed AI for processing but are not uploaded to app storage or automatically inserted into the Hub. AI service retention follows workspace policy. Closing the page discards the working result.

## Provider replacement
`src/lib/align-cv.server.ts` is the provider adapter. Replace only its AI call when migrating; keep `alignCvInputSchema`, `alignmentResultSchema`, the authenticated capability check in `align-cv.functions.ts`, and the UI/PDF output contract. No private key belongs in browser code. Existing Hub parsing calls are unchanged.

## Verification — 2026-11-26 UTC
- All 85 tests passed (9 files), including role access and two-document/PDF/size validation.
- Temporary real HRBP and Sourceur sessions exercised the uploaded `virgin_cv.pdf` and `Fiche_de_post.pdf` through live managed AI, editable review, PDF preview and download.
- French output preserved MEHDI EL ARRAG, all four employers including Freelance, original employment dates and 7 years as stated. Gaps included unsupported PostgreSQL/Maven/iOS-related requirements rather than inventing experience.
- Operations direct navigation redirected to the dashboard; no Align CV menu item appeared. A direct authenticated server-function invocation returned Forbidden before inference.
- Edited content invalidated download verification; anonymous/unbranded export was downloaded separately.
- 390×844 and 705×759 views had no horizontal overflow. No browser page errors occurred.
- PDF skill visual QA: initial render revealed extra blank pages, compressed name/title spacing and an experience title orphaned at a page break. Reduced sidebar height, separated header text and reserved space after titles. Re-rendered and visually reviewed every final page: two A4 pages, logo rendered, readable French accents, no blank pages or overlapping headings, experience title stays with its content.
- Latest harness compilation reported build OK. No manual app build/typecheck was run.
- No app schema, workflow, or existing user roles were changed. Only a temporary account's role was switched during verification and removed afterward. No publication.

## Deferred
The step-by-step full VPS migration guide is on the roadmap for the next migration discussion. No automatic timed reminder has been scheduled.