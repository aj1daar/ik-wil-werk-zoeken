# Application Tracker — Implementation Plan

## Goal
Replace the IND-stage-tracker with a general job application tracker. Users can log applications to any company (free text), track them through a pipeline, and see dashboard stats with date-range filtering.

---

## New Data Model

### ApplicationStage (replaces old stage entity)
| Field | Type | Notes |
|---|---|---|
| `id` | string | GUID, PK |
| `userId` | string | FK → User |
| `companyName` | string | Free text, required |
| `position` | string | Free text, required |
| `appliedAt` | DateTimeOffset | Required, defaults to today |
| `status` | string | See statuses below |
| `rejectionReason` | string? | Only when status = Rejected |
| `rejectionNote` | string? | Optional free text alongside reason |
| `notes` | string? | General notes |
| `contactPersonName` | string? | |
| `contactPersonEmail` | string? | |
| `locations` | string[] | Optional, replaces `cities` |
| `updatedAt` | DateTimeOffset | Auto-set on save |

### Statuses
`Applied` → `InterviewScheduled` → `OfferReceived` → `Accepted`
                                                    → `Rejected` (→ rejection reason)
                                                    → `Withdrawn`
                     → `OnHold`

### Rejection reasons (fixed list)
- `dutch_language` — Dutch language requirement
- `dutch_language` — Dutch language requirement
- `another_candidate` — Proceeded with another candidate
- `incompatible_profile` — Incompatible profile
- `salary_mismatch` — Salary expectations mismatch
- `internal_hire` — Position filled internally
- `other` — Other

---

## Navigation (new)
| Tab | Route | Content |
|---|---|---|
| Home | `/` | Stats dashboard |
| My Applications | `/applications` | Application list + new/edit |
| Companies | `/companies` | IND sponsor browser |
| Profile | `/profile` | Existing profile page |

---

## Stats API
`GET /api/dashboard/stats?from=<iso>&to=<iso>` (both optional)
```json
{
  "total": 42,
  "byStatus": { "Applied": 10, "InterviewScheduled": 8, ... }
}
```

---

## Tasks

### Backend
- [x] Update `ApplicationStage.cs` — new fields, rename `Cities` → `Locations`, add rejection fields
- [x] Update `DashboardCrudFunction.cs` — new statuses, new validation, add `GET /stats` endpoint
- [x] Update `AppJsonSerializerContext.cs` — register `StatsResponse`
- [x] Add `StatsResponse` model
- [x] Create EF Core migration for schema changes

### Frontend — types & stores
- [x] Update `api.ts` — new `Application` type, new methods
- [x] Delete `stores/pipeline.ts` (unused stub)
- [x] Update `stores/companies.ts` — remove all stage/record logic, keep only sponsor company fetching and search
- [x] Create `stores/applications.ts` — CRUD for applications + stats

### Frontend — routing & navigation
- [x] Update `router/index.ts` — `/` → HomeView, `/applications` → ApplicationsView, `/companies` → CompaniesView
- [x] Update `AppNavbar.vue` — new nav links

### Frontend — views
- [x] Create `views/HomeView/HomeView.vue` — stats dashboard with date range selector
- [x] Create `views/CompaniesView/CompaniesView.vue` — IND sponsor browser with "Start Application" button
- [x] Create `views/ApplicationsView/ApplicationsView.vue` — list + "New Application" button + side panel
- [x] Delete `views/DashboardView/` (split into HomeView + CompaniesView)
- [x] Delete `views/BookmarkedView/` (replaced by ApplicationsView)

### Frontend — components
- [x] Create `components/NewApplicationModal/NewApplicationModal.vue`
- [x] Create `components/ApplicationPanel/ApplicationPanel.vue` — detail/edit panel with rejection reason picker
- [x] Delete `components/CompanyPanel/` (replaced by inline panel in CompaniesView + ApplicationPanel)
- [x] Create `assets/split-panel.css` — shared layout styles

### Verification
- [x] `dotnet build` passes
- [x] EF Core migration created and compiles
- [x] `npm run type-check` passes
- [x] `dotnet test` — 104 tests pass
- [x] `npm test` — 140 tests pass (companies store tests updated for simplified API)
