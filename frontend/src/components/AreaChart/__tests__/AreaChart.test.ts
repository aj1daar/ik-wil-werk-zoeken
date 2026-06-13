import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import type { Application } from '../../../api'

vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ LineChart: {} }))
vi.mock('echarts/components', () => ({ TooltipComponent: {}, GridComponent: {} }))
vi.mock('vue-echarts', () => ({
  default: defineComponent({
    name: 'VChart',
    props: ['option', 'autoresize'],
    template: '<div class="mock-chart" />',
  }),
}))

import AreaChart from '../AreaChart.vue'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1', userId: 'u1', companyName: 'Acme', position: 'Engineer',
    appliedAt: '2026-01-05T00:00:00Z', status: 'Applied', locations: [],
    updatedAt: '2026-01-05T00:00:00Z', ...overrides,
  }
}

function mountArea(applications: Application[] = [], extra: Record<string, string | undefined> = {}) {
  return mount(AreaChart, { props: { applications, ...extra } })
}

function getOption(w: VueWrapper<any>) {
  return w.findComponent({ name: 'VChart' }).props('option') as any
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('AreaChart – rendering', () => {
  it('renders without throwing', () => {
    expect(() => mountArea()).not.toThrow()
  })

  it('renders the "Applications over time" title', () => {
    expect(mountArea([makeApp()]).find('.chart-title').text()).toBe('Applications over time')
  })

  it('shows empty state when no applications', () => {
    const w = mountArea([])
    expect(w.find('.chart-empty').exists()).toBe(true)
    expect(w.find('.mock-chart').exists()).toBe(false)
  })

  it('shows chart when applications are provided', () => {
    const w = mountArea([makeApp()])
    expect(w.find('.mock-chart').exists()).toBe(true)
    expect(w.find('.chart-empty').exists()).toBe(false)
  })
})

// ── week grouping ─────────────────────────────────────────────────────────────

describe('AreaChart – week grouping', () => {
  it('groups two apps in the same week into one data point', () => {
    const apps = [
      makeApp({ id: 'a1', appliedAt: '2026-01-05T00:00:00Z' }), // Mon week 2
      makeApp({ id: 'a2', appliedAt: '2026-01-07T00:00:00Z' }), // Wed same week
    ]
    const data = getOption(mountArea(apps)).series[0].data
    expect(data).toHaveLength(1)
    expect(data[0]).toBe(2)
  })

  it('puts apps in different weeks into separate data points', () => {
    const apps = [
      makeApp({ id: 'a1', appliedAt: '2026-01-05T00:00:00Z' }), // week 2
      makeApp({ id: 'a2', appliedAt: '2026-01-12T00:00:00Z' }), // week 3
    ]
    const data = getOption(mountArea(apps)).series[0].data
    expect(data).toHaveLength(2)
    expect(data[0]).toBe(1)
    expect(data[1]).toBe(1)
  })

  it('fills gap weeks with 0', () => {
    const apps = [
      makeApp({ id: 'a1', appliedAt: '2026-01-05T00:00:00Z' }), // week 2
      makeApp({ id: 'a2', appliedAt: '2026-01-19T00:00:00Z' }), // week 4 (gap in week 3)
    ]
    const data = getOption(mountArea(apps)).series[0].data
    expect(data).toHaveLength(3)
    expect(data[0]).toBe(1)
    expect(data[1]).toBe(0) // gap
    expect(data[2]).toBe(1)
  })

  it('x-axis categories are ISO week strings', () => {
    const w = mountArea([makeApp({ appliedAt: '2026-01-05T00:00:00Z' })])
    const xData = getOption(w).xAxis.data as string[]
    expect(xData[0]).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('x-axis week count matches series data count', () => {
    const apps = [
      makeApp({ id: 'a1', appliedAt: '2026-01-05T00:00:00Z' }),
      makeApp({ id: 'a2', appliedAt: '2026-01-19T00:00:00Z' }),
    ]
    const opt = getOption(mountArea(apps))
    expect(opt.xAxis.data.length).toBe(opt.series[0].data.length)
  })

  it('counts multiple apps in the same week correctly', () => {
    const apps = Array.from({ length: 5 }, (_, i) =>
      makeApp({ id: `a${i}`, appliedAt: '2026-02-02T00:00:00Z' }) // all in week 6
    )
    const data = getOption(mountArea(apps)).series[0].data
    expect(data).toHaveLength(1)
    expect(data[0]).toBe(5)
  })
})

// ── date range filtering ──────────────────────────────────────────────────────

describe('AreaChart – date range filtering', () => {
  it('excludes applications before the from date', () => {
    const apps = [
      makeApp({ id: 'a1', appliedAt: '2025-12-01T00:00:00Z' }),
      makeApp({ id: 'a2', appliedAt: '2026-01-05T00:00:00Z' }),
    ]
    const w = mountArea(apps, { from: '2026-01-01T00:00:00Z' })
    const data = getOption(w).series[0].data
    expect(data).toHaveLength(1)
    expect(data[0]).toBe(1)
  })

  it('excludes applications after the to date', () => {
    const apps = [
      makeApp({ id: 'a1', appliedAt: '2026-01-05T00:00:00Z' }),
      makeApp({ id: 'a2', appliedAt: '2026-03-01T00:00:00Z' }),
    ]
    const w = mountArea(apps, { to: '2026-01-31T00:00:00Z' })
    const data = getOption(w).series[0].data
    expect(data).toHaveLength(1)
    expect(data[0]).toBe(1)
  })

  it('shows empty state when all apps are outside the date range', () => {
    const apps = [makeApp({ appliedAt: '2024-01-01T00:00:00Z' })]
    const w = mountArea(apps, { from: '2026-01-01T00:00:00Z' })
    expect(w.find('.chart-empty').exists()).toBe(true)
  })

  it('includes all apps when no from/to specified', () => {
    const apps = [
      makeApp({ id: 'a1', appliedAt: '2024-06-01T00:00:00Z' }),
      makeApp({ id: 'a2', appliedAt: '2026-03-01T00:00:00Z' }),
    ]
    const data = getOption(mountArea(apps)).series[0].data
    const total = (data as number[]).reduce((s, v) => s + v, 0)
    expect(total).toBe(2)
  })
})

// ── chart option ──────────────────────────────────────────────────────────────

describe('AreaChart – chart option', () => {
  it('series type is "line"', () => {
    expect(getOption(mountArea([makeApp()])).series[0].type).toBe('line')
  })

  it('series has areaStyle defined', () => {
    expect(getOption(mountArea([makeApp()])).series[0].areaStyle).toBeDefined()
  })

  it('xAxis type is "category"', () => {
    expect(getOption(mountArea([makeApp()])).xAxis.type).toBe('category')
  })

  it('yAxis minInterval is 1 (no fractional application counts)', () => {
    expect(getOption(mountArea([makeApp()])).yAxis.minInterval).toBe(1)
  })

  it('has tooltip', () => {
    expect(getOption(mountArea([makeApp()])).tooltip).toBeTruthy()
  })
})

// ── reactivity ────────────────────────────────────────────────────────────────

describe('AreaChart – reactivity', () => {
  it('updates when applications prop changes', async () => {
    const w = mountArea([makeApp({ id: 'a1', appliedAt: '2026-01-05T00:00:00Z' })])
    expect(getOption(w).series[0].data[0]).toBe(1)

    await w.setProps({
      applications: [
        makeApp({ id: 'a1', appliedAt: '2026-01-05T00:00:00Z' }),
        makeApp({ id: 'a2', appliedAt: '2026-01-05T00:00:00Z' }),
      ],
    })
    expect(getOption(w).series[0].data[0]).toBe(2)
  })

  it('switches to empty state when applications prop becomes empty', async () => {
    const w = mountArea([makeApp()])
    expect(w.find('.mock-chart').exists()).toBe(true)
    await w.setProps({ applications: [] })
    expect(w.find('.chart-empty').exists()).toBe(true)
  })
})
