---
name: iwwz-testing
description: How tests are written in ik wil werk zoeken — Vitest + @vue/test-utils on the frontend, xUnit + SQLite in-memory on the backend, plus the coverage bar every change is held to. Use before writing or changing any test in this repo, and before claiming a change is done.
---

# ik wil werk zoeken: testing

Both suites run on every change and both must stay green. A feature is not finished until its
tests exist — including the ugly cases.

```bash
cd frontend && pnpm test                                   # whole suite
cd frontend && pnpm vitest run src/views/HomeView          # one folder while iterating
cd frontend && pnpm type-check                             # vue-tsc, catches what tests don't
dotnet test backend.Tests/backend.Tests.csproj
```

## The bar

Assume every user is either confused or hostile. A test file that only covers the happy path is
incomplete. For anything that takes input, cover:

- empty, missing, whitespace-only, and `null`
- absurd length, unicode, emoji, accents, right-to-left text
- HTML and script payloads, quotes and entities (see `IndSponsorScraperTests` — encoded `&lt;script&gt;`
  must survive as text, and the register's CSV-style doubled quotes must collapse)
- numbers at and past their bounds: page 0, page past the end, negative counts, 8-digit KvK ±1 digit
- dates at boundaries: month and year ends, leap days, timezone offsets, ranges where `from` > `to`
- ownership and role: another user's id, a missing token, a non-admin hitting `/api/mgmt/`

Name the case in the test name, so a failure reads as a sentence: `ParseHtml_KvKLessThan8Digits_Skipped`,
`'a name made only of symbols sorts first instead of crashing'`.

## Frontend (Vitest, happy-dom, @vue/test-utils)

Tests live in a `__tests__/` folder beside what they test (`src/views/HomeView/__tests__/HomeView.test.ts`).
`vitest.config.ts` sets `environment: 'happy-dom'` and `globals: true`.

The standard shape of a view or component test file:

```ts
vi.mock('../../../api', () => ({ api: { getApplications: vi.fn(), getStats: vi.fn() /* … */ } }))
import { api } from '../../../api'

function makeApp(overrides: Partial<Application> = {}): Application { /* full object + overrides */ }

function mountView(apps: Application[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)                      // fresh store per mount, never shared state
  vi.mocked(api.getApplications).mockResolvedValue(apps)
  vi.mocked(api.getStats).mockResolvedValue(makeStats())
  return mount(ApplicationsView, { global: { plugins: [pinia] } })
}

beforeEach(() => vi.clearAllMocks())
```

Rules that come from things that have already broken:

- **Mock the api module, never the store.** Stores are under test too; they have their own files in
  `src/stores/__tests__/`.
- **`await flushPromises()` after mounting** anything that loads on `onMounted`, and after any click
  that triggers a request.
- **happy-dom never lays anything out.** Element sizes are zero, so a component that measures itself
  needs its input stubbed — `StatusTree.test.ts` replaces `ResizeObserver` with a class that reports
  a chosen width, and calls `vi.unstubAllGlobals()` in `afterEach`.
- **A view that reads the route needs a real router**: `createRouter({ history: createMemoryHistory(), routes: […] })`,
  `await router.push(url)` and `await router.isReady()` before mounting (see the `?open=<id>` tests).
- Transitions are found by `findAllComponents(Transition)` filtered on `props('name')`.
- Global key handling is tested by dispatching on `document.body`, not on the wrapper.
- Assert accessibility the same way you assert behaviour: that a control is a real `<button>` with a
  `type`, that `aria-pressed` tracks state, that a bare number has `sr-only` text beside it, and that
  a container is *not* a fake button (`role`/`tabindex` absent). The axe-core pass in `pnpm screenshots`
  is the backstop, not the first line.

`src/__tests__/designTokens.test.ts` reads `.vue` and `.css` files off disk (Vitest doesn't process
CSS, and `?raw` on a stylesheet comes back empty) and fails on any hex/`rgb()`/`hsl()` literal in a
component style block, or any `var(--col-…)` that style.css doesn't define. If a new colour is
needed, add the token pair — don't inline the value.

## Backend (xUnit)

xUnit constructs a new instance of the test class for every test, so fixtures set up in the
constructor are already isolated. Dispose what you open.

Anything that touches the database uses **SQLite in-memory**, not the EF InMemory provider, because
`ExecuteUpdateAsync` (used by the stores) is unsupported there. The InMemory package is still
referenced but no test uses it.

```csharp
_conn = new SqliteConnection("DataSource=:memory:");
_conn.Open();                                   // closing the connection drops the database
_db   = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
_db.Database.EnsureCreated();                   // schema from the model, not from migrations
_store = new SponsorStore(_db);
```

SQLite is not Postgres, and the difference occasionally reaches the code: it cannot `ORDER BY` a
`DateTimeOffset`, which is why `UserStore.GetAllAsync` sorts in memory. When a query can't be
translated, prefer a small, commented change in the store over an untested method.

Pure logic is tested directly rather than through HTTP: `backend.csproj` grants `InternalsVisibleTo`
to the test project, and controller helpers like `BuildActivityLogs`, `ValidateStage` and
`BuildStatusFlow` are `internal static` for exactly this reason. Prefer adding a helper of that shape
to spinning up a host.

Use `[Theory]` with `[InlineData]` for table-shaped cases (suffix stripping, quote collapsing) and a
private `Make…(…)` factory with sensible defaults for entities.

## Before calling it done

1. Both suites green, `pnpm type-check` clean.
2. For UI work, the screenshot and axe run from the `iwwz-run` skill, then actually look at the
   mobile and dark shots.
