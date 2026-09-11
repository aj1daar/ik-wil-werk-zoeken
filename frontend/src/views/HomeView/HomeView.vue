<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useApplicationsStore } from '../../stores/applications'
import type { Application } from '../../api'
import StatusTree from '../../components/StatusTree/StatusTree.vue'
import RejectionChart from '../../components/RejectionChart/RejectionChart.vue'
import AreaChart from '../../components/AreaChart/AreaChart.vue'
import DatePicker from '../../components/DatePicker/DatePicker.vue'

const store = useApplicationsStore()

const showBanner = ref(false)

const TERMINAL = new Set(['Rejected', 'Withdrawn', 'Accepted', 'Ghosted'])

// ── Next up board ─────────────────────────────────────────────────────────────
// The first thing on the dashboard is what to chase: every open application
// whose follow-up date is overdue or falls within the look-ahead window,
// soonest first.

const LOOKAHEAD_DAYS = 14
const BOARD_LIMIT    = 6
const DAY_MS         = 86_400_000

interface BoardRow { app: Application; due: Date; daysFromToday: number }

// followUpDate is stored as a calendar date (midnight UTC). Read the date part
// as a *local* calendar day — parsing the full ISO string would shift it to
// the previous day for anyone west of UTC.
function parseDueDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const nextUp = computed<BoardRow[]>(() => {
  const today = startOfToday().getTime()
  const rows: BoardRow[] = []
  for (const app of store.applications) {
    if (TERMINAL.has(app.status) || !app.followUpDate) continue
    const due = parseDueDate(app.followUpDate)
    if (!due) continue
    // Math.round absorbs the 23h/25h days around a DST switch
    const daysFromToday = Math.round((due.getTime() - today) / DAY_MS)
    if (daysFromToday > LOOKAHEAD_DAYS) continue
    rows.push({ app, due, daysFromToday })
  }
  return rows.sort((a, b) =>
    a.daysFromToday - b.daysFromToday || a.app.companyName.localeCompare(b.app.companyName))
})

const boardRows    = computed(() => nextUp.value.slice(0, BOARD_LIMIT))
const hiddenCount  = computed(() => nextUp.value.length - boardRows.value.length)
const overdueCount = computed(() => nextUp.value.filter(r => r.daysFromToday < 0).length)

const boardSummary = computed(() => {
  const overdue  = overdueCount.value
  const upcoming = nextUp.value.length - overdue
  const parts: string[] = []
  if (overdue)  parts.push(`${overdue} overdue`)
  if (upcoming) parts.push(`${upcoming} coming up`)
  return parts.join(', ')
})

function dueLabel(days: number): string {
  if (days < -1)  return `${-days} days late`
  if (days === -1) return '1 day late'
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `In ${days} days`
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function dismissBanner() {
  showBanner.value = false
  window.localStorage?.setItem('iwwz_onboarded', '1')
}

// ── Pipeline range ────────────────────────────────────────────────────────────

type RangeKey = 'all' | '1w' | '1m' | '3m' | '6m' | '1y' | 'custom'

const range      = ref<RangeKey>('1y')
const customFrom = ref('')
const customTo   = ref('')
const customAll  = ref(false)

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '1w',  label: 'Last week' },
  { key: '1m',  label: 'Last month' },
  { key: '3m',  label: 'Last 3 months' },
  { key: '6m',  label: 'Last 6 months' },
  { key: '1y',  label: 'Last year' },
  { key: 'custom', label: 'Custom' },
]

function toIso(d: Date) { return d.toISOString() }

const fromTo = computed<{ from?: string; to?: string }>(() => {
  const now = new Date()
  if (range.value === '1w') {
    const f = new Date(now); f.setDate(f.getDate() - 7)
    return { from: toIso(f), to: toIso(now) }
  }
  if (range.value === '1m') {
    const f = new Date(now); f.setMonth(f.getMonth() - 1)
    return { from: toIso(f), to: toIso(now) }
  }
  if (range.value === '3m') {
    const f = new Date(now); f.setMonth(f.getMonth() - 3)
    return { from: toIso(f), to: toIso(now) }
  }
  if (range.value === '6m') {
    const f = new Date(now); f.setMonth(f.getMonth() - 6)
    return { from: toIso(f), to: toIso(now) }
  }
  if (range.value === '1y') {
    const f = new Date(now); f.setFullYear(f.getFullYear() - 1)
    return { from: toIso(f), to: toIso(now) }
  }
  if (range.value === 'custom') {
    if (customAll.value) return {}
    return {
      from: customFrom.value ? new Date(customFrom.value).toISOString() : undefined,
      to:   customTo.value   ? new Date(customTo.value).toISOString()   : undefined,
    }
  }
  return {}
})

async function fetchStatusFlow() {
  await store.loadStatusFlow(fromTo.value.from, fromTo.value.to)
}

onMounted(() => {
  showBanner.value = !window.localStorage?.getItem('iwwz_onboarded')
  store.load()
  return fetchStatusFlow()
})
watch(fromTo, fetchStatusFlow)

// Desktop only: cap the journey tree's height to whatever the rejection +
// over-time column measures, so a growing tree scrolls instead of pushing
// the page taller than its neighbor column.
const chartsColRef     = ref<HTMLElement | null>(null)
const journeyMaxHeight = ref<number | null>(null)
const isDesktop        = ref(false)
let chartsResizeObserver: ResizeObserver | null = null
let desktopMediaQuery: MediaQueryList | null = null

function updateJourneyHeight() {
  journeyMaxHeight.value = isDesktop.value && chartsColRef.value
    ? chartsColRef.value.offsetHeight
    : null
}

const journeyStyle = computed(() =>
  journeyMaxHeight.value ? { height: `${journeyMaxHeight.value}px` } : {}
)

onMounted(() => {
  desktopMediaQuery = window.matchMedia('(min-width: 900px)')
  isDesktop.value = desktopMediaQuery.matches
  desktopMediaQuery.addEventListener('change', e => {
    isDesktop.value = e.matches
    updateJourneyHeight()
  })
})
onUnmounted(() => chartsResizeObserver?.disconnect())

// charts-col sits behind `v-else-if="store.statusFlow"`, so the ref is still
// null when onMounted runs (the stats fetch hasn't resolved yet) — watch it
// instead of grabbing it once, so the observer attaches whenever the column
// actually appears.
watch(chartsColRef, el => {
  chartsResizeObserver?.disconnect()
  if (el) {
    chartsResizeObserver = new ResizeObserver(updateJourneyHeight)
    chartsResizeObserver.observe(el)
  }
  updateJourneyHeight()
})

// RejectionChart/AreaChart size themselves off store.applications, which can
// resolve after charts-col first mounts (e.g. its legend rows growing once
// rejection reasons are known) — resync once that settles, past the point
// where the ResizeObserver's own timing might race the charts' own layout.
watch(() => store.applications, () => updateJourneyHeight(), { flush: 'post' })
</script>

<template>
  <div class="page">
    <div v-if="showBanner" class="onboarding-banner" role="status" aria-label="Getting started">
      <div class="banner-body">
        <strong>Keep your whole job search in one place</strong>
        <p>Log each application you send, check whether a company is an IND-recognised sponsor before you apply, and give applications a follow-up date so none of them go quiet. Start on the My applications page.</p>
      </div>
      <button class="banner-close" @click="dismissBanner" aria-label="Dismiss">×</button>
    </div>

    <section class="board" aria-labelledby="board-title">
      <header class="board-head">
        <h1 id="board-title" class="board-title">Next up</h1>
        <p v-if="boardSummary" class="board-summary">{{ boardSummary }}</p>
      </header>

      <p v-if="store.loading && store.applications.length === 0" class="board-empty">Loading follow-ups…</p>

      <ol v-else-if="boardRows.length > 0" class="board-rows">
        <li
          v-for="r in boardRows"
          :key="r.app.id"
          :class="['board-row', { 'board-row--late': r.daysFromToday < 0, 'board-row--today': r.daysFromToday === 0 }]"
        >
          <span class="board-date">{{ dateLabel(r.due) }}</span>
          <span class="board-what">
            <span class="board-company">{{ r.app.companyName }}</span>
            <span class="board-position">{{ r.app.position }}</span>
          </span>
          <span class="board-when">{{ dueLabel(r.daysFromToday) }}</span>
        </li>
      </ol>

      <p v-else-if="store.applications.length === 0" class="board-empty">
        Add your first application and give it a follow-up date. It shows up here when it's due.
      </p>
      <p v-else class="board-empty">
        Nothing to chase in the next two weeks. Give an application a follow-up date and it shows up here.
      </p>

      <footer class="board-foot">
        <router-link to="/applications" class="board-link">
          {{ store.applications.length === 0 ? 'Add an application' : 'Open my applications' }}
        </router-link>
        <span v-if="hiddenCount > 0" class="board-more">{{ hiddenCount }} more not shown</span>
      </footer>
    </section>

    <div class="pipeline-head">
      <h2 class="pipeline-title">Pipeline</h2>
      <div class="range-bar" role="group" aria-label="Time range for the pipeline charts">
        <button
          v-for="opt in RANGE_OPTIONS"
          :key="opt.key"
          :class="['range-btn', range === opt.key && 'range-btn--active']"
          :aria-pressed="range === opt.key"
          @click="range = opt.key"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div v-if="range === 'custom'" class="custom-range">
      <label class="custom-overall-toggle">
        <input v-model="customAll" type="checkbox" class="custom-overall-cb" />
        Overall (all time)
      </label>
      <div v-if="!customAll" class="custom-date-row">
        <div class="custom-range-field">
          <label class="field-label">From</label>
          <DatePicker v-model="customFrom" placeholder="Start date" />
        </div>
        <div class="custom-range-field">
          <label class="field-label">To</label>
          <DatePicker v-model="customTo" placeholder="End date" />
        </div>
      </div>
    </div>

    <div v-if="store.statusFlowLoading && !store.statusFlow" class="state-msg">Loading…</div>

    <div v-else-if="store.statusFlowError" class="state-msg state-msg--error" role="alert">{{ store.statusFlowError }}</div>

    <div v-else-if="store.statusFlow" :class="['content-area', { 'content-area--updating': store.statusFlowLoading }]">
      <div class="journey-layout">
        <StatusTree :flow="store.statusFlow" class="funnel-section" :style="journeyStyle" />

        <div class="charts-col" ref="chartsColRef">
          <RejectionChart :applications="store.applications" :from="fromTo.from" :to="fromTo.to" />
          <AreaChart :applications="store.applications" :from="fromTo.from" :to="fromTo.to" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 860px;
  margin: 10px auto 16px;
  padding: 1.5rem 1rem 2rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--island-shadow);
  background: var(--col-bg);
}
@media (max-width: 640px) {
  .page { margin: 0; border-radius: 0; box-shadow: none; }
}

/* ── Next up board ─────────────────────────────────────────────────────────
   The one loud element on the page: a departures-board panel in nav ink
   with dates in signal yellow. Everything below it stays quiet. */
.board {
  background: var(--col-nav);
  color: var(--col-nav-text);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.5rem 1rem;
  margin-bottom: 2rem;
}
.board-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: .75rem;
}
.board-title {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
}
.board-summary { margin: 0; font-size: .875rem; color: var(--col-nav-muted); }

.board-rows { list-style: none; margin: 0; padding: 0; }
.board-row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 1rem;
  padding: .625rem 0;
  border-top: 1px solid color-mix(in srgb, var(--col-nav-text) 12%, transparent);
}
.board-date {
  font-family: 'IBM Plex Sans Condensed', 'IBM Plex Sans', system-ui, sans-serif;
  font-weight: 600;
  font-size: 1.0625rem;
  font-variant-numeric: tabular-nums;
  color: var(--col-signal);
  white-space: nowrap;
}
.board-what { display: flex; align-items: baseline; gap: .625rem; min-width: 0; }
.board-company {
  font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 1; min-width: 0;
}
.board-position {
  color: var(--col-nav-muted);
  font-size: .875rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 2; min-width: 0;
}
.board-when { font-size: .875rem; color: var(--col-nav-muted); white-space: nowrap; }
.board-row--late .board-when,
.board-row--today .board-when { color: var(--col-signal); font-weight: 600; }

.board-empty {
  margin: 0;
  padding: .75rem 0;
  border-top: 1px solid color-mix(in srgb, var(--col-nav-text) 12%, transparent);
  font-size: .9375rem;
  color: var(--col-nav-muted);
  max-width: 60ch;
}

.board-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: .75rem;
  border-top: 1px solid color-mix(in srgb, var(--col-nav-text) 12%, transparent);
  font-size: .875rem;
}
.board-link { color: var(--col-nav-text); font-weight: 500; text-underline-offset: 3px; }
.board-link:hover { color: var(--col-signal); }
.board-link:focus-visible { outline-color: var(--col-signal); }
.board-more { color: var(--col-nav-muted); }

@media (max-width: 560px) {
  .board { padding: 1rem 1rem .75rem; border-radius: var(--radius); }
  .board-row {
    grid-template-columns: 4rem minmax(0, 1fr);
    grid-template-areas: "date what" "date when";
    row-gap: .125rem;
  }
  .board-date { grid-area: date; }
  .board-what { grid-area: what; flex-direction: column; gap: 0; }
  .board-when { grid-area: when; }
}

/* ── Pipeline ──────────────────────────────────────────────────────────── */
.pipeline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.pipeline-title { font-size: 1.125rem; font-weight: 600; margin: 0; }

/* Segmented control: one bordered strip, the active segment filled in ink */
.range-bar {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--col-border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--col-bg);
}
.range-btn {
  padding: .375rem .75rem;
  border: none;
  border-left: 1px solid var(--col-border);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: .8125rem;
  color: var(--col-muted);
  transition: background-color 150ms ease, color 150ms ease;
}
.range-btn:first-child { border-left: none; }
.range-btn:focus-visible { outline-offset: -2px; }
.range-btn:not(.range-btn--active):hover { background: var(--col-surface); color: var(--col-text); }
.range-btn--active { background: var(--col-invert-bg); color: var(--col-invert-text); font-weight: 500; }
@media (max-width: 640px) {
  .range-bar { width: 100%; }
  .range-btn { flex: 1 1 auto; }
}

.custom-range { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1rem; }
.custom-overall-toggle {
  display: flex; align-items: center; gap: .5rem;
  font-size: .875rem; color: var(--col-text); cursor: pointer; user-select: none;
}
.custom-overall-cb { width: 1rem; height: 1rem; accent-color: var(--col-accent); cursor: pointer; }
.custom-date-row { display: flex; gap: 1rem; flex-wrap: wrap; }
.custom-range-field { display: flex; flex-direction: column; gap: .25rem; }

.onboarding-banner {
  display: flex; align-items: flex-start; gap: 1rem;
  background: var(--col-surface); border: 1px solid var(--col-border-lt);
  border-radius: var(--radius-lg); padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
}
.banner-body { flex: 1; font-size: .875rem; color: var(--col-text); }
.banner-body strong { display: block; margin-bottom: .25rem; font-weight: 600; }
.banner-body p { color: var(--col-muted); margin: 0; line-height: 1.55; max-width: 72ch; }
.banner-close {
  background: none; border: none; cursor: pointer;
  font-size: 1.5rem; line-height: 1; color: var(--col-muted);
  padding: 0 .25rem; flex-shrink: 0;
}
.banner-close:hover { color: var(--col-text); }

.state-msg { color: var(--col-muted); padding: 2rem 0; text-align: center; }
.state-msg--error { color: var(--col-error); }

.funnel-section { margin-bottom: 1.5rem; }

.journey-layout { display: flex; flex-direction: column; }

.charts-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
@media (max-width: 600px) {
  .charts-col { grid-template-columns: 1fr; }
}

/* Desktop: tree on the right, rejection + over-time stacked on the left —
   keeps the dashboard from growing taller as charts are added. */
@media (min-width: 900px) {
  .page { max-width: 1180px; padding: 1.75rem 1.75rem 2rem; }
  .journey-layout {
    display: grid;
    grid-template-columns: minmax(320px, 380px) 1fr;
    align-items: start;
    gap: 1rem;
  }
  .funnel-section { order: 2; margin-bottom: 0; }
  .charts-col {
    order: 1;
    grid-template-columns: 1fr;
    margin-bottom: 0;
  }
}

.content-area { transition: opacity 200ms ease; }
.content-area--updating { opacity: 0.4; pointer-events: none; }
</style>
