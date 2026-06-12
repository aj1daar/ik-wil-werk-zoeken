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
- [x] Duplicate detection — warning banner when adding an application to a company already tracked
- [x] Keyboard shortcuts — `N` opens new application modal, `Esc` closes detail panel

---

## In Progress / Next

*(nothing currently planned — see below for ideas)*

---

## Ideas / Backlog

- [ ] **Pagination or virtual scroll in CompaniesView** — sponsor list can grow large
- [ ] **Application timeline / activity log** — track status changes with timestamps
- [ ] **Reminder / follow-up date field** — set a date to follow up on an application; requires DB migration + backend endpoint
- [ ] **Contact email mailto: link** — make contact email in ApplicationPanel a clickable link
- [ ] **Application count badge on nav** — show active (non-terminal) application count next to "My Applications"
- [ ] **Sticky filter toolbar** — filter bar in ApplicationsView scrolls out of view on long lists
- [ ] **Session expiry warning** — JWT lifetime is 7 days; show a banner when < 24 h remain
- [ ] **Bulk status update** — select multiple applications and change status in one action
- [ ] **Print / PDF export** — browser print stylesheet or jsPDF for career counsellors
- [ ] **Status chip colors in dark mode** — hardcoded chip backgrounds look flat in dark theme; needs per-status dark overrides

---

## Infrastructure

- [X] Register `microsoft.operationalinsights` provider on Azure subscription
  (Application Insights Bicep fails until this provider is registered)
  → Azure Portal → Subscriptions → Resource providers → search "operationalinsights" → Register
