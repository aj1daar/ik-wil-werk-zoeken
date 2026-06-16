# ik wil werk zoeken

A personal job-search tracker for Highly Skilled Migrants in the Netherlands. Browse IND-recognized sponsor companies, track your application pipeline, and manage your job-search preferences — all in one place.

> **"ik wil werk zoeken"** = "I want to look for work" (Dutch)

---

## Features

### Application Tracking
- **Application pipeline** — track applications through 7 statuses: Applied · Interviewing · Offer Received · On Hold · Rejected · Withdrawn · Accepted
- **Split-panel mode** — toggle between full-width list + modal and a two-column split (list + detail panel side-by-side) in ApplicationsView; preference persisted in `localStorage`
- **Kanban board view** — switch ApplicationsView to a per-status column board; empty columns hidden by default with a "show empty" toggle
- **Follow-up dates** — set a follow-up date per application; overdue badges in the list; overdue follow-ups collapsible card on the dashboard
- **Activity log** — every field change is logged with old/new values and timestamp; collapsible history section in the detail panel
- **Status history** — manual timeline of status transitions per application with editable dates
- **Bulk status update** — select multiple applications and change their status in one action
- **Job posting URL** — optional link to the original job posting, openable in one click from the detail panel
- **Company typeahead** — both the new-application modal and the detail panel search the IND sponsor list as you type; selecting a company pre-fills available enrichment context
- **Text search** — searches company name, position, notes, contact name, and contact email
- **Sort options** — newest, oldest, last updated, company A–Z, follow-up date ↑
- **Collapsible filter panel** — status filter and sort controls collapse behind a toggle button with an active-filter count badge
- **CSV export** — download all applications as a CSV file
- **Unsaved changes guard** — custom confirm dialog (not a browser native popup) warns before discarding edits or deleting an application

### IND Sponsor Browser
- **Company browser** — searchable, filterable list of all IND-recognized sponsor companies, synced monthly from the Dutch public register
- **Company enrichment** — AI-generated fields per company (via Gemini, all output in English): city, working language, remote policy, company size, website URL, target market, parent company name, core industry, tech stack tags, functional tags, and a plain-language summary. City from the IND register takes precedence over the AI value when available.
- **Tag taxonomy** — 47 tech-stack tags (`.NET`, `AI/ML`, `Docker`, `Vue.js`, `MATLAB`, `Terraform`, …) and 36 functional tags (`AgriTech`, `CyberSecurity`, `MedTech`, `Gaming`, `Telecom`, …); constrained server-side so free-form AI output is normalised to the allowed enum
- **Searchable tag panel** — top 60 most-used tags shown by default (sorted by usage frequency); type to search across all tags
- **Advanced filters** — city, working language, company size, remote policy, tech/functional tags (include/exclude), applied-only toggle
- **Sort options** — A→Z, Z→A, city A–Z, default (API order)
- **Company grouping** — subsidiaries are collapsed under their parent company; toggle to expand
- **"Not interested" hiding** — hide individual companies from the list; stored in `localStorage`; "Show hidden (N)" toggle to reveal
- **Load all** — single click to show all companies instead of paging through 60-at-a-time
- **Applied overlay** — companies where you have an active application show your current status chip

### Dashboard
- **KPI strip** — total applied, response rate, offer rate, average days to first response
- **Application status bar** — horizontal stacked bar showing all 7 statuses proportionally; hover any segment or legend row for an exact count and percentage; zero-count statuses shown dimmed in the legend
- **Rejection breakdown chart** — donut chart of rejection reasons (another candidate, incompatible profile, Dutch language requirement, salary mismatch, filled internally, other, no reason given)
- **Applications over time** — area chart of weekly application volume
- **Date range filter** — Last week, Last month, Last 3 months, Last 6 months, Last year (default), Custom; all charts and KPIs respond to the filter. Custom mode includes an "Overall (all time)" toggle and a native-styled date picker (no browser date popup)
- **Overdue follow-ups card** — collapsible amber card listing applications with past-due follow-up dates (max 5, sorted by urgency)

### Auth & Accounts
- **User accounts** — open registration with per-user data isolation; JWT HS256 sessions (7-day expiry)
- **Email verification** — 72-hour HMAC token sent on registration; resend endpoint available
- **Forgot/reset password** — email-based reset via Resend; stateless HMAC token, 1-hour expiry
- **Email change** — sends a 24-hour confirmation link to the new address before switching
- **Silent session refresh** — refreshes the JWT when < 2 h remain and the user is active; manual "Extend session" button in the expiry warning banner
- **Profile & preferences** — display name, change password, target role, preferred location, work arrangement
- **Account deletion** — GDPR right-to-erasure; removes all applications and user data

### UI / UX
- **Custom confirm dialog** — replaces all `window.confirm()` calls; styled to match the design system, keyboard-accessible (Esc to cancel, Enter to confirm)
- **Custom date picker** — fully themed calendar dropdown replacing native `<input type="date">`; keyboard-navigable with arrow keys, Page Up/Down for month, Enter to select
- **Dark mode** — toggleable via moon/sun button in navbar; persisted in `localStorage`
- **Page transitions** — fade + 8 px translateY on every route change
- **Panel & modal animations** — slide-in/out for detail panel, scale + fade for modals, stagger on list load/filter
- **GDPR compliant** — explicit consent at registration, data minimization, right to deletion, Privacy Policy page
- **EU AI Act transparency** — disclosure notice wherever AI-generated company summaries appear
- **Admin panel** — list users, promote to admin, trigger manual IND sponsor reload, view sync history

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite + Pinia + Vue Router |
| Charts | Apache ECharts + vue-echarts (rejection donut, area chart); pure CSS/Vue (status stacked bar) |
| Backend | ASP.NET Core Web API (.NET 8) |
| Database | PostgreSQL 18 on Hetzner via EF Core + Npgsql |
| Auth | JWT HS256 · PBKDF2-SHA256 (100 000 iterations) |
| Email | Resend (verification, password reset, email change) |
| AI enrichment | Google Gemini 2.0 Flash (batch company enrichment, 20 companies per call) |
| Hosting | Cloudflare Pages (frontend) · Hetzner CX23 behind Nginx (backend) |

**Request flow:** `Browser → Cloudflare (HTTPS) → Nginx :80 → ASP.NET Core :5000 → PostgreSQL 18`

---

## Monorepo Layout

```
/
├── backend/                 ASP.NET Core Web API (.NET 8)
│   ├── Controllers/
│   │   ├── AuthController.cs            POST|PUT|GET|DELETE /api/auth/*
│   │   ├── DashboardController.cs       GET|POST|PUT|PATCH|DELETE /api/dashboard/*
│   │   ├── AdminController.cs           GET|POST /api/mgmt/*
│   │   └── ApiControllerBase.cs         Shared helpers (auth check, client IP, error response)
│   ├── Workers/
│   │   └── MonthlyIndSponsorSyncWorker.cs  BackgroundService — runs on 20th of each month
│   ├── Data/
│   │   ├── AppDbContext.cs              EF Core DbContext
│   │   ├── AppDbContextFactory.cs       Design-time factory (dotnet ef tooling)
│   │   └── Migrations/                  EF Core migrations (applied automatically on startup)
│   ├── Models/              User, SponsorCompany, ApplicationStage,
│   │                        ActivityLog, StatusHistory, SyncLog, AuthModels
│   └── Services/            PasswordHasher, TokenService, EmailService,
│                            UserStore, StageStore, SponsorStore,
│                            IndSponsorScraper, CompanyEnricher, RateLimiterService
│
├── backend.Tests/           xUnit tests (295 tests)
│
├── frontend/                Vue 3 SPA
│   └── src/
│       ├── components/
│       │   ├── AppNavbar/               Top navigation bar
│       │   ├── AppLogo/                 Inline SVG logo
│       │   ├── ApplicationPanel/        Application detail / edit panel (with company typeahead)
│       │   ├── NewApplicationModal/     Create application modal with company typeahead
│       │   ├── ConfirmDialog/           Custom confirm/cancel dialog (replaces window.confirm)
│       │   ├── DatePicker/              Custom calendar date picker (replaces input[type=date])
│       │   ├── PasswordField/           Password input with show/hide toggle
│       │   ├── FunnelChart/             Horizontal stacked bar by application status (pure CSS)
│       │   ├── RejectionChart/          ECharts rejection reason donut
│       │   ├── AreaChart/               ECharts applications-over-time area chart
│       │   └── ui/                      AppSelect, AppInput, AppButton shared components
│       ├── views/           Home, Applications, Companies, Profile,
│       │                    Login, Register, ForgotPassword, ResetPassword,
│       │                    VerifyEmail, ConfirmEmailChange, Admin, Privacy
│       ├── stores/          auth, companies, applications (Pinia)
│       ├── composables/     useSessionExpiry, useTokenRefresh, useTheme
│       └── router/          index.ts — auth-guard + admin-guard navigation
│
└── frontend/src/**/__tests__/  Vitest tests (565 tests)
```

---

## API Endpoints

### Auth (`/api/auth/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST`   | `/api/auth/login`                | —      | Email + password → JWT |
| `POST`   | `/api/auth/register`             | —      | Register with GDPR consent |
| `POST`   | `/api/auth/refresh`              | Bearer | Issue new JWT if current token is valid |
| `GET`    | `/api/auth/verify-email`         | —      | Validate email verification token (72 h HMAC) |
| `POST`   | `/api/auth/resend-verification`  | —      | Re-send verification email (always 204) |
| `PUT`    | `/api/auth/profile`              | Bearer | Update name / preferences |
| `POST`   | `/api/auth/change-password`      | Bearer | Verify current password and set new one |
| `POST`   | `/api/auth/change-email`         | Bearer | Send confirmation link to new address |
| `GET`    | `/api/auth/confirm-email-change` | —      | Validate email-change token and swap address |
| `POST`   | `/api/auth/forgot-password`      | —      | Send password-reset email (always 204) |
| `POST`   | `/api/auth/reset-password`       | —      | Validate signed token and set new password |
| `DELETE` | `/api/auth/account`              | Bearer | Delete account and all data (GDPR erasure) |

### Dashboard (`/api/dashboard/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`    | `/api/dashboard/sponsors`                         | Bearer | All active IND sponsor companies |
| `GET`    | `/api/dashboard/applications`                     | Bearer | User's job applications |
| `POST`   | `/api/dashboard/applications`                     | Bearer | Create application |
| `PUT`    | `/api/dashboard/applications/{id}`                | Bearer | Update application (full replace) |
| `PATCH`  | `/api/dashboard/applications`                     | Bearer | Bulk status update |
| `DELETE` | `/api/dashboard/applications/{id}`                | Bearer | Delete application |
| `GET`    | `/api/dashboard/stats?from=&to=`                  | Bearer | Counts by status (optional ISO date range) |
| `GET`    | `/api/dashboard/activity/{applicationId}`         | Bearer | Activity log for a single application |
| `GET`    | `/api/dashboard/status-history/{applicationId}`   | Bearer | Status timeline for a single application |
| `POST`   | `/api/dashboard/status-history/{applicationId}`   | Bearer | Add a status history entry |
| `PUT`    | `/api/dashboard/status-history-item/{historyId}`  | Bearer | Update a status history entry |
| `DELETE` | `/api/dashboard/status-history-item/{historyId}`  | Bearer | Delete a status history entry |

### Admin (`/api/mgmt/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/api/mgmt/users`           | Bearer (admin) | List all registered users |
| `POST` | `/api/mgmt/promote`         | Bearer (admin) | Promote user to admin by email |
| `POST` | `/api/mgmt/reload-sponsors` | Bearer (admin) | Scrape IND register and insert new companies only; never overwrites existing ones; soft-deletes companies no longer on the register |
| `POST` | `/api/mgmt/enrich-sponsors` | Bearer (admin) | Enrich unenriched companies via Gemini in batches of 100; safe to call repeatedly until all are done |
| `GET`  | `/api/mgmt/sync-logs`       | Bearer (admin) | IND sync history |

### Background Worker

| Trigger | Schedule | Description |
|---------|----------|-------------|
| `MonthlyIndSponsorSyncWorker` | Monthly (20th at midnight UTC) | Fetches the IND public register, inserts new companies only (never overwrites existing ones), soft-deletes companies no longer on the register, enriches new companies via Gemini batch API |

---

## Local Development

### Prerequisites

- Node.js 22+ and pnpm
- .NET 8 SDK
- Docker (for local PostgreSQL)

### Backend

```bash
# 1. Start PostgreSQL
docker compose up -d db

# 2. Apply database migrations (runs automatically on startup too)
dotnet ef database update --project backend --startup-project backend

# 3. Start the API
cd backend
dotnet run
# Listens on http://localhost:7198
```

Environment variables are set via `backend/Properties/launchSettings.json` for local development (already configured for Docker Compose defaults). In production they come from the `.env` file written by the CI/CD pipeline.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Npgsql connection string — `Host=localhost;Database=iwwz;Username=postgres;Password=postgres` locally |
| `JWT_SECRET` | ✅ | Random string ≥ 32 chars — signs and verifies JWTs and HMAC tokens |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for AI company enrichment |
| `ALLOWED_ORIGIN` | ✅ | CORS origin — `http://localhost:5173` locally, `https://iwwz.nogoibay.org` in prod |
| `ADMIN_EMAIL` | ✅ | Email address seeded as admin on first startup (idempotent) |
| `RESEND_API_KEY` | — | Resend API key — if absent, emails are silently skipped (fine for local dev) |
| `RESEND_FROM` | — | From address for transactional emails (default: `noreply@nogoibay.org`) |

### EF Core Migrations

Migrations apply automatically at startup via `db.Database.MigrateAsync()`. To add a new migration during development:

```bash
dotnet ef migrations add <MigrationName> --project backend --startup-project backend
dotnet ef database update --project backend --startup-project backend
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
# Opens http://localhost:5173, proxies /api → http://localhost:7198
```

---

## Testing

### Backend (xUnit · 295 tests)

```bash
dotnet test backend.Tests
```

Covers: `PasswordHasher` (hash format, randomness, round-trips, malformed/tampered inputs), `TokenService` (JWT creation, validation, expiry, tamper detection, `GetEmail`/`GetUserId`/`GetRole`, reset and email-change token creation and validation), `StageStore` (EF Core CRUD, user isolation, not-found handling, follow-up dates, job URL, bulk status update, activity log), `UserStore` (CRUD, email uniqueness, role promotion), `SponsorStore` (upsert, soft-delete, sync logs), `CompanyEnricher` (batch enrichment, tag enum filtering, city population, low-confidence skipping, refinement pass, URL validation), `DashboardController` helpers (`ValidateStage`, `BuildActivityLogs`), seed data integrity.

### Frontend (Vitest · 565 tests)

```bash
cd frontend
pnpm test
```

Covers: auth store, companies store (search, filter, grouping, tag usage ranking), applications store (CRUD, stats, date-range filtering, bulk update), `AppLogo` / `PasswordField` / `ApplicationPanel` / `NewApplicationModal` / `ConfirmDialog` / `DatePicker` / `AppSelect` / `AppInput` / `AppButton` components, `FunnelChart` (status stacked bar — segments, legend, reactivity) / `RejectionChart` / `AreaChart` (ECharts mocked), router navigation guards (auth + admin), `LoginView`, `RegisterView`, `HomeView` (stats dashboard, date filter, custom date picker, overdue follow-ups, range buttons), `ApplicationsView` (sort, filter, split-panel, kanban), `CompaniesView` (sort, filter, hiding, grouping, load-all, tag search), `AdminView`, `ForgotPasswordView`, `ResetPasswordView`.

---

## AI Enrichment

Company data is enriched via **Google Gemini 2.0 Flash** in batches of 20. All output is enforced to be in English. Fields enriched:

| Field | Source priority | Notes |
|---|---|---|
| `city` | IND register → Gemini | Gemini only fills if IND didn't provide a city |
| `summary` | Gemini | 2–3 sentence plain-English description |
| `coreIndustry` | Gemini | Single broad English label |
| `techStackTags` | Gemini | Up to 8 tags from a fixed 47-value enum |
| `functionalTags` | Gemini | Up to 6 tags from a fixed 36-value enum |
| `workingLanguage` | Gemini | `English` / `Dutch` / `Mixed` |
| `companySize` | Gemini | `startup` / `scaleup` / `mid` / `large` / `enterprise` |
| `remotePolicy` | Gemini | `remote` / `hybrid` / `office` / `unknown` |
| `targetMarket` | Gemini | `B2B` / `B2C` / `B2G` / `Mixed` |
| `parentCompanyName` | Gemini | Well-known parent brand, or null |
| `websiteUrl` | Gemini + HTTP validation | URL is validated with a HEAD request; nulled on failure |

Low-confidence results (`"confidence": "low"`) mark the company as enriched without writing field data, preventing expensive re-enrichment on every sync. A refinement pass corrects invalid enum values returned by the model.

Enrichment is versioned (`CurrentVersion = 4`). Bumping the version triggers re-enrichment of all companies on the next monthly sync or manual admin reload.

### Gemini cost estimate for full initial enrichment (12,800 companies)

| | Tokens | Cost |
|---|---|---|
| Input (640 calls × ~800 tokens) | ~512K | $0.05 |
| Output (640 calls × ~3,300 tokens) | ~2.1M | $0.85 |
| Refinement pass (~10% of batches) | ~55K | $0.10 |
| **Total** | | **~$1.00** |

Pricing basis: Gemini 2.0 Flash at $0.10/1M input tokens, $0.40/1M output tokens. Ongoing monthly syncs add only the delta (new/changed companies), typically a few hundred at most.

---

## CI/CD

The GitHub Actions workflow (`.github/workflows/ci-cd.yml`) runs lint → test → build → deploy on every push to `main`. EF Core migrations apply automatically at startup via `Database.MigrateAsync()`.

### Secrets (Settings → Secrets → Actions)

| Name | Description |
|------|-------------|
| `HETZNER_HOST` | Hetzner server IP address |
| `HETZNER_SSH_KEY` | Private SSH key for the `iwwz` deploy user |
| `DATABASE_URL` | Npgsql connection string for the production PostgreSQL instance |
| `JWT_SECRET` | Random string ≥ 32 chars |
| `GEMINI_API_KEY` | Google Gemini API key |
| `RESEND_API_KEY` | Resend API key |
| `ADMIN_EMAIL` | Email address seeded as the first admin user |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages:Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

### Variables (Settings → Variables → Actions)

| Name | Example value |
|------|--------------|
| `ALLOWED_ORIGIN` | `https://iwwz.nogoibay.org` |
| `VITE_API_BASE_URL` | `https://api.nogoibay.org` |
| `CLOUDFLARE_PAGES_PROJECT` | `ik-wil-werk-zoeken-frontend` |

---

## Security Notes

- Passwords hashed with PBKDF2-SHA256, 100 000 iterations, 16-byte random salt
- Constant-time comparison (`CryptographicOperations.FixedTimeEquals`) prevents timing attacks on login, password-reset, and email-change token validation
- Login returns the same `"Invalid credentials"` message for unknown email and wrong password (no user enumeration)
- Forgot-password and resend-verification always return 204 regardless of whether the email exists
- Password-reset and email-change tokens are stateless HMAC-SHA256 signatures (`userId.exp.sig`), expire after 1 hour and 24 hours respectively
- JWTs expire after 7 days; the refresh endpoint only accepts non-expired tokens and is rate-limited to 10 requests per hour per IP
- All protected routes verified server-side via `Authorization: Bearer <token>` header
- Admin endpoints require `role === "admin"` claim in the JWT; non-admins receive 403
- In-memory fixed-window rate limiter on all auth endpoints (login, register, forgot-password, refresh, etc.)
- `ADMIN_EMAIL` is read from an environment variable at startup and never stored in source code or git history

---

## License

Personal use. Not licensed for redistribution.
