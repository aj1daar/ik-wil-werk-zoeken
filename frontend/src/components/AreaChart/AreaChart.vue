<template>
  <div class="area-wrap">
    <h3 class="chart-title">Applications over time</h3>
    <div v-if="isEmpty" class="chart-empty">No applications to display.</div>
    <v-chart v-else class="area-chart" :option="option" autoresize />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import type { Application } from '../../api'

use([CanvasRenderer, LineChart, TooltipComponent, GridComponent])

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

  const result: { week: string; count: number }[] = []
  const cur = new Date(start)
  while (cur <= end) {
    const key = isoWeekKey(cur)
    result.push({ week: key, count: counts.get(key) ?? 0 })
    cur.setDate(cur.getDate() + 7)
  }
  return result
})

const isEmpty = computed(() => weeksData.value.length === 0)

const option = computed(() => ({
  tooltip: { trigger: 'axis', formatter: (p: any[]) => `${p[0].axisValue}: ${p[0].value}` },
  grid: { left: '3%', right: '3%', bottom: '3%', top: '8%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: weeksData.value.map(w => w.week),
    axisLabel: { rotate: 35, fontSize: 11 },
  },
  yAxis: { type: 'value', minInterval: 1 },
  series: [{
    type: 'line',
    data: weeksData.value.map(w => w.count),
    smooth: true,
    areaStyle: { opacity: 0.25 },
    color: '#f97316',
    symbol: 'circle',
    symbolSize: 5,
  }],
}))
</script>

<style scoped>
.area-wrap {
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: .75rem;
  padding: 1.25rem 1rem 1rem;
  box-shadow:
    0 1px 3px  color-mix(in srgb, var(--col-text) 6%, transparent),
    0 4px 16px color-mix(in srgb, var(--col-text) 9%, transparent);
}

.chart-title {
  font-size: .8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--col-muted);
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
