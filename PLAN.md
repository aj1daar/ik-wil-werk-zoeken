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
- [x] Dark-mode readability fix — `--col-invert-bg`/`--col-invert-text` vars so pill buttons stay legible in both themes
- [x] Duplicate detection — warning banner when adding an application to a company already tracked
- [x] Keyboard shortcuts — `N` opens new application modal, `Esc` closes detail panel

### Admin System
- [x] `User.Role` field (`"user"` / `"admin"`) with EF Core migration
- [x] Admin seeding from `ADMIN_EMAIL` env var at startup (idempotent, never hard-coded)
- [x] `GET /api/admin/users` — list all users (admin JWT required)
- [x] `POST /api/admin/promote` — promote user to admin by email (admin JWT required)
- [x] `POST /api/admin/reload-sponsors` — full IND scrape + upsert + LLM enrichment (admin JWT required)
- [x] Role claim in JWT; `TokenService.GetRole()` extracts it
- [x] "Admin Panel" button in navbar (visible only when `role === "admin"`)
- [x] `/admin` route with guard (non-admins redirected to `/`)
- [x] AdminView — promote-user form, reload-sponsors button, users table

### Companies & Applications Polish
- [x] **Company City field** — `City` column on `SponsorCompany`; captured from IND register (3rd `<td>`); shown in card and detail panel; city search supported
- [x] **Companies advanced filtering** — city dropdown (exact match), tag include/exclude multiselect (3-state toggle); `store.filter()` capped at 100
- [x] **Application detail as modal** — centered `<teleport>` overlay with backdrop; bottom-sheet on mobile; keyboard accessible
- [x] **Mobile responsiveness** — hamburger navbar (≤ 767 px), full-screen modal on mobile, detail panel hidden on small screens
- [x] **Session expiry warning** — dismissible banner when JWT < 24 h from expiry; `useSessionExpiry` composable
- [x] **Application count badge on nav** — active (non-terminal) count shown next to "My Applications"
- [x] **Contact email mailto: link** — clickable `<a href="mailto:…">` in ApplicationPanel
- [x] **Status chip colors in dark mode** — per-status CSS classes (`chip-applied`, etc.) with `:root[data-theme="dark"]` overrides

### Advanced Application Features
- [x] **Application timeline / activity log** — `ActivityLog` table (FK cascade); all field changes logged on every update; collapsible history section in ApplicationPanel
- [x] **Follow-up date field** — nullable `DateTimeOffset?` on `ApplicationStage`; date picker in ApplicationPanel; overdue/today badges in the list row
- [x] **Bulk status update** — checkbox per row + select-all; floating bulk action bar; PATCH `/api/dashboard/applications`; activity log entries created
- [x] **Load-more pagination in CompaniesView** — `displayCount` ref starts at 60, +60 per click; "N remaining" shown; resets on filter change
- [x] **Sticky filter toolbar** — `position: sticky; top: 0` on ApplicationsView filter bar
- [x] **Print / PDF export** — Print button calls `window.print()`; `@media print` CSS hides nav/filter/buttons

---

## Backlog

### Enrichment & Data Quality

#### HIGH

- [ ] **Batch Gemini enrichment (20 companies per call)** — current code calls Gemini once per company; at 12,800 sponsors that's ~2,560 s at 5 concurrent → Azure Function timeout. Send up to 20 companies per call with a JSON array response. Reduces API calls 20× (640 vs 12,800), cuts tokens ~4× (~1.6M vs ~6.4M), and keeps the full sync well inside the 10-minute Function limit. Requires rewriting `CompanyEnricher.EnrichAsync` → `EnrichBatchAsync(IReadOnlyList<SponsorCompany>)` and updating the prompt to return an ordered array.

- [ ] **Extended enrichment fields** — add six new columns to `SponsorCompany` (backend model + EF Core migration + model snapshot) and update the Gemini prompt schema:
  - `WorkingLanguage` (`"English"` | `"Dutch"` | `"Mixed"`) — **most useful filter** for an HSM job seeker; many IND-registered companies are Dutch-only
  - `CompanySize` (`"startup"` | `"scaleup"` | `"mid"` | `"large"` | `"enterprise"`) — shapes application strategy and how formal the visa/relocation process is
  - `RemotePolicy` (`"remote"` | `"hybrid"` | `"office"` | `"unknown"`) — location flexibility
  - `ParentCompanyName` (`string?`) — name of the well-known parent brand when this is a subsidiary (e.g. "ABN AMRO" for "ABN AMRO Clearing Bank N.V."); used for deduplication grouping
  - `WebsiteUrl` (`string?`) — direct link to company website; reduces friction when researching
  - `TargetMarket` (`"B2B"` | `"B2C"` | `"B2G"` | `"Mixed"`) — helps calibrate cover letter tone and expectations
  - Full-stack: update `SponsorCompany` TypeScript interface in `api.ts` with the six new optional fields + `enrichmentVersion?: number`

- [ ] **Enrichment versioning** — add `EnrichmentVersion int` (default 0) to `SponsorCompany`. The enricher sets it to the current schema version (start at 1) on each successful call. Monthly sync and admin reload re-enrich companies where `EnrichmentVersion < CurrentVersion` OR `EnrichedAt is null`. This enables zero-downtime schema upgrades without manually clearing the `EnrichedAt` field across 12,800 rows.

#### MEDIUM

- [ ] **Working language + company size + remote policy filters** — add three filter dropdowns to CompaniesView (depends on extended enrichment fields above). Working language is the highest-priority. Also requires: (a) three new store getters in `companies.ts` — `allWorkingLanguages`, `allCompanySizes`, `allRemotePolicies` (derive unique values from loaded data, same pattern as `allCities`); (b) add `workingLanguage`, `companySize`, `remotePolicy` params to the existing `filter()` method; (c) three `<select>` dropdowns in CompaniesView's filter bar.

- [ ] **Incremental sync robustness** — monthly sync currently preserves enrichment by `EnrichedAt is null` check (good). Extend it: (a) track which KvK numbers were removed from the IND register and soft-delete or flag them; (b) re-enrich where `EnrichmentVersion < CurrentVersion`; (c) log a summary of added/removed/re-enriched counts to a persistent `SyncLog` table so an admin can audit sync history.

---

### Company-Application Integration

#### HIGH

- [ ] **Application ↔ Company link (`SponsorCompanyId`)** — add nullable `string? SponsorCompanyId` to `ApplicationStage` (backend model + migration). Use a soft reference — no database-level FK to `Sponsors` because the sponsor table is rebuilt monthly and a hard FK would break cascade behaviour. `DashboardCrudFunction.CreateApplication` and `UpdateApplication` accept and persist the field. Frontend: add `sponsorCompanyId?: string` to the `Application` interface in `api.ts` (the `createApplication` type and `updateApplication` `Partial<Application>` will include it automatically). Add `appliedSponsorIds` computed getter to `applications.ts` store — a `Set<string>` of `sponsorCompanyId` values from all loaded applications, used by CompaniesView and the duplicate check.

- [ ] **Company typeahead in NewApplicationModal** — replace the plain text `<input>` for company name with a combobox that searches the IND sponsor list as the user types. Implementation details:
  - Call `companiesStore.load()` on `onMounted` (already idempotent — skips if loaded); show "Loading companies…" while `companiesStore.loading` is true
  - Debounce input 300 ms → call `companiesStore.search(query)` (already exists, returns top-60 matches by name/city/industry)
  - Dropdown shows: company name, city chip, and `coreIndustry` badge; keyboard-navigable (ArrowUp/Down, Enter to select, Escape to dismiss)
  - On selection: set `companyName`, set `sponsorCompanyId`, pre-populate `locations` with the sponsor's city (user can remove/add), show a read-only context card below the field with enrichment data (industry, and later: working language, website URL)
  - Clearing the company name input clears `sponsorCompanyId` and the context card
  - Free-text entry (no selection) still works for companies not in the IND register — `sponsorCompanyId` stays null
  - Duplicate detection: check `sponsorCompanyId` match first (exact, via `appliedSponsorIds` Set); fall back to case-insensitive name match for free-text entries (existing logic)

#### MEDIUM

- [ ] **"Applied here" overlay in CompaniesView** — for each company card, if `appliedSponsorIds` (from applications store) contains the company's `id`, show a status chip for the user's most recent application to that company (same chip classes as ApplicationsView). Add a "Applied / Not yet applied" filter toggle to the filter bar. Requires `sponsorCompanyId` link to be in place.

- [ ] **Parent company grouping in CompaniesView** — once `ParentCompanyName` is populated, group subsidiaries under the parent in the list (e.g. "ABN AMRO · 8 entities"). A toggle shows/hides subsidiaries. Reduces the perceived list from ~12,800 to ~3,000–4,000 unique employers. Keeps the full list accessible for users who know the specific legal entity.

---

### UI Animations & Transitions

No new dependencies — all Vue `<Transition>` / `<TransitionGroup>` + CSS. Every animation must respect `@media (prefers-reduced-motion: reduce)` by dropping to an instant switch. Keep durations short: 150–200 ms for micro-interactions, 200–250 ms for panels and modals, never over 300 ms.

#### MEDIUM

- [x] **Page / route transitions** — wrap `<RouterView>` in `<Transition name="page">` in `App.vue`. Effect: fade + subtle 8px translateY (page lifts in, drops out). The same transition fires on every route change. CSS classes: `.page-enter-active`, `.page-leave-active` (both 200 ms ease), `.page-enter-from` / `.page-leave-to` (opacity 0, translateY 8px).

- [x] **Modal open / close animation** — NewApplicationModal backdrop fades in (opacity 0 → 1, 150 ms); the `.modal` card scales from 0.96 → 1.0 and fades in simultaneously (200 ms ease-out). Closing reverses both. Wrap the `v-if` on the modal element with `<Transition name="modal">`. Same treatment for the ApplicationPanel teleport overlay.

- [x] **Application detail panel slide** — ApplicationPanel currently appears instantly. Add a slide-in from the right (desktop: translateX 24px → 0 + fade, 200 ms) and slide-out on close. On mobile (bottom-sheet mode) use translateY instead.

- [x] **List stagger on load / filter change** — wrap the `v-for` application rows in `<TransitionGroup name="list">`. On initial load and when filters change, items fade + translateY 6px with a small stagger (`transition-delay: calc(index * 20ms)`, capped at 10 items to avoid long waits). Items that leave (filtered out) fade out in place.

#### LOW

- [x] **Bulk action bar slide-up** — the floating bulk bar at the bottom already has a comment for a transition; implement `<Transition name="bulk-bar">` with translateY 100% → 0 (200 ms ease-out) so it slides up from the bottom edge when selections are made and slides back down when cleared.

- [x] **Button press micro-feedback** — add a global CSS rule: `button:active { transform: scale(0.97); transition: transform 80ms; }`. Gives every clickable button a subtle "press" feel without per-component changes.

- [x] **Status chip flash on update** — after an application status is saved (single update or bulk), briefly flash the chip background to a lighter tint (`@keyframes chip-flash`) to confirm the change landed. Triggered by a short-lived `.chip-updated` class added in `ApplicationPanel` after save completes, auto-removed after 600 ms.

---

### Design System & UI Consistency

The app already has CSS custom properties (`--col-*`) and consistent button styling, but native form elements (specifically `<select>`) are OS-rendered and break the rounded design language. Goal: every interactive element looks like it belongs to the same design without adding a UI library dependency.

#### MEDIUM

- [x] **`AppSelect` component** — replace every raw `<select>` in the codebase (status filter, sort order, city dropdown, bulk status, rejection reason, etc.) with a shared `src/components/ui/AppSelect.vue`. Internally still a native `<select>` but with `appearance: none`, a custom SVG chevron icon, `border-radius: 0.5rem`, `border: 1px solid var(--col-border)`, `padding: 0.5rem 2.25rem 0.5rem 0.75rem`, and focus ring matching other inputs. The native `<option>` list is OS-rendered (unavoidable cross-browser) but the closed state will match everything else. Props: `modelValue`, `options: { value, label }[]`, `placeholder`. Emits `update:modelValue`.

- [x] **`AppInput` component** — shared `src/components/ui/AppInput.vue` wrapping `<input>` with the `.field-input` styling baked in, plus `aria-invalid` and `aria-describedby` wired from props. Currently `.field-input` is duplicated across ~8 components as a scoped class; centralising it means one place to update. Props: `modelValue`, `type`, `placeholder`, `error`, `id`.

- [x] **Global form element baseline** — add a `src/assets/base.css` section that normalises `input[type="date"]`, `input[type="text"]`, `textarea`, and `select` to share the same border-radius, border colour, and focus ring as the design system, so even elements not yet converted to `AppInput`/`AppSelect` look consistent. This is the low-cost first step; component extraction can happen incrementally after.

#### LOW

- [x] **`AppButton` component** — `src/components/ui/AppButton.vue` with `variant` prop (`"primary"` | `"secondary"` | `"ghost"` | `"icon"`). Currently button styles are duplicated per-component (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon` in at least 6 files). One component, one source of truth.

---

### Auth & Session

#### MEDIUM

- [ ] **Silent token refresh on activity** — currently the JWT has a fixed expiry with only a warning banner when < 24 h remain; there is no way to extend the session without logging out. Add:
  - Backend: `POST /api/auth/refresh` — validates the current (non-expired) JWT via the existing `TokenService.ValidateToken`, issues a new JWT with a fresh expiry window. Protected by the existing in-memory rate limiter. Returns `{ token: string }`.
  - Frontend: `useTokenRefresh` composable — checks token expiry on a 5-minute interval; when the token has < 2 h remaining **and** the user has been active in the last 10 minutes (track `lastActivityAt` via a `mousemove`/`keydown` listener), silently calls `POST /api/auth/refresh` and updates `sessionStorage`. No user interaction required.
  - The existing session expiry warning banner gains a manual "Extend session" button that triggers the same refresh call immediately, for users who notice the warning before the silent refresh fires.
  - Security: the refresh endpoint only accepts non-expired tokens (can't use it to resurrect an expired session), and is rate-limited to 10 requests per hour per IP.

---

### Content & Naming

#### LOW

- [x] **Standardize application status label grammar** — the seven status *display labels* use three different grammatical patterns, which feels inconsistent even if each label is individually understandable:
  - Past-tense verbs: `Applied`, `Rejected`, `Withdrawn`, `Accepted` ✓
  - Noun + past participle: `Interview Scheduled`, `Offer Received`
  - Prepositional phrase: `On Hold`

  **Singular vs plural:** singular is correct — these labels describe a single application's phase, not counts of events. "Interviews Scheduled" would imply tallying multiple interviews; "Interview Scheduled" means the application is in the state of having one scheduled.

  **Recommended fix** — align the two outliers to present-participle / action-state form used by LinkedIn and Greenhouse, keeping the meaning:
  - `Interview Scheduled` → **`Interviewing`** (implies the interview process is ongoing, widely understood)
  - `Offer Received` → keep as-is (clear, and no better short alternative exists)
  - `On Hold` → keep as-is (idiomatic English, universally understood)

  **Important:** the status values are stored as strings in the `Stages` table (e.g. `"InterviewScheduled"`). The DB enum values do **not** need to change — only the `STATUS_LABELS` map in `applications.ts` and any matching display strings in tests. However, if `Interviewing` is chosen as a display label, confirm all 7 `InlineData` test cases still use the internal DB values (`"InterviewScheduled"` etc.), not the display labels.

---

### Dashboard Charts

**Library decision: Apache ECharts + vue-echarts** (recommended over Chart.js and Apexcharts).
- Chart.js (~60 KB) covers basic bar/line/donut but has no native funnel chart — the single most valuable visualization for a job seeker.
- Apexcharts (~400 KB) has funnel support but bulkier and less polished animations.
- ECharts (~200–400 KB tree-shaken) has native funnel, excellent animations that complement the planned transition work, and the richest chart type selection. Install: `pnpm add echarts vue-echarts`.

#### MEDIUM

- [ ] **Application funnel chart** — the most valuable single visualization. Shows the conversion pipeline: Applied → Interviewing → Offer Received → Accepted, as a vertical or horizontal funnel with absolute counts and percentage drop-off between stages (e.g. "40% of applications reached an interview"). Use ECharts `'funnel'` series. Rejected/Withdrawn/On Hold are shown as a separate metric below the funnel ("X did not proceed"), not as funnel stages — they break the linear flow. Respects the existing date-range filter already wired to the stats API.

- [ ] **Status donut chart** — replaces the current 7 flat stat cards with a donut chart showing the proportion of each status in the same colour palette as the existing chip classes (`chip-applied` blue, `chip-rejected` red, etc.). The 7 numeric cards can move below the chart as a compact legend row, keeping the numbers visible without dominating the layout. Uses ECharts `'pie'` series with `radius: ['40%', '70%']`.

- [ ] **Applications over time (area chart)** — line/area chart showing applications submitted per week over the visible date range. Gives a sense of activity rhythm: are you applying consistently or in bursts? Uses the existing `appliedAt` field; group by ISO week on the frontend. ECharts `'line'` series with `areaStyle`. Rendered below the donut + funnel row.

#### LOW

- [ ] **Response rate KPI strip** — a single row of 3–4 large-number KPIs above the charts: `Total applied`, `Response rate` ((Interviews + Offers + Accepted) / Total, as a %), `Offer rate` (Offers / Total), `Avg. days to response` (mean of `updatedAt − appliedAt` for stages that reached Interview+). No chart library needed — plain styled `<div>` elements. Gives instant signal without needing to read the charts.
