## Goal
Add full internationalization to the app with English and French, plus a header language switcher that persists the user's choice.

## Stack
- `i18next` + `react-i18next` + `i18next-browser-languagedetector`
- Locale JSON files under `src/locales/{en,fr}/common.json` (single namespace to keep it simple)
- Language detection order: `localStorage` → `navigator` → fallback `en`
- Persistence: `localStorage` key `roadsource-lang`

## Files to add
1. `src/i18n.ts` — initialize i18next, load EN/FR JSON, expose `i18n` instance
2. `src/locales/en/common.json` — all English strings, organized by feature (nav, auth, dashboard, clients, demands, talentHub, financials, reports, admin, notifications, common)
3. `src/locales/fr/common.json` — French translations of the same keys
4. `src/components/LanguageSwitcher.tsx` — compact EN/FR toggle (dropdown or button group) used in the authenticated layout header

## Files to edit
- `src/router.tsx` (or `src/start.ts` / `src/routes/__root.tsx`) — import `./i18n` once at app bootstrap so it initializes before any component renders
- `src/routes/_authenticated/route.tsx` — mount `<LanguageSwitcher />` in the existing top bar
- All route/page components that render user-facing copy:
  - `auth.tsx`, `index.tsx`
  - `_authenticated/route.tsx` (nav labels)
  - `_authenticated/dashboard.tsx`
  - `_authenticated/clients.index.tsx`, `clients.$clientId.tsx`, `clients.tsx`
  - `_authenticated/demands.index.tsx`, `demands.new.tsx`, `demands.$demandId.tsx`, `demands.$demandId.edit.tsx`
  - `_authenticated/talent-hub.index.tsx`, `talent-hub.new.tsx`, `talent-hub.$cvId.tsx`, `talent-hub.tsx`
  - `_authenticated/financials.tsx`
  - `_authenticated/reports.tsx`
  - `_authenticated/admin.users.tsx`
  - `_authenticated/notifications.tsx`, `profile.tsx`
- Shared components: `NotificationsBell.tsx`, `ActivityLog.tsx`, `PipelineKanban.tsx`, `SendPackageDialog.tsx`, `RoadSourceLogo.tsx` (alt text)
- `src/lib/demand-status.ts` — turn status label map into translation keys (or expose a `useStatusLabel()` hook backed by i18n)
- Page `<title>` metadata in each route's `head()` — translated via `i18n.t(...)` at module load (re-evaluated on language change via a small helper)

## Translation approach
- In every component: `const { t } = useTranslation();` then `t('demands.new.title')` etc.
- Toasts, table headers, button labels, empty states, validation messages — all routed through `t(...)`
- Dates: keep `date-fns` and pass `locale: fr` from `date-fns/locale` when current language is `fr`
- Currency/number formatting via `Intl.NumberFormat(i18n.language, ...)`
- Backend data (client names, candidate names, CV contents, demand titles) stays as-is — only UI chrome is translated

## Out of scope
- Translating database content (client names, demand titles authored by users)
- Translating auth emails (handled separately by email templates if/when that phase ships)
- RTL support
- Server-side language negotiation (client-side detection is sufficient for an SPA-style authenticated app)

## Risks / notes
- Large surface area — many strings across ~20 files. Will be done in one pass, organized by feature namespace inside `common.json` for maintainability.
- Page titles set in route `head()` run before React; translated titles will use `i18n.t()` directly and update on language change via a tiny `useDocumentTitle` effect in each page (cheap, no router refactor needed).
