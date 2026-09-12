<template>
  <div class="area-wrap">
    <h3 class="chart-title">Applications per week</h3>
    <div v-if="isEmpty" class="chart-empty">No applications to display.</div>
    <template v-else>
      <v-chart class="area-chart" :option="option" autoresize aria-hidden="true" />
      <!-- The canvas has no text of its own; this carries the same facts -->
      <p class="sr-only">{{ summary }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import type { Application } from '../../api'
import { useTheme } from '../../composables/useTheme'

use([CanvasRenderer, BarChart, TooltipComponent, GridComponent])

const { theme } = useTheme()

// ECharts paints to canvas and can't read CSS custom properties, so these
// mirror the style.css tokens: route blue for the one series, recessive
// hairline grid and muted axis labels.
const CHART_INK = {
  light: { bar: '#1F4FA3', label: '#6F7A89', grid: '#DDE2E7', axis: '#CBD2D9' },
  dark:  { bar: '#7FA6F0', label: '#8590A0', grid: '#2A3341', axis: '#364152' },
} as const

const props = defineProps<{
  applications: Application[]
  from?: string
  to?: string
}>()

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const y = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(y, 0, 1))
  const w = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}

function monday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

const weeksData = computed(() => {
  const filtered = props.applications.filter(a => {
    const t = new Date(a.appliedAt).getTime()
    if (props.from && t < new Date(props.from).getTime()) return false
    if (props.to   && t > new Date(props.to).getTime())   return false
    return true
  })
  if (filtered.length === 0) return []

  const timestamps = filtered.map(a => new Date(a.appliedAt).getTime())
  const start = monday(new Date(Math.min(...timestamps)))
  const end   = monday(new Date(Math.max(...timestamps)))

  const counts = new Map<string, number>()
  for (const a of filtered) {
    const key = isoWeekKey(new Date(a.appliedAt))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const result: { week: string; start: Date; count: number }[] = []
  const cur = new Date(start)
  while (cur <= end) {
    const key = isoWeekKey(cur)
    result.push({ week: key, start: new Date(cur), count: counts.get(key) ?? 0 })
    cur.setDate(cur.getDate() + 7)
  }
  return result
})

const isEmpty = computed(() => weeksData.value.length === 0)

// Weeks are labelled by their Monday ("12 May") rather than an ISO week code
// nobody reads. The year only appears when the range crosses New Year.
const weekLabels = computed(() => {
  const weeks = weeksData.value
  const spansYears = weeks.length > 0 && weeks[0].start.getFullYear() !== weeks[weeks.length - 1].start.getFullYear()
  const fmt: Intl.DateTimeFormatOptions = spansYears
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' }
  return weeks.map(w => w.start.toLocaleDateString(undefined, fmt))
})

const plural = (n: number) => `${n} application${n === 1 ? '' : 's'}`

const summary = computed(() => {
  const weeks = weeksData.value
  const total = weeks.reduce((s, w) => s + w.count, 0)
  const busiest = weeks.reduce((best, w, i) => (w.count > weeks[best].count ? i : best), 0)
  return `${plural(total)} over ${weeks.length} week${weeks.length === 1 ? '' : 's'}. ` +
    `Busiest week: ${weekLabels.value[busiest]}, with ${plural(weeks[busiest].count)}.`
})

// Bars, not a smoothed line: a count per week is a discrete number, and a
// spline invented values between weeks that never happened.
const option = computed(() => {
  const ink = CHART_INK[theme.value === 'dark' ? 'dark' : 'light']
  return {
    textStyle: { fontFamily: "'IBM Plex Sans', system-ui, sans-serif" },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: any[]) => `Week of ${p[0].axisValue}: ${plural(p[0].value)}`,
    },
    grid: { left: '3%', right: '3%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: weekLabels.value,
      axisLabel: { fontSize: 11, color: ink.label, hideOverlap: true },
      axisLine: { lineStyle: { color: ink.axis } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { fontSize: 11, color: ink.label },
      splitLine: { lineStyle: { color: ink.grid } },
    },
    series: [{
      type: 'bar',
      data: weeksData.value.map(w => w.count),
      color: ink.bar,
      barMaxWidth: 24,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
    }],
  }
})
</script>

<style scoped>
.area-wrap {
  background: var(--col-surface);
  border: 1px solid var(--col-border-lt);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1rem 1rem;
}

.chart-title {
  font-size: .9375rem;
  font-weight: 600;
  color: var(--col-text);
  margin: 0 0 .75rem;
}

.area-chart { height: 260px; width: 100%; }

.chart-empty {
  height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--col-subtle);
  font-size: .875rem;
}
</style>
