---
name: iwwz-design-system
description: The established visual design system for the ik wil werk zoeken frontend (Vue 3). Use for ANY change to frontend UI, styling, colours, copy, charts, motion or layout, and before reaching for general design guidance such as frontend-design. The direction is already decided; this skill keeps new work consistent with it.
---

# ik wil werk zoeken: design system

The app is a job-search tracker for a Highly Skilled Migrant in the Netherlands. The visual
direction is **wayfinding**: Dutch rail and Schiphol signage. The app's job is to show where
to go next, so the design reads like a sign, not a brochure.

This direction is settled. Do not redesign, re-theme or introduce a new palette or typeface
unless the user explicitly asks for a redesign. General design skills (frontend-design and
similar) defer to this file for this project.

## Colour

All colours live in `frontend/src/style.css` as tokens, each defined for light (`:root`) and
dark (`:root[data-theme="dark"]`). Components use `var(--col-…)` / `var(--status-…)` only.
`src/__tests__/designTokens.test.ts` fails the build on any hex, `rgb()` or `hsl()` in a
component stylesheet, and on any `var(--col-…)` that isn't defined.

| Role | Token | Use for |
|---|---|---|
| Paper | `--col-desktop`, `--col-bg`, `--col-surface`, `--col-raised` | page plane, panels, cards, hover |
| Ink | `--col-text`, `--col-muted`, `--col-subtle` | text, secondary text, meta |
| Lines | `--col-border`, `--col-border-lt` | hairlines |
| Route blue | `--col-accent` (+ `-dk`, `-lt`, `--col-on-accent`), `--col-focus` | links, selection, focus ring |
| Signal yellow | `--col-signal` (+ `-lt`, `--col-on-signal`) | **only** "look here" moments |
| Primary action | `--col-invert-bg` / `--col-invert-text` | primary buttons (ink; flips light in dark mode) |
| Feedback | `--col-error`, `--col-success`, `--col-warning` (+ `-lt`) | errors, confirmations, cautions |
| Overlay/shadow | `--col-overlay`, `--shadow-sm`, `--shadow-lg` | modal backdrops, floating layers |

Rules:
- **Signal yellow is spent in few places**: the Next up board dates, the nav you-are-here strip,
  the nav count badge, the logo mark, and the bulk-apply button. Adding it elsewhere dilutes it.
  Never yellow text on a light surface (it fails contrast); yellow is a fill with ink on it, or
  text on the dark board or nav.
- **Primary buttons are ink** (`.btn-primary`, `.btn-submit`, `AppButton` primary), not blue or
  yellow.
- New colour needs → add a token pair to `style.css` (light **and** dark), never a literal.
- ECharts draws to canvas and can't read CSS variables. Chart files keep a small literal map
  that mirrors the tokens (see `AreaChart.vue` `CHART_INK`). That's the only allowed exception.

## Status colours

One system for the nine application statuses. `STATUS_TOKEN` in `src/stores/applications.ts` maps
each status to a token; `STATUS_COLOR` (`chip-<token>`) and `statusMark(status)`
(`var(--status-<token>-mark)`) derive from it. Chips, card stripes and the journey tree all
use it, so a status is the same colour everywhere. Never define a second set of status colours
in a component. Ghosted is a dashed outline (the company went quiet).

Sponsor flag: **Not HSM sponsor** carries the warning tone (that company can't hire on an HSM
permit); **HSM sponsor** is the quiet default. Keep that emphasis.

## Type

IBM Plex Sans, self-hosted via `@fontsource` (no Google Fonts, for GDPR). IBM Plex Sans
Condensed 500/600 only for dates and figures that need to line up (the board dates). Use
`font-variant-numeric: tabular-nums` on numbers in columns, counts and pagination. Weights: 400
body, 500 labels, 600 headings. No 700 on headings, no all-caps labels, no letter-spaced
eyebrows.

## Shape and structure

- Radii come from `--radius-sm` (4px: chips, badges), `--radius` (6px: buttons, inputs),
  `--radius-lg` (10px: cards, panels, modals). No pills (`9999px`) for new elements.
- Flat surfaces: a hairline border, not a drop shadow. Shadows only on things that float
  (modals, dropdowns, toasts).
- Structure encodes information: the left stripe on an application card is its status colour.
  Don't add borders, numbering or labels that carry no meaning.
- Visible keyboard focus comes from the global `:focus-visible` rule. Don't remove outlines
  without replacing them.

## Motion

Motion only answers the user's own action: opening a modal, a filter panel dropping, the
status chip flashing after a save, the bulk bar sliding in. No hover lifts, no staggered list
entrances, no press-shrink on buttons. Route changes are a 120ms fade. Every animation has a
`prefers-reduced-motion: reduce` override.

## Copy

- Sentence case everywhere (buttons, titles, labels, tab titles). Tab title: `Page | ik wil werk zoeken`
  via `pageTitle()` in `src/router/title.ts`.
- Name things the way the user thinks of them ("Follow up now", "Open my applications"), with an
  active verb on buttons that says what happens.
- No emoji, no trailing `→` on links or buttons, no exclamation marks.
- Empty states say what to do next; errors say what happened and how to fix it, and never apologise.

## Charts

Categorical colours use the validated eight-slot palette in `RejectionChart.vue`, assigned by entity
in a fixed order (a reason keeps its colour whatever else is present), with neutral greys for
"Other" / "No reason given". Every slice gets a legend row with its count, because several slot
colours are below 3:1 contrast on the light card. Single-series charts use route blue, 2px lines,
hairline grid. Changing chart colours: load the `dataviz` skill and run its palette validator
against `--col-surface` for both themes.

## Verify before calling UI work done

1. `pnpm test` (includes the design-token guard) and `pnpm type-check` in `frontend/`.
2. With `pnpm dev` and the API running, run `pnpm screenshots` in `frontend/` (auth via
   `IWWZ_TOKEN` or `IWWZ_EMAIL`/`IWWZ_PASSWORD`; see `scripts/screenshots.mjs`). It captures
   desktop and mobile in light and dark mode into `frontend/screenshots/` and exits non-zero on
   page errors, console errors or sideways scrolling. Look at the shots, especially mobile and dark.
