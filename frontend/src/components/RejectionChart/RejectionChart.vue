<template>
  <div class="donut-wrap">
    <h3 class="chart-title">Rejection breakdown</h3>
    <div v-if="isEmpty" class="chart-empty">{{ emptyMessage }}</div>
    <template v-else>
      <v-chart class="donut-chart" :option="option" autoresize />
      <ul class="donut-legend">
        <li v-for="b in legendBuckets" :key="b.key" class="donut-legend-item">
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
// ECharts paints to canvas and can't read CSS custom properties, so the
// slice gap colour mirrors --col-surface (the card behind the donut) here.
const surfaceColor = computed(() => theme.value === 'dark' ? '#1B222C' : '#F1F3F5')

// Eight categorical slots in a fixed, validated order (adjacent pairs clear
// the colour-blind separation checks on both card surfaces), one per reason —
// a reason keeps its colour however many others are present. The two
// "no real reason" buckets are neutral greys rather than a ninth hue.
const REASON_META = [
  { key: 'another_candidate',    label: 'Another candidate selected', light: '#2a78d6', dark: '#3987e5' },
  { key: 'incompatible_profile', label: 'Incompatible profile',        light: '#eb6834', dark: '#d95926' },
  { key: 'dutch_language',       label: 'Dutch language requirement',  light: '#1baf7a', dark: '#199e70' },
  { key: 'salary_mismatch',      label: 'Salary mismatch',             light: '#eda100', dark: '#c98500' },
  { key: 'internal_hire',        label: 'Filled internally',           light: '#e87ba4', dark: '#d55181' },
  { key: 'failed_assessment',    label: 'Did not pass assessment',     light: '#008300', dark: '#008300' },
  { key: 'no_vacancies',         label: 'No vacancies at the moment',  light: '#4a3aa7', dark: '#9085e9' },
  { key: 'no_hsm_sponsorship',   label: 'No HSM visa sponsorship',     light: '#e34948', dark: '#e66767' },
  { key: 'other',                label: 'Other',                       light: '#8A93A0', dark: '#6E7887' },
  { key: 'unknown',              label: 'No reason given',             light: '#B8C0CA', dark: '#4A5361' },
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
  const dark = theme.value === 'dark'
  return REASON_META.map(m => ({
    key: m.key, label: m.label, color: dark ? m.dark : m.light, value: counts[m.key] ?? 0,
  }))
})

const nonZeroBuckets = computed(() =>
  buckets.value.filter(b => b.value > 0).sort((a, b) => b.value - a.value)
)

// Every slice gets a legend row with its count. Several slot colours sit
// below 3:1 against the light card, so the labelled legend — not the slice
// colour — is what identifies each reason.
const legendBuckets = nonZeroBuckets

const isEmpty = computed(() => rejected.value.length === 0)

const emptyMessage = computed(() =>
  props.from || props.to ? 'No rejections in this period.' : 'No rejections yet.'
)

const option = computed(() => ({
  textStyle: { fontFamily: "'IBM Plex Sans', system-ui, sans-serif" },
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', confine: window.innerWidth <= 767 },
  series: [{
    type: 'pie',
    radius: ['45%', '72%'],
    avoidLabelOverlap: false,
    label: { show: false },
    emphasis: { label: { show: false } },
    data: nonZeroBuckets.value.map(b => ({
      name:      b.label,
      value:     b.value,
      itemStyle: { color: b.color, borderWidth: 2, borderColor: surfaceColor.value },
    })),
  }],
}))
</script>

<style scoped>
.donut-wrap {
  background: var(--col-surface);
  border: 1px solid var(--col-border-lt);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1rem 1rem;
  display: flex;
  flex-direction: column;
}

.chart-title {
  font-size: .9375rem;
  font-weight: 600;
  color: var(--col-text);
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
  border-radius: 2px;
  flex-shrink: 0;
}

.donut-legend-label { flex: 1; color: var(--col-text); }
.donut-legend-count { font-weight: 600; color: var(--col-text); font-variant-numeric: tabular-nums; }
</style>
