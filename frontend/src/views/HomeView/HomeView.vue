<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR, ALL_STATUSES } from '../../stores/applications'
import type { ApplicationStatus } from '../../api'

const store = useApplicationsStore()

const showBanner = ref(false)
function dismissBanner() {
  showBanner.value = false
  window.localStorage?.setItem('iwwz_onboarded', '1')
}

type RangeKey = 'all' | '3m' | '6m' | '1y' | 'custom'

const range      = ref<RangeKey>('all')
const customFrom = ref('')
const customTo   = ref('')

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'Overall' },
  { key: '3m',  label: 'Last 3 months' },
  { key: '6m',  label: 'Last 6 months' },
  { key: '1y',  label: 'Last year' },
  { key: 'custom', label: 'Custom' },
]

function toIso(d: Date) { return d.toISOString() }

const fromTo = computed<{ from?: string; to?: string }>(() => {
  const now = new Date()
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
    return {
      from: customFrom.value ? new Date(customFrom.value).toISOString() : undefined,
      to:   customTo.value   ? new Date(customTo.value).toISOString()   : undefined,
    }
  }
  return {}
})

async function fetchStats() {
  await store.loadStats(fromTo.value.from, fromTo.value.to)
}

onMounted(() => {
  showBanner.value = !window.localStorage?.getItem('iwwz_onboarded')
  store.load()
  return fetchStats()
})
watch(fromTo, fetchStats)

function count(status: ApplicationStatus): number {
  return store.stats?.byStatus[status] ?? 0
}

const kpis = computed(() => {
  if (!store.stats) return null
  const s = store.stats.byStatus
  const total = store.stats.total
  const responded = (s.InterviewScheduled ?? 0) + (s.OfferReceived ?? 0) + (s.Accepted ?? 0)
  const offered   = (s.OfferReceived ?? 0) + (s.Accepted ?? 0)

  const responseRate = total > 0 ? `${Math.round((responded / total) * 100)}%` : '—'
  const offerRate    = total > 0 ? `${Math.round((offered   / total) * 100)}%` : '—'

  const { from, to } = fromTo.value
  const respondedApps = store.applications.filter(a => {
    if (!['InterviewScheduled', 'OfferReceived', 'Accepted'].includes(a.status)) return false
    const t = new Date(a.appliedAt).getTime()
    if (from && t < new Date(from).getTime()) return false
    if (to   && t > new Date(to).getTime())   return false
    return true
  })

  const avgDays = respondedApps.length > 0
    ? `${Math.round(
        respondedApps.reduce((sum, a) =>
          sum + (new Date(a.updatedAt).getTime() - new Date(a.appliedAt).getTime()), 0
        ) / respondedApps.length / 86_400_000
      )} d`
    : '—'

  return { responseRate, offerRate, avgDays }
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Overview of your job search activity.</p>
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
      <div class="custom-range-field">
        <label class="field-label">From</label>
        <input v-model="customFrom" type="date" class="field-input" />
      </div>
      <div class="custom-range-field">
        <label class="field-label">To</label>
        <input v-model="customTo" type="date" class="field-input" />
      </div>
    </div>

    <div v-if="store.statsLoading" class="state-msg">Loading…</div>

    <div v-else-if="store.statsError" class="state-msg state-msg--error" role="alert">{{ store.statsError }}</div>

    <template v-else-if="store.stats && kpis">
      <div class="kpi-strip">
        <div class="kpi-card">
          <span class="total-number kpi-value">{{ store.stats.total }}</span>
          <span class="kpi-label">Total applied</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value">{{ kpis.responseRate }}</span>
          <span class="kpi-label">Response rate</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value">{{ kpis.offerRate }}</span>
          <span class="kpi-label">Offer rate</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-value">{{ kpis.avgDays }}</span>
          <span class="kpi-label">Avg. days to response</span>
        </div>
      </div>

      <div class="stats-grid">
        <div v-for="status in ALL_STATUSES" :key="status" class="stat-card">
          <span :class="['stat-chip', STATUS_COLOR[status]]">{{ STATUS_LABELS[status] }}</span>
          <span class="stat-count">{{ count(status) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 860px; margin: 0 auto; padding: 2rem 1rem; }
.page-header { margin-bottom: 1.5rem; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--col-text); }
.page-subtitle { color: var(--col-muted); margin-top: .25rem; }

.range-bar { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
.range-btn {
  padding: .375rem .875rem; border-radius: 9999px; border: 1px solid var(--col-border);
  background: var(--col-bg); cursor: pointer; font-size: .875rem; color: var(--col-muted);
  transition: all .15s;
}
.range-btn--active { background: var(--col-invert-bg); color: var(--col-invert-text); border-color: var(--col-invert-bg); }

.custom-range { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
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

.kpi-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.kpi-card {
  display: flex; flex-direction: column; gap: .25rem;
  padding: 1.25rem 1rem; background: var(--col-surface);
  border: 1px solid var(--col-border); border-radius: .75rem;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--col-text) 5%, transparent);
}
.kpi-value    { font-size: 2rem; font-weight: 800; color: var(--col-text); line-height: 1.1; }
.total-number { font-size: 2.5rem; }
.kpi-label    { font-size: .75rem; color: var(--col-muted); text-transform: uppercase; letter-spacing: .04em; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
}
.stat-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: .5rem;
  padding: 1.25rem 1rem; background: var(--col-surface);
  border: 1px solid var(--col-border); border-radius: .75rem;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--col-text) 4%, transparent);
}
.stat-chip {
  display: inline-block; padding: .2rem .6rem; border-radius: 9999px;
  font-size: .75rem; font-weight: 600;
}
.stat-count { font-size: 2rem; font-weight: 700; color: var(--col-text); }
</style>
