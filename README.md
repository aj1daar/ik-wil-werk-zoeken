# ik-wil-werk-zoeken

Dashboard monorepo for tracking job application pipelines for Highly Skilled Migrant sponsor companies from the Dutch IND public register.

## Monorepo Layout

- `/frontend` Vue 3 + TypeScript + Vite + Tailwind CSS + Pinia, ready for Cloudflare Pages static hosting
- `/backend` Azure Functions (.NET isolated worker) with Native AOT-oriented project settings

## Backend Functions

- `MonthlyIndSponsorSync` Timer Trigger for monthly IND sponsor sync
- `DashboardCrud` HTTP Trigger for CRUD operations on users, sponsors, and application stages
