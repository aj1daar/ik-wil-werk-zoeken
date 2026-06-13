# ik wil werk zoeken — Running Plan

## Completed

### Application Tracker (from main branch merge)
- [x] Replace IND-stage model with general job application tracker
- [x] New fields: companyName, position, appliedAt, status, rejectionReason, rejectionNote, notes, contactPersonName, contactPersonEmail, locations
- [x] Statuses: Applied → InterviewScheduled → OfferReceived → Accepted / Rejected / Withdrawn / OnHold
- [x] Stats API: GET /api/dashboard/stats?from=&to=
- [x] HomeView — stats dashboard with date-range selector
- [x] CompaniesView — IND sponsor browser with "Start Application"
- [x] ApplicationsView — list + detail panel
- [x] ApplicationPanel + NewApplicationModal components

### Database Migration (Table Storage → PostgreSQL)
- [x] EF Core + Npgsql replacing Azure.Data.Tables
- [x] AppDbContext with Users, Stages, Sponsors tables
- [x] Sponsors moved from in-memory ConcurrentDictionary to SQL
- [x] EF Core migrations run in CI (not startup) — dotnet ef database update
- [x] docker-compose.yml for local Postgres
- [x] Cascade delete: User → Stages (removed redundant explicit deletion)

### Auth & Email
- [x] Forgot-password / reset-password flow (Resend HTTP API)
- [x] Stateless HMAC reset tokens (userId.exp.sig), 1-hour expiry
- [x] Anti-enumeration: forgot-password always returns 204
- [x] JWT HS256, PBKDF2-SHA256 password hashing
- [x] Email verification on registration (72-hour HMAC token, resend endpoint)
- [x] Email change in profile (24-hour HMAC token, confirmation link to new address)
- [x] Rate limiting on all auth endpoints (in-memory fixed-window per IP)

### Frontend Polish
- [x] Warm-tinted shadows on navbar, cards, buttons, panels, modal
- [x] AppLogo inline SVG (orange rounded square with magnifying glass)
- [x] favicon.svg matches AppLogo design
- [x] CSS consistency — all hardcoded hex colors replaced with CSS variables across all views
- [x] Privacy Policy page (`/privacy`) — GDPR-compliant with data table, AI notice, right to erasure
- [x] Per-route `<title>` tags via `meta.title` + `router.afterEach`
- [x] HomeView error state for stats (`store.statsError` shown on API failure)
- [x] First-login onboarding banner — dismissible, stored in localStorage
- [x] Confirm password field on register + password strength hint + email format validation
- [x] Smart 409 on register — "already registered" links to sign-in / reset-password
- [x] IND data freshness badge in CompaniesView (MAX lastVerifiedAt across all sponsors)
- [x] Sort order dropdown in ApplicationsView (newest / oldest / last updated / company A–Z)
- [x] CSV export of all applications
- [x] `aria-invalid` / `aria-describedby` on form validation errors
- [x] Dark-mode toggle — CSS vars, moon/sun button in navbar, persisted in localStorage
- [x] Dark-mode readability fix — `--col-invert-bg`/`--col-invert-text` vars so pill buttons stay legible in both themes
- [x] Duplicate detection — warning banner when adding an application to a company already tracked
- [x] Keyboard shortcuts — `N` opens new application modal, `Esc` closes detail panel

### Admin System
- [x] `User.Role` field (`"user"` / `"admin"`) with EF Core migration
- [x] Admin seeding from `ADMIN_EMAIL` env var at startup (idempotent, never hard-coded)
- [x] `GET /api/admin/users` — list all users (admin JWT required)
- [x] `POST /api/admin/promote` — promote user to admin by email (admin JWT required)
- [x] `POST /api/admin/reload-sponsors` — full IND scrape + upsert + LLM enrichment (admin JWT required)
- [x] Role claim in JWT; `TokenService.GetRole()` extracts it
- [x] "Admin Panel" button in navbar (visible only when `role === "admin"`)
- [x] `/admin` route with guard (non-admins redirected to `/`)
- [x] AdminView — promote-user form, reload-sponsors button, users table

### Companies & Applications Polish
- [x] **Company City field** — `City` column on `SponsorCompany`; captured from IND register (3rd `<td>`); shown in card and detail panel; city search supported
- [x] **Companies advanced filtering** — city dropdown (exact match), tag include/exclude multiselect (3-state toggle); `store.filter()` capped at 100
- [x] **Application detail as modal** — centered `<teleport>` overlay with backdrop; bottom-sheet on mobile; keyboard accessible
- [x] **Mobile responsiveness** — hamburger navbar (≤ 767 px), full-screen modal on mobile, detail panel hidden on small screens
- [x] **Session expiry warning** — dismissible banner when JWT < 24 h from expiry; `useSessionExpiry` composable
- [x] **Application count badge on nav** — active (non-terminal) count shown next to "My Applications"
- [x] **Contact email mailto: link** — clickable `<a href="mailto:…">` in ApplicationPanel
- [x] **Status chip colors in dark mode** — per-status CSS classes (`chip-applied`, etc.) with `:root[data-theme="dark"]` overrides

### Advanced Application Features
- [x] **Application timeline / activity log** — `ActivityLog` table (FK cascade); all field changes logged on every update; collapsible history section in ApplicationPanel
- [x] **Follow-up date field** — nullable `DateTimeOffset?` on `ApplicationStage`; date picker in ApplicationPanel; overdue/today badges in the list row
- [x] **Bulk status update** — checkbox per row + select-all; floating bulk action bar; PATCH `/api/dashboard/applications`; activity log entries created
- [x] **Load-more pagination in CompaniesView** — `displayCount` ref starts at 60, +60 per click; "N remaining" shown; resets on filter change
- [x] **Sticky filter toolbar** — `position: sticky; top: 0` on ApplicationsView filter bar
- [x] **Print / PDF export** — Print button calls `window.print()`; `@media print` CSS hides nav/filter/buttons

---

## Backlog
