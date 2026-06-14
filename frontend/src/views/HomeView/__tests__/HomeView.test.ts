import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomeView from '../HomeView.vue'

vi.mock('../../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStats:          vi.fn(),
  }
}))

import { api } from '../../../api'
import type { Application } from '../../../api'

function makeStats(total = 0, byStatus: Record<string, number> = {}) {
  return { total, byStatus }
}

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1', userId: 'u1', companyName: 'Acme', position: 'Engineer',
    appliedAt: '2026-01-01T00:00:00Z', status: 'Applied', locations: [],
    updatedAt: '2026-01-15T00:00:00Z', ...overrides,
  }
}

function mountHome(apps: Application[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(api.getApplications).mockResolvedValue(apps)
  return mount(HomeView, { global: { plugins: [pinia], stubs: { FunnelChart: true, DonutChart: true, AreaChart: true } } })
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('HomeView – rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the Dashboard heading', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    expect(w.find('h1').text()).toBe('Dashboard')
  })

  it('renders all six range buttons', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    const buttons = w.findAll('button.range-btn')
    expect(buttons).toHaveLength(6)
    const labels = buttons.map(b => b.text())
    expect(labels).toContain('Last week')
    expect(labels).toContain('Last month')
    expect(labels).toContain('Last 3 months')
    expect(labels).toContain('Last 6 months')
    expect(labels).toContain('Last year')
    expect(labels).toContain('Custom')
  })

  it('"Last year" button is active by default', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    const lastYearBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last year')
    expect(lastYearBtn?.classes()).toContain('range-btn--active')
  })

  it('custom date inputs are hidden until Custom is selected', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    expect(w.find('.custom-range').exists()).toBe(false)
  })
})

// ── range selection ───────────────────────────────────────────────────────────

describe('HomeView – range selection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clicking a range button makes it active', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()

    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    expect(threeMonthBtn?.classes()).toContain('range-btn--active')
  })

  it('clicking "Custom" shows the Overall checkbox and date pickers', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()

    const customBtn = w.findAll('button.range-btn').find(b => b.text() === 'Custom')
    await customBtn!.trigger('click')
    expect(w.find('.custom-range').exists()).toBe(true)
    expect(w.find('.custom-overall-cb').exists()).toBe(true)
    expect(w.findAll('.dp-trigger')).toHaveLength(2)
  })

  it('checking Overall in Custom hides date pickers and calls getStats with no params', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()

    const customBtn = w.findAll('button.range-btn').find(b => b.text() === 'Custom')
    await customBtn!.trigger('click')
    vi.mocked(api.getStats).mockClear()

    await w.find('.custom-overall-cb').setValue(true)
    await flushPromises()

    expect(w.findAll('.dp-trigger')).toHaveLength(0)
    const [from, to] = vi.mocked(api.getStats).mock.calls[0]
    expect(from).toBeUndefined()
    expect(to).toBeUndefined()
  })

  it('clicking a range button calls api.getStats again', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    const callsAfterMount = vi.mocked(api.getStats).mock.calls.length

    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    await flushPromises()

    expect(vi.mocked(api.getStats).mock.calls.length).toBeGreaterThan(callsAfterMount)
  })

  it('3m button passes from/to to getStats', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    vi.mocked(api.getStats).mockClear()

    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    await flushPromises()

    const [from, to] = vi.mocked(api.getStats).mock.calls[0]
    expect(from).toBeTruthy()
    expect(to).toBeTruthy()
  })

  it('"Last year" button passes from/to to getStats', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    vi.mocked(api.getStats).mockClear()

    // Switch away then back to Last year to trigger watch
    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    await flushPromises()
    vi.mocked(api.getStats).mockClear()

    const lastYearBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last year')
    await lastYearBtn!.trigger('click')
    await flushPromises()

    const [from, to] = vi.mocked(api.getStats).mock.calls[0]
    expect(from).toBeTruthy()
    expect(to).toBeTruthy()
  })
})

// ── stats display ─────────────────────────────────────────────────────────────

describe('HomeView – stats display', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls getStats once on mount', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    mountHome()
    await flushPromises()
    expect(api.getStats).toHaveBeenCalledTimes(1)
  })
})

