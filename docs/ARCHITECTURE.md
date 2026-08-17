# Architecture

## Layout

```
backend/            ASP.NET Core Web API (.NET 8)
  Controllers/       Auth, Dashboard, Admin
  Workers/           MonthlyIndSponsorSyncWorker — runs on the 20th
  Data/               EF Core DbContext + Migrations (applied on startup)
  Models/             User, SponsorCompany, ApplicationStage, ActivityLog, StatusHistory, SyncLog
  Services/           PasswordHasher, TokenService, EmailService, UserStore, StageStore,
                       SponsorStore, IndSponsorScraper, CompanyEnricher, RateLimiterService
backend.Tests/       xUnit (295 tests)
frontend/            Vue 3 SPA
  src/components/     ApplicationPanel, NewApplicationModal, ConfirmDialog, DatePicker,
                       FunnelChart, RejectionChart, AreaChart, ui/ (AppSelect, AppInput, AppButton)
  src/views/          Home, Applications, Companies, Profile, Admin, auth views
  src/stores/         auth, companies, applications (Pinia)
  src/__tests__/       Vitest (565 tests)
```

Request flow: `Browser → Cloudflare → Nginx :80 → ASP.NET Core :5000 → Postgres 18`.

## API

### Auth `/api/auth/`
login, register, refresh, verify-email, resend-verification, profile (PUT), change-password,
change-email, confirm-email-change, forgot-password, reset-password, account (DELETE).

### Dashboard `/api/dashboard/`
sponsors (GET), applications (GET/POST/PUT/PATCH bulk/DELETE), stats?from=&to=,
activity/{id}, status-history/{id} (GET/POST), status-history-item/{id} (PUT/DELETE).

### Admin `/api/mgmt/`
users, promote, reload-sponsors (insert-new-only, soft-deletes removed ones),
enrich-sponsors (Gemini, batches of 100), sync-logs.

All non-auth routes require `Authorization: Bearer <jwt>`; admin routes additionally check
`role === "admin"`.

## AI enrichment

Gemini 2.5 Flash Lite primary pass (`CurrentVersion = 4`), Gemini 3.1 Flash Lite retry pass
(`RetryVersion = 5`) for anything missed, batches of 10. Fields: city (IND register wins if
present), summary, coreIndustry, techStackTags (≤8 of 47), functionalTags (≤6 of 36),
workingLanguage, companySize, remotePolicy, targetMarket, parentCompanyName, websiteUrl
(HEAD-validated). `"confidence": "low"` results are marked enriched but left blank on purpose —
no point re-rolling the same non-answer every sync. Bump `CurrentVersion` to force a full
re-enrichment on the next sync.

As of June 2026, 12,790 active companies: 88.5% have a summary, 67.3% a city, 55.5% a website,
48.6% all three. Full initial enrichment run costs about $1 (Gemini pricing, ~640 calls).

## Security

- PBKDF2-SHA256, 100k iterations, 16-byte salt. Constant-time compare on login and token checks.
- Login/forgot-password/resend-verification give no signal on whether the email exists.
- Reset and email-change tokens are stateless HMAC (`userId.exp.sig`), 1h / 24h expiry.
- JWTs last 7 days; refresh endpoint rate-limited to 10/hour/IP.
- Rate limiter is in-memory — fine for one instance, resets on restart, won't work if we ever
  scale to multiple backend processes.

## CI/CD

`.github/workflows/ci-cd.yml`: lint → test → build → deploy on push to `main`. Migrations run
via `Database.MigrateAsync()` on startup, no separate migration step.

Secrets: `HETZNER_HOST`, `HETZNER_SSH_KEY`, `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`,
`RESEND_API_KEY`, `ADMIN_EMAIL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Variables: `ALLOWED_ORIGIN`, `VITE_API_BASE_URL`, `CLOUDFLARE_PAGES_PROJECT`.
