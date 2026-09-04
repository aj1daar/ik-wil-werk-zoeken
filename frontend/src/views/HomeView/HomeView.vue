<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useApplicationsStore } from '../../stores/applications'
import StatusTree from '../../components/StatusTree/StatusTree.vue'
import RejectionChart from '../../components/RejectionChart/RejectionChart.vue'
import AreaChart from '../../components/AreaChart/AreaChart.vue'
import DatePicker from '../../components/DatePicker/DatePicker.vue'

const store = useApplicationsStore()

const showBanner   = ref(false)
const showOverdue  = ref(true)

const TERMINAL = new Set(['Rejected', 'Withdrawn', 'Accepted', 'Ghosted'])

const overdueApps = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return store.applications
    .filter(a => !TERMINAL.has(a.status) && a.followUpDate && a.followUpDate.slice(0, 10) < today)
    .sort((a, b) => (a.followUpDate ?? '').localeCompare(b.followUpDate ?? ''))
    .slice(0, 5)
})
function dismissBanner() {
  showBanner.value = false
  window.localStorage?.setItem('iwwz_onboarded', '1')
}

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


</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
    </div>

    <div v-if="showBanner" class="onboarding-banner" role="status" aria-label="Welcome tip">
      <div class="banner-body">
        <strong>Welcome to IK WIL WERK ZOEKEN!</strong>
        <p>Track every job application, explore IND-registered sponsors, and see your progress at a glance. Start by adding your first application from the Applications tab.</p>
      </div>
      <button class="banner-close" @click="dismissBanner" aria-label="Dismiss welcome banner">×</button>
    </div>

    <div class="range-bar">
      <button
        v-for="opt in RANGE_OPTIONS"
        :key="opt.key"
        :class="['range-btn', range === opt.key && 'range-btn--active']"
        @click="range = opt.key"
      >{{ opt.label }}</button>
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
      <div v-if="overdueApps.length > 0" class="overdue-card">
        <button class="overdue-header" @click="showOverdue = !showOverdue" :aria-expanded="showOverdue">
          <span class="overdue-title">
            Follow-ups overdue
            <span class="overdue-badge">{{ overdueApps.length }}</span>
          </span>
          <svg class="overdue-chevron" :class="{ 'chevron-up': showOverdue }" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <ul v-if="showOverdue" class="overdue-list">
          <li v-for="app in overdueApps" :key="app.id" class="overdue-item">
            <div class="overdue-app-name">
              <span class="overdue-company">{{ app.companyName }}</span>
              <span class="overdue-sep">·</span>
              <span class="overdue-position">{{ app.position }}</span>
            </div>
            <span class="overdue-date">Due {{ app.followUpDate!.slice(0, 10) }}</span>
          </li>
        </ul>
      </div>

      <div class="journey-layout">
        <StatusTree :flow="store.statusFlow" class="funnel-section" />

        <div class="charts-col">
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
  padding: 2rem 1rem;
  border-radius: 16px;
  box-shadow: var(--island-shadow);
  background: var(--col-bg);
}
@media (max-width: 640px) {
  .page { margin: 0; border-radius: 0; box-shadow: none; }
}
.page-header { margin-bottom: 1.5rem; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--col-text); }

.range-bar { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
.range-btn {
  padding: .375rem .875rem; border-radius: 9999px; border: 1px solid var(--col-border);
  background: var(--col-bg); cursor: pointer; font-size: .875rem; color: var(--col-muted);
  transition: background-color 220ms ease, color 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
  box-shadow: none;
}
.range-btn:not(.range-btn--active):hover {
  background: var(--col-surface);
  border-color: var(--col-border);
  color: var(--col-text);
}
.range-btn--active {
  background: var(--col-invert-bg);
  color: var(--col-invert-text);
  border-color: var(--col-invert-bg);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--col-invert-bg) 35%, transparent);
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
  background: var(--col-accent-lt); border: 1px solid var(--col-accent);
  border-radius: .75rem; padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}
.banner-body { flex: 1; font-size: .875rem; color: var(--col-text); }
.banner-body strong { display: block; margin-bottom: .25rem; }
.banner-body p { color: var(--col-muted); margin: 0; line-height: 1.5; }
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
  .page { max-width: 1180px; }
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

.overdue-card {
  background: color-mix(in srgb, #f59e0b 8%, var(--col-surface));
  border: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
  border-radius: .75rem; margin-bottom: 1.5rem; overflow: hidden;
}
.overdue-header {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; background: none; border: none; cursor: pointer;
  padding: .875rem 1.25rem; text-align: left; gap: .5rem;
}
.overdue-title { font-size: .875rem; font-weight: 600; color: #92400e; display: flex; align-items: center; gap: .5rem; }
.overdue-badge {
  background: #f59e0b; color: #fff;
  border-radius: 9999px; font-size: .7rem; font-weight: 700; padding: .1rem .45rem;
}
.overdue-chevron { width: 1rem; height: 1rem; color: #92400e; transition: transform .2s; flex-shrink: 0; }
.chevron-up { transform: rotate(180deg); }
.overdue-list { list-style: none; margin: 0; padding: 0 1.25rem .75rem; display: flex; flex-direction: column; gap: .5rem; }
.overdue-item {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  background: var(--col-bg); border: 1px solid var(--col-border);
  border-radius: .5rem; padding: .5rem .875rem; font-size: .8rem;
}
.overdue-app-name { display: flex; align-items: center; gap: .375rem; min-width: 0; }
.overdue-company { font-weight: 600; color: var(--col-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.overdue-sep { color: var(--col-subtle); }
.overdue-position { color: var(--col-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.overdue-date { font-size: .75rem; color: #b45309; font-weight: 500; white-space: nowrap; flex-shrink: 0; }

.content-area { transition: opacity 200ms ease; }
.content-area--updating { opacity: 0.4; pointer-events: none; }
</style>
