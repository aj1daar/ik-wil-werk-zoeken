# ik wil werk zoeken

A personal job-search tracker for Highly Skilled Migrants in the Netherlands. Browse IND-recognized sponsor companies, track your application pipeline, and manage your job-search preferences — all in one place.

> **"ik wil werk zoeken"** = "I want to look for work" (Dutch)

---

## Features

- **IND sponsor browser** — searchable, filterable list of companies from the Dutch IND public register, synced monthly
- **Application pipeline** — track each company through 9 stages: Bookmarked → Applied → Ongoing Interview → Offer Proposed → Offer Accepted (and rejection/withdrawal states)
- **Bookmarked view** — card grid of all tracked companies with notes, cities, and status chips
- **User accounts** — open registration with per-user data isolation; JWT-authenticated sessions
- **Profile & preferences** — display name, change password, target role, preferred location, work arrangement
- **Forgot password** — email-based password reset via Resend (1-hour signed token, no DB storage)
- **GDPR compliant** — explicit consent at registration, data minimization, right to deletion
- **EU AI Act transparency** — notice displayed wherever Google Gemini-generated company summaries appear

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite + Pinia + Vue Router |
| Backend | Azure Functions (.NET 8 isolated worker) |
| Database | PostgreSQL (Azure Database for PostgreSQL Flexible Server) via EF Core |
| Auth | JWT HS256 · PBKDF2-SHA256 (100 000 iterations) |
| Email | Resend (password reset) |
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
│   │   ├── DashboardCrudFunction.cs     GET|POST|PUT|DELETE /api/dashboard/*
│   │   └── MonthlyIndSponsorSyncFunction.cs  timer trigger
│   ├── Models/              User, SponsorCompany, ApplicationStage, AuthModels
│   └── Services/            PasswordHasher, TokenService, EmailService,
│                            UserStore, StageStore, SponsorStore
│
├── backend.Tests/           xUnit tests (104 tests)
│
├── frontend/                Vue 3 SPA
│   └── src/
│       ├── components/      AppNavbar, AppLogo, ApplicationPanel,
│       │                    NewApplicationModal, PasswordField
│       ├── views/           Home, Applications, Companies, Profile,
│       │                    Login, Register, ForgotPassword, ResetPassword
│       ├── stores/          auth (Pinia), companies (Pinia), applications (Pinia)
│       └── router/          index.ts — auth-guard navigation
│
├── frontend/src/**/__tests__/  Vitest tests (214 tests)
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
| `POST`   | `/api/auth/login`            | —      | Email + password → JWT |
| `POST`   | `/api/auth/register`         | —      | Register with GDPR consent → JWT |
| `PUT`    | `/api/auth/profile`          | Bearer | Update name / preferences → new JWT |
| `POST`   | `/api/auth/change-password`  | Bearer | Verify current password and set new one |
| `DELETE` | `/api/auth/account`          | Bearer | Delete account and all data (GDPR erasure) |
| `POST`   | `/api/auth/forgot-password`  | —      | Send password-reset email (always 204, anti-enumeration) |
| `POST`   | `/api/auth/reset-password`   | —      | Validate signed token and set new password |

### Dashboard (`/api/dashboard/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`    | `/api/dashboard/sponsors`            | Bearer | All IND sponsor companies |
| `GET`    | `/api/dashboard/applications`        | Bearer | User's job applications |
| `POST`   | `/api/dashboard/applications`        | Bearer | Create application |
| `PUT`    | `/api/dashboard/applications/{id}`   | Bearer | Update application |
| `DELETE` | `/api/dashboard/applications/{id}`   | Bearer | Delete application |
| `GET`    | `/api/dashboard/stats?from=&to=`     | Bearer | Counts by status (optional date range) |

### Timer

| Trigger | Schedule | Description |
|---------|----------|-------------|
| `MonthlyIndSponsorSync` | Monthly (20th) | Fetches the IND public register and refreshes the sponsor list |

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

# 3. Apply database migrations (first time, or after pulling new migrations)
dotnet ef database update --project backend --startup-project backend

# 4. Start the functions host
cd backend
func start
# Listens on http://localhost:7071
```

**Environment variables** (set in `local.settings.json` for local dev, or as Azure App Settings in production):

| Variable | Required | Description |
|---|---|---|
| `AzureWebJobsStorage` | ✅ | Azure Storage connection string (required by the Functions runtime for timer triggers) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string — `Host=localhost;Database=iwwz;Username=postgres;Password=postgres` locally |
| `JWT_SECRET` | ✅ | Random string ≥ 32 chars — signs and verifies JWTs and password-reset tokens |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for AI company summaries |
| `ALLOWED_ORIGIN` | ✅ | CORS origin — `http://localhost:5173` locally, `https://iwwz.nogoibay.org` in prod |
| `RESEND_API_KEY` | — | Resend API key — if absent, password reset emails are silently skipped (fine for local dev) |
| `RESEND_FROM` | — | From address for password-reset emails (default: `noreply@iwwz.nogoibay.org`) |

### EF Core migrations

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

### Backend (xUnit · 104 tests)

```bash
dotnet test backend.Tests
```

Covers: `PasswordHasher` (hash format, randomness, round-trips, malformed/tampered inputs), `TokenService` (JWT creation, validation, expiry, tamper detection, `GetEmail`, `GetUserId`, reset token creation and validation), `StageStore` (EF Core CRUD, user isolation, not-found handling), seed data integrity.

### Frontend (Vitest · 214 tests)

```bash
cd frontend
pnpm test
```

Covers: auth store, companies store, applications store (CRUD, stats, date-range filtering), `AppLogo` / `PasswordField` / `ApplicationPanel` / `NewApplicationModal` components, router navigation guards, `LoginView`, `RegisterView`, `HomeView` (stats dashboard, date filter).

---

## CI/CD Setup

The GitHub Actions workflow (`.github/workflows/ci-cd.yml`) runs lint → test → build → deploy on every push to `main`. Infrastructure is provisioned via Bicep on each deploy, including the PostgreSQL Flexible Server.

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
| `POSTGRES_PASSWORD` | PostgreSQL administrator password |
| `POSTGRES_PASSWORD` | PostgreSQL admin password (used by Bicep to provision the server and construct `DATABASE_URL`) |

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
- Constant-time comparison (`CryptographicOperations.FixedTimeEquals`) prevents timing attacks on login and password-reset token validation
- Login returns the same `"Invalid credentials"` message for unknown email and wrong password to prevent user enumeration
- Forgot-password always returns 204 regardless of whether the email exists
- Password-reset tokens are stateless HMAC-SHA256 signatures (`userId.exp.sig`), expire after 1 hour
- JWTs expire after 7 days; no refresh tokens (re-login required)
- All protected routes verified server-side via `Authorization: Bearer <token>` header

---

## License

Personal use. Not licensed for redistribution.
