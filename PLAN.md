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

---

## In Progress / Next

*(nothing currently planned — see below for ideas)*

---

## Ideas / Backlog

### HIGH

- [ ] **Mobile responsiveness** — full responsive layout for iPhone 15 Pro Max (430 px) and iPhone 17; navbar collapses, split-panel becomes full-screen, filter bars stack
- [ ] **Application detail as modal** — the side-panel edit view should become a centered modal overlay (better on mobile, less disorienting on desktop)
- [ ] **Company location / city field** — add `City` column to Sponsors table (DB migration); surface in CompaniesView card and filter; data from IND register if available, otherwise manually enriched

### MEDIUM

- [ ] **Companies advanced filtering** — depends on location field; filter by name (already have search), city, and tag include/exclude (show companies matching ALL selected tags, exclude companies matching any excluded tag)
- [ ] **Admin system** — role field on User (`user` / `admin`); admin-only endpoints protected by role check in JWT; initial admin designated by environment variable (never hard-coded); future: admin UI to manage users and sponsor data
  - Admin email for the initial account: stored in env var `ADMIN_EMAIL`, seeded at startup if user exists
  - Never commit email addresses or role grants to source code
- [ ] **Pagination or virtual scroll in CompaniesView** — sponsor list can grow large
- [ ] **Application timeline / activity log** — track status changes with timestamps
- [ ] **Reminder / follow-up date field** — set a date to follow up on an application; requires DB migration + backend endpoint

### LOW

- [ ] **Contact email mailto: link** — make contact email in ApplicationPanel a clickable link
- [ ] **Application count badge on nav** — show active (non-terminal) application count next to "My Applications"
- [ ] **Sticky filter toolbar** — filter bar in ApplicationsView scrolls out of view on long lists
- [ ] **Session expiry warning** — JWT lifetime is 7 days; show a banner when < 24 h remain
- [ ] **Bulk status update** — select multiple applications and change status in one action
- [ ] **Print / PDF export** — browser print stylesheet or jsPDF for career counsellors
- [ ] **Status chip colors in dark mode** — hardcoded chip backgrounds look washed-out in dark theme; needs per-status dark overrides

---

## Infrastructure

- [X] Register `microsoft.operationalinsights` provider on Azure subscription
  (Application Insights Bicep fails until this provider is registered)
  → Azure Portal → Subscriptions → Resource providers → search "operationalinsights" → Register
