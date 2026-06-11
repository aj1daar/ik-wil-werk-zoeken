# ik wil werk zoeken

A personal job-search tracker for Highly Skilled Migrants in the Netherlands. Browse IND-recognized sponsor companies, track your application pipeline, and manage your job-search preferences — all in one place.

> **"ik wil werk zoeken"** = "I want to look for work" (Dutch)

---

## Features

- **IND sponsor browser** — searchable, filterable list of companies from the Dutch IND public register, synced monthly
- **Application pipeline** — track each company through 9 stages: Bookmarked → Applied → Ongoing Interview → Offer Proposed → Offer Accepted (and rejection/withdrawal states)
- **Bookmarked view** — card grid of all tracked companies with notes, cities, and status chips
- **User accounts** — open registration with per-user data isolation; JWT-authenticated sessions
- **Profile & preferences** — display name, email, change password, target role, preferred location, work arrangement
- **GDPR compliant** — explicit consent at registration, data minimization, right to deletion
- **EU AI Act transparency** — notice displayed wherever Google Gemini-generated company summaries appear

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite + Tailwind CSS + Pinia + Vue Router |
| Backend | Azure Functions (.NET 8 isolated worker) |
| User storage | Azure Table Storage (`iwwzusers` table) |
| Auth | JWT HS256 · PBKDF2-SHA256 (100 000 iterations) |
| Hosting | Cloudflare Pages (frontend) · Azure consumption plan (backend) |

---

## Monorepo Layout

```
/
├── backend/                 Azure Functions (.NET 8)
│   ├── Functions/
│   │   ├── AuthFunction.cs          POST /api/auth/*
│   │   ├── DashboardCrudFunction.cs GET|POST|PUT|DELETE /api/dashboard/*
│   │   └── MonthlyIndSponsorSyncFunction.cs  timer trigger
│   ├── Models/              UserEntity, SponsorCompany, ApplicationStage, AuthModels
│   └── Services/            PasswordHasher, TokenService, UserStore, SponsorStore
│
├── backend.Tests/           xUnit tests (80 tests)
│
├── frontend/                Vue 3 SPA
│   └── src/
│       ├── components/      AppNavbar, AppLogo, CompanyPanel, PasswordField, FormMessage
│       ├── views/           DashboardView, BookmarkedView, ProfileView, LoginView, RegisterView
│       ├── stores/          auth (Pinia), companies (Pinia)
│       └── router/          index.ts — auth-guard navigation
│
└── frontend/src/**/__tests__/  Vitest tests (156 tests)
```

---

## API Endpoints

### Auth (`/api/auth/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | — | Email + password → JWT |
| `POST` | `/api/auth/register` | — | Register with GDPR consent → JWT |
| `PUT`  | `/api/auth/profile` | Bearer | Update name / preferences → new JWT |
| `POST` | `/api/auth/change-password` | Bearer | Verify current password and set new one |

### Dashboard (`/api/dashboard/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`    | `/api/dashboard/sponsors` | Bearer | All IND sponsor companies |
| `GET`    | `/api/dashboard/stages`   | Bearer | User's application records |
| `POST`   | `/api/dashboard/stages`   | Bearer | Create application record |
| `PUT`    | `/api/dashboard/stages/{id}` | Bearer | Update application record |
| `DELETE` | `/api/dashboard/stages/{id}` | Bearer | Delete application record |

### Timer

| Trigger | Schedule | Description |
|---------|----------|-------------|
| `MonthlyIndSponsorSync` | Monthly (cron) | Fetches the IND public register and refreshes the in-memory sponsor list |

---

## Local Development

### Prerequisites

- Node.js 18+ and pnpm
- .NET 8 SDK
- Azure Functions Core Tools v4
- Azurite (or a real Azure Storage connection string) for local Table Storage

### Backend

```bash
cd backend
# Copy and fill in secrets — never commit this file
cp local.settings.example.json local.settings.json

func start
# Listens on http://localhost:7071
```

**Required environment variables** (set in `local.settings.json` or Azure App Settings):

| Variable | Description |
|---|---|
| `JWT_SECRET` | Random string ≥ 32 chars used to sign/verify JWTs |
| `AzureWebJobsStorage` | Connection string for Azure Table Storage (user accounts) |
| `GEMINI_API_KEY` | Google Gemini API key for company summary enrichment |
| `IND_REGISTER_URL` | URL of the IND public sponsor register (CSV/JSON) |
| `ALLOWED_ORIGIN` | Allowed CORS origin — set to `https://iwwz.nogoibay.org` in production (defaults to `*` locally) |

Secrets are deployed separately and never committed:

```bash
az functionapp config appsettings set \
  --name <app-name> --resource-group <rg> \
  --settings JWT_SECRET="..." GEMINI_API_KEY="..." ALLOWED_ORIGIN="https://iwwz.nogoibay.org"
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

### Backend (xUnit · 80 tests)

```bash
dotnet test backend.Tests
```

Covers: `PasswordHasher` (hash format, randomness, round-trips, malformed/tampered inputs), `TokenService` (JWT creation, validation, expiry, tamper detection, `GetEmail`), seed data integrity.

### Frontend (Vitest · 156 tests)

```bash
cd frontend
pnpm test
```

Covers: auth store (login, register, updateProfile, changePassword, JWT parsing, logout), companies store, `PasswordField` / `FormMessage` / `AppLogo` components, router navigation guards (auth redirect, login redirect for authenticated users), `LoginView` and `RegisterView` (form state, GDPR enforcement, API calls, navigation).

---

## Security Notes

- Passwords hashed with PBKDF2-SHA256, 100 000 iterations, 16-byte random salt — stored as `SHA256.<iter>.<b64salt>.<b64hash>`
- Constant-time comparison (`CryptographicOperations.FixedTimeEquals`) prevents timing attacks
- Login returns the same `"Invalid credentials"` message for unknown email and wrong password to prevent user enumeration
- JWTs expire after 7 days; no refresh tokens (re-login required)
- All protected routes verified server-side via `Authorization: Bearer <token>` header

---

## License

Personal use. Not licensed for redistribution.
