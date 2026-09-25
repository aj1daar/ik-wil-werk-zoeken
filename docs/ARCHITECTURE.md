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
backend.Tests/       xUnit (679 tests)
frontend/            Vue 3 SPA
  src/components/     ApplicationPanel, NewApplicationModal, ConfirmDialog, DatePicker,
                       StatusTree, RejectionChart, AreaChart, ui/ (AppSelect, AppInput, AppButton)
  src/views/          Home, Applications, Companies, Profile, Admin, auth views
  src/stores/         auth, companies, applications (Pinia)
  **/__tests__/        Vitest (985 tests), beside the code they cover
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
enrich-sponsors (Gemini, batches of 100), sync-logs, companies/{id} (PUT — manual field
override, including the company name), companies/merge (POST), companies/{id}/merged (GET),
companies/{id}/unmerge (POST).

### Export `/api/export/`
sponsors (GET). Machine to machine, no browser involved. See "Sponsor export contract" below.

All non-auth routes require `Authorization: Bearer <jwt>`; admin routes additionally check
`role === "admin"`. `/api/export/` is the exception: a user token is not accepted there.

## Sponsor export contract

`GET /api/export/sponsors` is consumed daily by
[nl-tech-jobs-pipeline](https://github.com/aj1daar/nl-tech-jobs-pipeline), which runs on another
host with no database credentials. It is a published contract: the field names below are what that
repository reads, so changing one is a breaking change.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-25T14:31:07.123456+00:00",
  "count": 12797,
  "sponsors": [
    {
      "id": "01031782",
      "name": "Essity Operations Suameer",
      "kvkNumber": "01031782",
      "isIndRecognizedSponsor": true,
      "lastVerifiedAt": "2026-06-16T20:14:08.446755+00:00",
      "removedAt": null,
      "mergedIntoId": null,
      "aliasNames": null,
      "city": null,
      "locations": null,
      "websiteUrl": null,
      "coreIndustry": null,
      "techStackTags": null,
      "workingLanguage": null,
      "companySize": null,
      "remotePolicy": null,
      "enrichedAt": null,
      "enrichmentVersion": null
    }
  ]
}
```

Rules the consumer can rely on:

- **Every row, always.** Removed companies (`removedAt` set) and companies merged away
  (`mergedIntoId` set) are included. The export mirrors the table; a company that was merged must
  not be indistinguishable from one that never existed. `id` is the IND KvK number for anything the
  sync created, and a GUID for the seeded rows that predate it.
- **Null means unknown.** It is never a stand-in for false or for an empty list. An empty or
  whitespace-only string arrives as `null`, and so does an empty array or one holding only blanks.
  `kvkNumber` is the field where this matters most: the column is `not null` in Postgres and the
  only way to say "no number" is the empty string, which the export turns into `null`. The same
  treatment covers `city`, `websiteUrl`, `coreIndustry`, `workingLanguage`, `companySize`,
  `remotePolicy`, `mergedIntoId`, `aliasNames`, `locations` and `techStackTags`.
  `enrichmentVersion` is `null` when no version was recorded, which covers both a company the
  enrichment never touched and the seeded rows that predate versioning, where `enrichedAt` is set
  and the version is 0.
- **Stable order.** Rows are ordered by `id`, so two exports of an unchanged register differ only
  in `generatedAt`.
- **One response.** No pagination. Around 12.8k rows, 5.1 MB of JSON, which brotli takes to roughly
  470 KB; compression is enabled for `/api/export` only (see `Program.cs` for why not globally).
- **Never cached.** `Cache-Control: no-store` and `CDN-Cache-Control: no-store`, the second because
  Cloudflare reads it first.
- **`schemaVersion` is 1.** It goes up when a field is removed or renamed, or an existing field
  changes meaning. Adding a field does not bump it, so a consumer must ignore fields it does not
  know.

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

## Company identity — renames and merges

The IND register is the source of truth for which companies exist, but its names are messy: the
same employer shows up under a trading name, a legal name and a holding name with separate KvK
numbers. Admins fix that from the company modal.

- **Rename** (`PUT /api/mgmt/companies/{id}` with `name`): sets a new display name and keeps the
  old one in `AliasNames`. `name` is the one field a PUT cannot clear — omitted means "leave it".
- **Merge** (`POST /api/mgmt/companies/merge`): folds one or more duplicates into a surviving
  company. Nothing is deleted — each source keeps its row with `MergedIntoId` set, which hides it
  from `GET /api/dashboard/sponsors`, keeps the monthly IND sync from re-creating it (the KvK is
  still in the table) and skips it during enrichment. The target absorbs the source names as
  aliases; application links and every user's interested/hidden entries are re-pointed at it, and
  a user who had both companies on a list keeps their target entry.
- **Unmerge** (`POST /api/mgmt/companies/{id}/unmerge`): puts the company back in the register and
  drops the aliases it contributed, unless another still-merged company contributes the same name.
  Applications and list entries stay with the target — sponsor links are resolved by name on every
  read, so applications follow the restored company again on their own.

`SponsorStore.FindByNameAsync` — which decides whether an application counts as "at an HSM
sponsor" — matches the display name first and the alias list second, so applications saved under
an old or duplicate name stay linked. Alias-carrying companies are a small set and are cached for
the lifetime of the (per-request) store.

## Security

- PBKDF2-SHA256, 100k iterations, 16-byte salt. Constant-time compare on login and token checks.
- Login/forgot-password/resend-verification give no signal on whether the email exists.
- Reset and email-change tokens are stateless HMAC (`userId.exp.sig`), 1h / 24h expiry.
- JWTs last 7 days; refresh endpoint rate-limited to 10/hour/IP.
- Rate limiter is in-memory — fine for one instance, resets on restart, won't work if we ever
  scale to multiple backend processes.

## Origin hardening

Traffic reaches the API as Cloudflare, then nginx on the Hetzner box, then Kestrel. Each hop
narrows what the one before it can claim.

- Kestrel binds `127.0.0.1:5000` (`ASPNETCORE_URLS` in the deploy job, written to
  `/var/www/iwwz/.env`). It used to bind `*:5000`, which let anyone with the origin IP skip
  Cloudflare, nginx and the rate limits entirely.
- nginx reads the client address from `CF-Connecting-IP` and only from the Cloudflare ranges in
  `/etc/nginx/conf.d/cloudflare-realip.conf`, then passes it on as `X-Forwarded-For $remote_addr`.
  It overwrites that header rather than appending, so a caller cannot smuggle an address of its
  own into it.
- `ForwardedHeaders` (see `backend/ProxyHeaders.cs`) applies the header only for requests that
  arrive from loopback, with `ForwardLimit = 1` and `KnownNetworks` cleared, so no other process
  on the host can rewrite the client address either. `ApiControllerBase.GetClientIp` reads
  `Connection.RemoteIpAddress` and no headers at all, which is what the rate limits key off.
- Cloudflare to origin is TLS. nginx serves 443 with a Cloudflare Origin CA certificate
  (`/etc/ssl/cloudflare/origin.pem`, key mode 600 beside it, valid to 21 Sep 2041) and the zone is
  on **Full (strict)**, so the edge checks that certificate on every hop. The certificate is only
  trusted by Cloudflare, which is the point: it is worthless to anyone else. Port 80 redirects,
  which it may only do while the zone is on Full (strict); on a Flexible zone the same redirect is
  an infinite loop. Zone settings that go with it: `always_use_https = on`, `min_tls_version = 1.2`.
- ufw: deny incoming by default, 22 open, 80 and 443 open to the Cloudflare ranges only.
  `scripts/cf-realip.sh --ufw` writes both the nginx range list and those rules, and
  `/etc/cron.d/cf-realip` re-runs it weekly so a Cloudflare renumbering cannot lock the site out.
  The script refuses to write anything if fewer than 10 ranges come back.

Server files that are not in this repo, and where they come from: `/etc/nginx/sites-available/iwwz`
is `deploy/nginx/iwwz.conf`, `/usr/local/bin/cf-realip.sh` is `scripts/cf-realip.sh`. Copy either
one up, then `nginx -t && systemctl reload nginx`.

Before enabling or changing the firewall, arm a rollback first:
`echo 'ufw --force reset; ufw disable' | at now + 10 minutes`, make the change, open a second SSH
session to prove it still works, then `atrm <job>`. The Hetzner Cloud console is the way back in
if that fails.

## CI/CD

`.github/workflows/ci-cd.yml`: lint → test → build → deploy on push to `main`. Migrations run
via `Database.MigrateAsync()` on startup, no separate migration step.

Because migrations apply the moment the new build boots, the backend deploy job dumps the
database first: it copies `scripts/backup-db.sh` to the server and runs it between writing the
env file and stopping the service. The script reads `DATABASE_URL` out of `/var/www/iwwz/.env`,
writes `/var/www/iwwz/backups/iwwz-<UTC timestamp>.sql.gz`, keeps the last 10 and prunes the
rest. It uses the host's `pg_dump` when there is one and otherwise the client inside the running
Postgres container (`PG_CONTAINER` overrides the auto-detected name). A dump that fails, or that
comes back unreadable, fails the deploy before anything is stopped — and leaves the previous
backups in place. There is no scheduled backup between deploys; `scripts/backup-db.sh` can be run
by hand or from cron for that.

Restore:

```
gunzip -c /var/www/iwwz/backups/iwwz-20260906-120000.sql.gz \
  | psql "postgres://user:pass@host:5432/iwwz"
```

Secrets: `HETZNER_HOST`, `HETZNER_SSH_KEY`, `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`,
`RESEND_API_KEY`, `ADMIN_EMAIL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Variables: `ALLOWED_ORIGIN`, `VITE_API_BASE_URL`, `CLOUDFLARE_PAGES_PROJECT`.
