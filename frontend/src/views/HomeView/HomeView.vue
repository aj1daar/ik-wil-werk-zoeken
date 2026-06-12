<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useApplicationsStore, STATUS_LABELS, STATUS_COLOR, ALL_STATUSES } from '../../stores/applications'
import type { ApplicationStatus } from '../../api'

const store = useApplicationsStore()

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

onMounted(fetchStats)
watch(fromTo, fetchStats)

function count(status: ApplicationStatus): number {
  return store.stats?.byStatus[status] ?? 0
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Overview of your job search activity.</p>
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

    <template v-else-if="store.stats">
      <div class="total-card">
        <span class="total-number">{{ store.stats.total }}</span>
        <span class="total-label">applications total</span>
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
.page-title { font-size: 1.5rem; font-weight: 700; color: #1a1a1a; }
.page-subtitle { color: #6b7280; margin-top: .25rem; }

.range-bar { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
.range-btn {
  padding: .375rem .875rem; border-radius: 9999px; border: 1px solid #d1d5db;
  background: white; cursor: pointer; font-size: .875rem; color: #374151;
  transition: all .15s;
}
.range-btn--active { background: #1a1a1a; color: white; border-color: #1a1a1a; }

.custom-range { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
.custom-range-field { display: flex; flex-direction: column; gap: .25rem; }
.field-label { font-size: .75rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
.field-input { border: 1px solid #d1d5db; border-radius: .375rem; padding: .375rem .625rem; font-size: .875rem; }

.state-msg { color: #6b7280; padding: 2rem 0; text-align: center; }

.total-card {
  display: flex; align-items: baseline; gap: .75rem;
  padding: 1.5rem; background: #f9fafb; border-radius: .75rem;
  margin-bottom: 1.5rem;
}
.total-number { font-size: 3rem; font-weight: 800; color: #1a1a1a; line-height: 1; }
.total-label  { font-size: 1rem; color: #6b7280; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1rem;
}
.stat-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: .5rem;
  padding: 1.25rem 1rem; background: white;
  border: 1px solid #e5e7eb; border-radius: .75rem;
}
.stat-chip {
  display: inline-block; padding: .2rem .6rem; border-radius: 9999px;
  font-size: .75rem; font-weight: 600;
}
.stat-count { font-size: 2rem; font-weight: 700; color: #1a1a1a; }
</style>
