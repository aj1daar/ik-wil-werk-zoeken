# ik wil werk zoeken

Job-search tracker for Highly Skilled Migrants in the Netherlands — browse IND-recognized
sponsor companies, track your application pipeline, see it on a dashboard. Built for myself,
maybe a friend or two.

Stack: Vue 3 + TS + Vite + Pinia + ECharts, ASP.NET Core 8 API, Postgres 18 via EF Core, JWT auth,
Gemini for company enrichment, Resend for email. Frontend on Cloudflare Pages, backend on a
Hetzner box behind Nginx. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it

```bash
docker compose up -d db
dotnet ef database update --project backend --startup-project backend
cd backend && dotnet run          # http://localhost:7198

cd frontend && pnpm install && pnpm dev   # http://localhost:5173, proxies /api
```

Needs `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `ALLOWED_ORIGIN`, `ADMIN_EMAIL` set
(local defaults live in `backend/Properties/launchSettings.json`). `RESEND_API_KEY` is optional —
without it, emails just get skipped.

Tests: `dotnet test backend.Tests` (295), `cd frontend && pnpm test` (565).

## Known limitations

Rate limiter is in-memory, so it resets on every deploy and wouldn't survive running more than
one backend instance. IND company enrichment leaves ~11% of companies blank on purpose (Gemini
had nothing to say about them), and only about half are *fully* enriched — city, summary, and
website all present. No automated DB backups configured on the Hetzner box yet. Admin is granted
by matching `ADMIN_EMAIL` on first startup; there's no invite or promotion flow beyond the one
manual `/api/mgmt/promote` call. No e2e tests, just unit-level coverage on both sides.
