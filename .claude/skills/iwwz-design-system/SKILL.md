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
  the nav count badge, the logo mark, the bulk-apply button, and the "Follow up today" chip on an
  application row (an overdue follow-up is red instead). Adding it elsewhere dilutes it.
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
entrances, no press-shrink on buttons.

**Timing comes from tokens, never literals** (`style.css`; `motionTokens.test.ts` fails the build
on a literal duration or a named curve like `ease`):

| Token | Value | Use for |
|---|---|---|
| `--dur-instant` | 120ms | feedback on what is already under the pointer: hover colour, focus ring, a node dimming |
| `--dur-base` | 180ms | something appearing, leaving or moving: modal, toast, bulk bar, filter panel, chevron, page change |
| `--dur-emphasis` | 600ms | the one flash that confirms a save |
| `--dur-loop` | 900ms | spinners and "saving" pulses (with `linear` for a spinner) |
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | almost everything |
| `--ease-out` | `cubic-bezier(0, 0, .2, 1)` | things arriving: the modal box, the chip flash |

If something needs a speed that isn't here, it probably shouldn't move — ask before adding a token.

**Page changes use the View Transitions API** (`src/router/viewTransition.ts`). The browser
snapshots the old page and cross-fades to the new one in a single step, so there's no blank frame
between routes. The nav has its own `view-transition-name` and doesn't fade; the you-are-here
strip is a real `.nav-marker` element (not `::after`) named `nav-marker`, and it slides to the
new link. A `view-transition-name` must be on exactly one element at a time, or the browser skips
the animation. Query changes on the same page (`?open=<id>`) don't animate. Browsers without the API
get the old CSS fade (`App.vue`). After a transition, if the focused element went away with the
old page, focus moves to the new page's `h1`.

**Modals on phones are bottom sheets.** Under 767px the new-application form, the company popup
and the application panel sit on the bottom edge, full width, with top corners only, and rise
from below (`translateY(100%)`) instead of scaling in. The confirm dialog stays a centred alert.

**Three traps that silently delete an animation** — each shipped at least once:
- *Tailwind purges runtime classes.* Rules inside `@layer components` survive only if the class
  appears literally in a template. Vue's `*-enter-from` / `*-leave-active` never do, so transition
  rules must live outside the layer (see "Vue transition classes" in `style.css`). The modal
  backdrop fade, every toast and the list fade were missing from the build until this was found;
  `transitionClasses.test.ts` guards it.
- *A `<Transition>` only animates a single element root.* A component with two roots, or a
  `<Teleport>` root, is inserted with no animation and a console warning. `NewApplicationModal`
  had two roots; `ConfirmDialog`'s root is a Teleport, so it now carries its own
  `<Transition name="modal" appear>` inside.
- *A later plain rule undoes an earlier phone rule* (see Phones and tablets).

Charts: the rejection bars grow and shrink between ranges (`width` on `--dur-base`). ECharts gets
180ms `cubicOut`, mirroring `--dur-base` / `--ease-out`, instead of its one-second default.

Reduced motion: the `*` backstop at the end of `style.css` stops every CSS animation, the router
skips view transitions entirely, and a separate rule stops `::view-transition-*`, which the `*`
selector can't reach. Canvas ignores all of that, so charts read `useReducedMotion()` (live — it
follows the setting if it changes with the page open) and turn ECharts' animation off.

## Copy

- Sentence case everywhere (buttons, titles, labels, tab titles). Tab title: `Page | ik wil werk zoeken`
  via `pageTitle()` in `src/router/title.ts`.
- Name things the way the user thinks of them ("Follow up now", "Open my applications"), with an
  active verb on buttons that says what happens.
- No emoji, no trailing `→` on links or buttons, no exclamation marks.
- Empty states say what to do next; errors say what happened and how to fix it, and never apologise.

## Charts

Pick the simplest form that answers the question, and prefer text over canvas:
- **Rejection reasons** is a ranked HTML list with one bar per reason (`RejectionChart.vue`), not a
  donut: comparing a few counts is what bars are for, and text rows need no colour key. One series,
  one colour (route blue); "Other" and "No reason given" are muted.
- **Applications per week** is an ECharts bar chart (a weekly count is discrete, so no smoothed
  line), with weeks labelled by their Monday ("12 May") and a visually hidden text summary,
  since the canvas has none.
- **Application journey** (`StatusTree.vue`) stops shrinking at 75% and scrolls; when cramped it
  adds a plain status list with the same numbers. Cramped means too short as well as too narrow —
  the dashboard pins the card's height to the charts column beside it — and the edge the tree
  carries on past is faded with a mask, so a half-drawn node reads as "scroll", not "broken".
- If a chart ever needs several categorical colours, load the `dataviz` skill and run its palette
  validator against `--col-surface` in both themes before shipping.

## Interaction patterns

- Cards and tiles are mouse targets only; the name inside is the real `<button>` (keyboard,
  screen readers). Never `role="button"` on a container that holds a checkbox or link.
- Status filtering on My applications is the row of status tabs with counts (`aria-pressed`),
  not a dropdown.
- Link straight to an application with `/applications?open=<id>` (the Next up board does this).
- A number with no label (like the nav count badge) gets `aria-hidden` plus `sr-only` text that
  says what it counts.

## Phones and tablets

The app is used on an **iPhone 15 Pro Max**, so that is the reference screen: 430 x 932 CSS
pixels at DPR 3. `pnpm screenshots` carries a profile for it and for the screens either side of
it, in CSS pixels (what the layout sees, not the marketing resolution):

| Profile | CSS size | DPR | Why it is in the set |
|---|---|---|---|
| `iphone-15-pro-max` | 430 x 932 | 3 | the reference phone |
| `iphone-15` | 393 x 852 | 3 | the common iPhone width |
| `iphone-se` | 375 x 667 | 2 | shortest screen still worth passing |
| `galaxy-s24` | 360 x 780 | 3 | narrowest width in real use |
| `pixel-8` | 412 x 915 | 2.625 | a non-integer DPR, which catches hairline rounding |
| `ipad-mini` | 744 x 1133 | 2 | between the phone rules and the desktop ones |
| `ipad-pro-11` | 834 x 1194 | 2 | tablet portrait, still not desktop |
| `desktop` / `wide` | 1440 x 900, 1920 x 1080 | 1 | |

Groups: `--viewports=phones`, `--viewports=tablets`, `--viewports=all`. `mobile` still means the
reference phone.

**Breakpoints.** 767px is the house phone breakpoint and 900px switches the dashboard to two
columns. Everything else in the codebase (640, 600, 560, 520, 480) is a one-off from earlier work —
don't add more; reach for the existing two first.

**A media query adds no specificity.** A phone rule written *above* the plain rule it means to
override does nothing at all. `.page-btn` in CompaniesView and the custom date fields on the
dashboard both shipped like that. Put phone overrides after the rule they override;
`src/__tests__/cssOverrideOrder.test.ts` fails the build when one isn't (it knows an unlayered
rule beats a later `@layer` one). The reverse also bites: a broad phone rule placed after a state
class repaints it — scope it with `:not(.x--active)`.

**Touch targets.** `@media (pointer: coarse)` in `style.css` holds every control to 44px (Apple's
HIG minimum) — buttons, inputs, selects, status tabs, range buttons, icon buttons, pagination.
It keys off the pointer, not the width, so a touchscreen laptop counts. Two deliberate exceptions:
a checkbox takes the 24px WCAG 2.5.8 floor rather than pushing the row apart, and the name button
inside an application row or company tile stays text-sized — the row or tile around it is the
touch target, and the button exists for keyboards and screen readers.

**Safe areas.** `index.html` sets `viewport-fit=cover`, so anything fixed or sticky at the bottom
must add `env(safe-area-inset-bottom)` to its padding or offset, or the home indicator sits on top
of it. The bulk bar and both toasts do this.

**What collapses and what scrolls.** Rows stack, the toolbar takes its own full-width line with
pagination centred under it, and the status tabs scroll sideways rather than wrapping. A small,
fixed set of choices (the six dashboard ranges) becomes an even grid instead, so nothing hides
off-screen; a wrapped flex row of controls (the Companies toolbar) becomes a two-column grid.
Pagination puts its count on a line of its own so the buttons never wrap, and large counts get
thousands separators (`12,790`). Controls that act on a selection (the bulk bar) are pinned to
the bottom of the screen on phones, never sticky to the end of a long list. Modal footers split
their buttons evenly across the sheet. A canvas
that cannot shrink any further stops shrinking, scrolls with a faded edge, and puts the same
numbers in text beside it (`StatusTree.vue`). Nothing else may scroll sideways — the screenshot
run fails if the page is wider than the screen.

## Verify before calling UI work done

1. `pnpm test` (includes the design-token guard) and `pnpm type-check` in `frontend/`.
2. With `pnpm dev` and the API running, run `pnpm screenshots` in `frontend/` (auth via
   `IWWZ_TOKEN` or `IWWZ_EMAIL`/`IWWZ_PASSWORD`; see `scripts/screenshots.mjs`). It captures
   desktop and mobile in light and dark mode into `frontend/screenshots/` and exits non-zero on
   page errors, console errors, sideways scrolling or serious axe-core accessibility problems
   (including colour contrast in each theme). Look at the shots, especially mobile and dark.
   The `iwwz-run` skill has the start-up order, ports and flags; `iwwz-testing` has how the
   tests themselves are written.
