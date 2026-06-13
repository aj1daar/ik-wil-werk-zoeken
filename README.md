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
- **Bulk status update** — select multiple applications and change their status in one action
- **Job posting URL** — optional link to the original job posting, openable in one click from the detail panel
- **Text search** — searches company name, position, notes, contact name, and contact email
- **Sort options** — newest, oldest, last updated, company A–Z, follow-up date ↑
- **CSV export** — download all applications as a CSV file
- **Unsaved changes guard** — detail panel and new-application modal warn before discarding edits

### IND Sponsor Browser
- **Company browser** — searchable, filterable list of all IND-recognized sponsor companies, synced monthly from the Dutch public register
- **Company enrichment** — AI-generated fields per company: working language, remote policy, company size, website URL, target market, parent company name, core industry, tech stack tags, functional tags, and a plain-language summary
- **Advanced filters** — city, working language, company size, remote policy, tech/functional tags (include/exclude), applied-only toggle
- **Sort options** — A→Z, Z→A, city A–Z, default (API order)
- **Company grouping** — subsidiaries are collapsed under their parent company; toggle to expand
- **"Not interested" hiding** — hide individual companies from the list; stored in `localStorage`; "Show hidden (N)" toggle to reveal
- **Load all** — single click to show all companies instead of paging through 60-at-a-time
- **Applied overlay** — companies where you have an active application show your current status chip
- **Company typeahead** — new-application modal searches the IND sponsor list as you type and pre-fills city and enrichment context on selection

### Dashboard
- **KPI strip** — total applied, response rate, offer rate, average days to first response
- **Application funnel chart** — conversion pipeline (Applied → Interviewing → Offer → Accepted) with drop-off percentages
- **Rejection breakdown chart** — donut chart of rejection reasons (another candidate, incompatible profile, Dutch language requirement, salary mismatch, filled internally, other, no reason given)
- **Applications over time** — area chart of weekly application volume
- **Date range filter** — Overall, Last month, Last 3 months, Last 6 months, Last year, Custom; all charts and KPIs respond to the filter
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
| Charts | Apache ECharts + vue-echarts |
| Backend | Azure Functions (.NET 8 isolated worker) |
| Database | PostgreSQL (Azure Database for PostgreSQL Flexible Server) via EF Core |
| Auth | JWT HS256 · PBKDF2-SHA256 (100 000 iterations) |
| Email | Resend (verification, password reset, email change) |
| AI enrichment | Google Gemini (batch company summaries, 20 companies per call) |
| Hosting | Cloudflare Pages (frontend) · Azure consumption plan (backend) |

---

## Monorepo Layout

```
/
├── backend/                 Azure Functions (.NET 8)
│   ├── Data/
│   │   ├── AppDbContext.cs              EF Core DbContext
│   │   ├── AppDbContextFactory.cs       Design-time factory (dotnet ef tooling)
│   │   └── Migrations/                  EF Core migrations
│   ├── Functions/
│   │   ├── AuthFunction.cs              POST /api/auth/*
│   │   ├── DashboardCrudFunction.cs     GET|POST|PUT|PATCH|DELETE /api/dashboard/*
│   │   ├── AdminFunction.cs             GET|POST /api/admin/*
│   │   └── MonthlyIndSponsorSyncFunction.cs  timer trigger
│   ├── Models/              User, SponsorCompany, ApplicationStage,
│   │                        ActivityLog, SyncLog, AuthModels
│   └── Services/            PasswordHasher, TokenService, EmailService,
│                            UserStore, StageStore, SponsorStore,
│                            IndSponsorScraper, CompanyEnricher, RateLimiterService
│
├── backend.Tests/           xUnit tests (262 tests)
│
├── frontend/                Vue 3 SPA
│   └── src/
│       ├── components/
│       │   ├── AppNavbar/               Top navigation bar
│       │   ├── AppLogo/                 Inline SVG logo
│       │   ├── ApplicationPanel/        Application detail / edit panel
│       │   ├── NewApplicationModal/     Create application modal with company typeahead
│       │   ├── PasswordField/           Password input with show/hide toggle
│       │   ├── FunnelChart/             ECharts application funnel
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
├── frontend/src/**/__tests__/  Vitest tests (559 tests)
│
└── infra/                   Azure Bicep (subscription-scope)
    ├── main.bicep            Resource group + module wiring
    └── resources.bicep       Storage, PostgreSQL, Functions, App Insights
```

---

## API Endpoints

### Auth (`/api/auth/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST`   | `/api/auth/login`                | —      | Email + password → JWT |
| `POST`   | `/api/auth/register`             | —      | Register with GDPR consent → JWT |
| `POST`   | `/api/auth/refresh`              | Bearer | Issue new JWT if current token is valid and non-expired |
| `GET`    | `/api/auth/verify-email`         | —      | Validate email verification token (72 h HMAC) |
| `POST`   | `/api/auth/resend-verification`  | —      | Re-send verification email (always 204, anti-enumeration) |
| `PUT`    | `/api/auth/profile`              | Bearer | Update name / preferences → new JWT |
| `POST`   | `/api/auth/change-password`      | Bearer | Verify current password and set new one |
| `POST`   | `/api/auth/change-email`         | Bearer | Send confirmation link to new address |
| `GET`    | `/api/auth/confirm-email-change` | —      | Validate email-change token and swap address → new JWT |
| `POST`   | `/api/auth/forgot-password`      | —      | Send password-reset email (always 204, anti-enumeration) |
| `POST`   | `/api/auth/reset-password`       | —      | Validate signed token and set new password |
| `DELETE` | `/api/auth/account`              | Bearer | Delete account and all data (GDPR erasure) |

### Dashboard (`/api/dashboard/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`    | `/api/dashboard/sponsors`                  | Bearer | All IND sponsor companies |
| `GET`    | `/api/dashboard/applications`              | Bearer | User's job applications |
| `POST`   | `/api/dashboard/applications`              | Bearer | Create application |
| `PUT`    | `/api/dashboard/applications/{id}`         | Bearer | Update application (full replace) |
| `PATCH`  | `/api/dashboard/applications`              | Bearer | Bulk status update (array of `{id, status}`) |
| `DELETE` | `/api/dashboard/applications/{id}`         | Bearer | Delete application |
| `GET`    | `/api/dashboard/stats?from=&to=`           | Bearer | Counts by status (optional ISO date range) |
| `GET`    | `/api/dashboard/activity-log/{id}`         | Bearer | Activity log for a single application |

### Admin (`/api/admin/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/api/admin/users`           | Bearer (admin) | List all registered users |
| `POST` | `/api/admin/promote`         | Bearer (admin) | Promote user to admin by email |
| `POST` | `/api/admin/reload-sponsors` | Bearer (admin) | Full IND scrape + upsert + LLM enrichment |
| `GET`  | `/api/admin/sync-logs`       | Bearer (admin) | IND sync history (added/updated/removed/enriched counts) |

### Timer

| Trigger | Schedule | Description |
|---------|----------|-------------|
| `MonthlyIndSponsorSync` | Monthly (20th) | Fetches the IND public register, upserts all sponsors, soft-deletes removed entries, re-enriches stale companies via Gemini batch API |

---

## Local Development

### Prerequisites

- Node.js 18+ and pnpm
- .NET 8 SDK
- Azure Functions Core Tools v4
- Docker (for local PostgreSQL)

### Backend

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Copy and fill in secrets — never commit local.settings.json
cp backend/local.settings.example.json backend/local.settings.json

# 3. Apply database migrations
dotnet ef database update --project backend --startup-project backend

# 4. Start the functions host
cd backend
func start
# Listens on http://localhost:7071
```

**Environment variables** (set in `local.settings.json` for local dev, or as Azure App Settings in production):

| Variable | Required | Description |
|---|---|---|
| `AzureWebJobsStorage` | ✅ | Azure Storage connection string (required by Functions runtime for timer triggers) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string — `Host=localhost;Database=iwwz;Username=postgres;Password=postgres` locally |
| `JWT_SECRET` | ✅ | Random string ≥ 32 chars — signs and verifies JWTs and password-reset/email-change tokens |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for AI company enrichment |
| `ALLOWED_ORIGIN` | ✅ | CORS origin — `http://localhost:5173` locally, `https://iwwz.nogoibay.org` in prod |
| `ADMIN_EMAIL` | ✅ | Email address seeded as admin on first startup (idempotent) |
| `RESEND_API_KEY` | — | Resend API key — if absent, emails are silently skipped (fine for local dev) |
| `RESEND_FROM` | — | From address for transactional emails (default: `noreply@iwwz.nogoibay.org`) |

### EF Core Migrations

In production, migrations run automatically in CI before each deploy. To add a new migration during development:

```bash
dotnet ef migrations add <MigrationName> --project backend --startup-project backend
dotnet ef database update --project backend --startup-project backend
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
# Opens http://localhost:5173, proxies /api → http://localhost:7071
```

---

## Testing

### Backend (xUnit · 262 tests)

```bash
dotnet test backend.Tests
```

Covers: `PasswordHasher` (hash format, randomness, round-trips, malformed/tampered inputs), `TokenService` (JWT creation, validation, expiry, tamper detection, `GetEmail`/`GetUserId`/`GetRole`, reset and email-change token creation and validation), `StageStore` (EF Core CRUD, user isolation, not-found handling, follow-up dates, job URL, bulk status update, activity log), `UserStore` (CRUD, email uniqueness, role promotion), `SponsorStore` (upsert, soft-delete, sync logs), seed data integrity, `CreateResetToken` / `ValidateResetToken`.

### Frontend (Vitest · 559 tests)

```bash
cd frontend
pnpm test
```

Covers: auth store, companies store (search, filter, grouping), applications store (CRUD, stats, date-range filtering, bulk update), `AppLogo` / `PasswordField` / `ApplicationPanel` / `NewApplicationModal` / `AppSelect` / `AppInput` / `AppButton` components, `FunnelChart` / `RejectionChart` / `AreaChart` (ECharts mocked), router navigation guards (auth + admin), `LoginView`, `RegisterView`, `HomeView` (stats dashboard, date filter, overdue follow-ups, range buttons), `ApplicationsView` (sort, filter, split-panel, kanban), `CompaniesView` (sort, filter, hiding, grouping, load-all), `AdminView`, `ForgotPasswordView`, `ResetPasswordView`.

---

## CI/CD Setup

The GitHub Actions workflow (`.github/workflows/ci-cd.yml`) runs lint → test → build → deploy on every push to `main`. Infrastructure is provisioned via Bicep on each deploy, including the PostgreSQL Flexible Server. EF Core migrations run automatically before the backend deploy step.

### Secrets (Settings → Secrets and variables → Actions)

| Name | Value |
|------|-------|
| `AZURE_CLIENT_ID` | Service principal client ID |
| `AZURE_TENANT_ID` | Azure tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages:Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `JWT_SECRET` | Random string ≥ 32 chars |
| `GEMINI_API_KEY` | Google Gemini API key |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM` | From address for transactional emails |
| `POSTGRES_PASSWORD` | PostgreSQL administrator password (used by Bicep and to construct `DATABASE_URL`) |
| `ADMIN_EMAIL` | Email address seeded as the first admin user |

### Variables (Settings → Secrets and variables → Actions → Variables)

| Name | Example value |
|------|--------------|
| `AZURE_RESOURCE_GROUP` | `iwwz-rg` |
| `AZURE_FUNCTION_APP_NAME` | `iwwz-api` |
| `AZURE_STORAGE_ACCOUNT` | `iwwzstorage` |
| `CLOUDFLARE_PAGES_PROJECT` | `iwwz` |
| `VITE_API_BASE_URL` | `https://iwwz-api.azurewebsites.net` |

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
