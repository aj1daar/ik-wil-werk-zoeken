<template>
  <div class="donut-wrap">
    <h3 class="chart-title">Rejection breakdown</h3>
    <div v-if="isEmpty" class="chart-empty">{{ emptyMessage }}</div>
    <template v-else>
      <v-chart class="donut-chart" :option="option" autoresize />
      <ul class="donut-legend">
        <li v-for="b in visibleBuckets" :key="b.key" class="donut-legend-item">
          <span class="donut-legend-dot" :style="{ background: b.color }" />
          <span class="donut-legend-label">{{ b.label }}</span>
          <span class="donut-legend-count">{{ b.value }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import type { Application } from '../../api'
import { useTheme } from '../../composables/useTheme'

use([CanvasRenderer, PieChart, TooltipComponent])

const props = defineProps<{
  applications: Application[]
  from?: string
  to?: string
}>()

const { theme } = useTheme()
const surfaceColor = computed(() => theme.value === 'dark' ? '#251D16' : '#F0EAE0')

const REASON_META = [
  { key: 'another_candidate',    label: 'Another candidate selected', color: '#ef4444' },
  { key: 'incompatible_profile', label: 'Incompatible profile',        color: '#3b82f6' },
  { key: 'dutch_language',       label: 'Dutch language requirement',  color: '#f97316' },
  { key: 'salary_mismatch',      label: 'Salary mismatch',             color: '#eab308' },
  { key: 'internal_hire',        label: 'Filled internally',           color: '#8b5cf6' },
  { key: 'failed_assessment',    label: 'Did not pass assessment',     color: '#fb923c' },
  { key: 'other',                label: 'Other',                       color: '#6b7280' },
  { key: 'unknown',              label: 'No reason given',             color: '#94a3b8' },
] as const

const rejected = computed(() => {
  const fromMs = props.from ? new Date(props.from).getTime() : -Infinity
  const toMs   = props.to   ? new Date(props.to).getTime()   :  Infinity
  return props.applications.filter(a => {
    if (a.status !== 'Rejected') return false
    const t = new Date(a.appliedAt).getTime()
    return t >= fromMs && t <= toMs
  })
})

const buckets = computed(() => {
  const counts: Record<string, number> = {}
  for (const a of rejected.value) {
    const key = a.rejectionReason ?? 'unknown'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return REASON_META.map(m => ({ ...m, value: counts[m.key] ?? 0 }))
})

const visibleBuckets = computed(() => buckets.value.filter(b => b.value > 0))

const isEmpty = computed(() => rejected.value.length === 0)

const emptyMessage = computed(() =>
  props.from || props.to ? 'No rejections in this period.' : 'No rejections yet.'
)

const option = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  series: [{
    type: 'pie',
    radius: ['45%', '72%'],
    avoidLabelOverlap: false,
    label: { show: false },
    emphasis: { label: { show: false } },
    data: visibleBuckets.value.map(b => ({
      name:      b.label,
      value:     b.value,
      itemStyle: { color: b.color, borderWidth: 3, borderColor: surfaceColor.value },
    })),
  }],
}))
</script>

<style scoped>
.donut-wrap {
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: .75rem;
  padding: 1.25rem 1rem 1rem;
  box-shadow:
    0 1px 3px  color-mix(in srgb, var(--col-text) 6%, transparent),
    0 4px 16px color-mix(in srgb, var(--col-text) 9%, transparent);
  display: flex;
  flex-direction: column;
}

.chart-title {
  font-size: .8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--col-muted);
  margin: 0 0 .75rem;
}

.donut-chart { height: 200px; width: 100%; }

.chart-empty {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--col-subtle);
  font-size: .875rem;
}

.donut-legend {
  list-style: none;
  margin: .75rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: .375rem;
}

.donut-legend-item {
  display: flex;
  align-items: center;
  gap: .5rem;
  font-size: .8125rem;
}

.donut-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.donut-legend-label { flex: 1; color: var(--col-text); }
.donut-legend-count { font-weight: 600; color: var(--col-text); }
</style>
