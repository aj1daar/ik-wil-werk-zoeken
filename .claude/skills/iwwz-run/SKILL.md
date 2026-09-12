---
name: iwwz-run
description: How to start, drive and visually verify the ik wil werk zoeken app locally — database, API, dev server, ports, sign-in, and the screenshot/accessibility run. Use whenever the task is to run or restart the app, reproduce something in the real UI, take screenshots, or confirm a change works outside the unit tests. The general-purpose `run` skill defers to this file for this project.
---

# ik wil werk zoeken: running the app

Three processes, always in this order: Postgres, then the API, then the dev server. The frontend
proxies `/api` to the API, so starting Vite alone gives a page that renders and then fails every
request.

## Ports and addresses

| Piece | Address | Notes |
|---|---|---|
| Postgres | `localhost:5432` | `docker compose up -d db`, image `postgres:16`, db/user/password all `iwwz`/`postgres`/`postgres` |
| API | `http://localhost:7198` | set by `backend/Properties/launchSettings.json` — **not** 5000, which is what production uses behind Nginx |
| Dev server | `http://localhost:5173` | `vite.config.ts` proxies `/api` here to 7198 |

Overriding any of these for a one-off run means overriding them everywhere: the Vite proxy target,
`ALLOWED_ORIGIN` on the API, and `IWWZ_URL`/`IWWZ_API` for the screenshot script.

## Start it

```bash
docker compose up -d db
cd backend && dotnet run                 # http://localhost:7198
cd frontend && pnpm install && pnpm dev  # http://localhost:5173
```

Migrations are applied by `Database.MigrateAsync()` when the API boots, so there is no separate
migration step and a schema change reaches the database the moment you restart the API. Run
`dotnet ef database update --project backend --startup-project backend` by hand only when you want
the schema without starting the app.

`launchSettings.json` supplies the development values for `JWT_SECRET`, `DATABASE_URL`,
`ALLOWED_ORIGIN` and `ADMIN_EMAIL`, so `dotnet run` needs no environment of its own. `GEMINI_API_KEY`
and `RESEND_API_KEY` are not set locally, so company enrichment and outgoing email are skipped.

Sign-in needs a verified address, and nothing can be verified by email without Resend. In
Development `EmailService` writes the link it would have sent to the API log instead — register,
then copy the `No RESEND_API_KEY set - verification link for ...` line out of the `dotnet run`
output and open it. The same goes for password resets and email changes.

### On Windows

`node`, `npm` and `pnpm` are installed through nvm4w and are often missing from a non-interactive
shell's PATH. Prepend the active version's directory (`%LOCALAPPDATA%\nvm\<version>`) before any
node command rather than concluding node isn't installed.

## Signing in

Pages other than `/login` and `/register` need a token. The app keeps it in `sessionStorage` under
`token`, and the screenshot script injects it the same way. For scripted runs, either export a JWT
as `IWWZ_TOKEN` or let the script log in with `IWWZ_EMAIL` and `IWWZ_PASSWORD`.

Admin is granted by `ADMIN_EMAIL` matching at first startup, so the development account in
`launchSettings.json` is already an admin against a fresh local database.

## Screenshots and the accessibility gate

With both servers running:

```bash
cd frontend
IWWZ_EMAIL=... IWWZ_PASSWORD=... pnpm screenshots
```

It captures `/`, `/applications`, `/companies` and `/profile` (or `/login` and `/register` when
signed out) at 1440×900 and 390×844, in light and dark, into `frontend/screenshots/` — which is
git-ignored. Motion is frozen so nothing lands mid-transition.

The run exits non-zero on any of: an uncaught page error, a console error, content wider than the
screen, a token that bounced back to `/login`, or a serious/critical axe-core violation (colour
contrast included, checked separately in each theme). Treat a non-zero exit as a failing test.

Useful flags: `--routes=/,/applications`, `--viewports=mobile`, `--themes=dark`, `--a11y=false`.
Overrides: `IWWZ_URL`, `IWWZ_API`, `IWWZ_SHOTS_DIR`, and `PW_CHANNEL` when the installed Chrome
isn't what you want to drive (`msedge`, or `chromium` after `npx playwright install chromium`).

Screenshots are for looking at, not just for passing. Open the mobile and dark shots — the problems
that survive unit tests are cramped layouts, invisible text and clipped charts.

## Checks that don't need the app running

```bash
cd frontend && pnpm test          # vitest
cd frontend && pnpm type-check    # vue-tsc
dotnet test backend.Tests/backend.Tests.csproj
```

See the `iwwz-testing` skill for how tests in this repo are written.
