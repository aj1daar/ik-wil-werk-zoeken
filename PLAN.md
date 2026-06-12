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

### Frontend Polish
- [x] Warm-tinted shadows on navbar, cards, buttons, panels, modal
- [x] AppLogo inline SVG (orange rounded square with magnifying glass)
- [x] favicon.svg matches AppLogo design
- [x] CSS consistency — all hardcoded hex colors replaced with CSS variables across all views
- [x] Privacy Policy page (`/privacy`) — GDPR-compliant with data table, AI notice, right to erasure
- [x] Per-route `<title>` tags via `meta.title` + `router.afterEach`
- [x] HomeView error state for stats (`store.statsError` shown on API failure)

---

## In Progress / Next

### HIGH

- [ ] **Rate limiting on auth endpoints**
  - Login, register, forgot-password have no rate limiting in backend
  - Options: Azure API Management, middleware per-IP counter (in-memory), or 429 after N attempts

### MEDIUM

- [ ] **Rate limiting on auth endpoints**
  - Login, register, forgot-password have no rate limiting in backend
  - Options: Azure API Management, middleware per-IP counter (in-memory), or 429 after N attempts

- [ ] **`aria-invalid` / `aria-describedby` on form validation errors**
  - Forms show error text but inputs don't have aria attributes linking them to error messages
  - Affects: LoginView, RegisterView, ProfileView, ApplicationPanel

- [ ] **IND data freshness indicator**
  - Show "Last synced: {date}" somewhere in CompaniesView
  - Requires either a `/api/dashboard/sponsors/meta` endpoint or storing sync timestamp in DB

### LOW

- [ ] **Email change in profile** — currently no way to change email after registration
- [ ] **First-login onboarding banner** — show a dismissible tip on first login
- [ ] **Confirm password field on register** — currently no confirm password, only client-side minlength check

---

## Infrastructure

- [X] Register `microsoft.operationalinsights` provider on Azure subscription
  (Application Insights Bicep fails until this provider is registered)
  → Azure Portal → Subscriptions → Resource providers → search "operationalinsights" → Register
