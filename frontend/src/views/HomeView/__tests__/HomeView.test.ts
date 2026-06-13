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

  it('renders all seven range buttons', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    const buttons = w.findAll('button.range-btn')
    expect(buttons).toHaveLength(7)
    const labels = buttons.map(b => b.text())
    expect(labels).toContain('Overall')
    expect(labels).toContain('Last week')
    expect(labels).toContain('Last month')
    expect(labels).toContain('Last 3 months')
    expect(labels).toContain('Last 6 months')
    expect(labels).toContain('Last year')
    expect(labels).toContain('Custom')
  })

  it('"Overall" button is active by default', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    const overallBtn = w.findAll('button.range-btn').find(b => b.text() === 'Overall')
    expect(overallBtn?.classes()).toContain('range-btn--active')
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

  it('clicking "Custom" shows the date inputs', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()

    const customBtn = w.findAll('button.range-btn').find(b => b.text() === 'Custom')
    await customBtn!.trigger('click')
    expect(w.find('.custom-range').exists()).toBe(true)
    expect(w.findAll('input[type="date"]')).toHaveLength(2)
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

  it('"Overall" button passes no date params to getStats', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const w = mountHome()
    await flushPromises()
    vi.mocked(api.getStats).mockClear()

    // Re-click Overall to trigger watch
    const overallBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await overallBtn!.trigger('click')
    await flushPromises()
    vi.mocked(api.getStats).mockClear()

    const overall = w.findAll('button.range-btn').find(b => b.text() === 'Overall')
    await overall!.trigger('click')
    await flushPromises()

    const [from, to] = vi.mocked(api.getStats).mock.calls[0]
    expect(from).toBeUndefined()
    expect(to).toBeUndefined()
  })
})

// ── stats display ─────────────────────────────────────────────────────────────

describe('HomeView – stats display', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows total count from stats', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(17, {}))
    const w = mountHome()
    await flushPromises()
    expect(w.find('.total-number').text()).toBe('17')
  })

  it('shows a stat card for each of the 7 statuses', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(0, {}))
    const w = mountHome()
    await flushPromises()
    expect(w.findAll('.stat-card')).toHaveLength(7)
  })

  it('shows 0 for statuses with no count', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(3, { Applied: 3 }))
    const w = mountHome()
    await flushPromises()
    const cards = w.findAll('.stat-card')
    const rejectedCard = cards.find(c => c.text().includes('Rejected'))
    expect(rejectedCard?.find('.stat-count').text()).toBe('0')
  })

  it('shows correct count for a status', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(5, { Applied: 5 }))
    const w = mountHome()
    await flushPromises()
    const cards = w.findAll('.stat-card')
    const appliedCard = cards.find(c => c.text().includes('Applied'))
    expect(appliedCard?.find('.stat-count').text()).toBe('5')
  })

  it('calls getStats once on mount', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    mountHome()
    await flushPromises()
    expect(api.getStats).toHaveBeenCalledTimes(1)
  })
})

// ── KPI strip ─────────────────────────────────────────────────────────────────

describe('HomeView – KPI strip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 4 kpi-cards when stats are loaded', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(10, { Applied: 10 }))
    const w = mountHome()
    await flushPromises()
    expect(w.findAll('.kpi-card')).toHaveLength(4)
  })

  it('shows total applied count in the first kpi-card', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(42, {}))
    const w = mountHome()
    await flushPromises()
    expect(w.find('.total-number').text()).toBe('42')
  })

  it('shows response rate as 0% when no applications have progressed', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(10, { Applied: 10 }))
    const w = mountHome()
    await flushPromises()
    const cards = w.findAll('.kpi-card')
    expect(cards[1].find('.kpi-value').text()).toBe('0%')
  })

  it('calculates response rate correctly', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(10, {
      Applied: 6,
      InterviewScheduled: 2,
      OfferReceived: 1,
      Accepted: 1,
    }))
    const w = mountHome()
    await flushPromises()
    // (2+1+1)/10 = 40%
    const cards = w.findAll('.kpi-card')
    expect(cards[1].find('.kpi-value').text()).toBe('40%')
  })

  it('shows offer rate correctly', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(20, {
      Applied: 15,
      InterviewScheduled: 3,
      OfferReceived: 1,
      Accepted: 1,
    }))
    const w = mountHome()
    await flushPromises()
    // (1+1)/20 = 10%
    const cards = w.findAll('.kpi-card')
    expect(cards[2].find('.kpi-value').text()).toBe('10%')
  })

  it('shows — for response rate when total is 0', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(0, {}))
    const w = mountHome()
    await flushPromises()
    const cards = w.findAll('.kpi-card')
    expect(cards[1].find('.kpi-value').text()).toBe('—')
  })

  it('shows — for offer rate when total is 0', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(0, {}))
    const w = mountHome()
    await flushPromises()
    const cards = w.findAll('.kpi-card')
    expect(cards[2].find('.kpi-value').text()).toBe('—')
  })

  it('shows — for avg days when no responded applications exist', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(5, { Applied: 5 }))
    const w = mountHome([makeApp({ status: 'Applied' })])
    await flushPromises()
    const cards = w.findAll('.kpi-card')
    expect(cards[3].find('.kpi-value').text()).toBe('—')
  })

  it('calculates avg days to response from application data', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(2, { InterviewScheduled: 2 }))
    // 10 days apart for each
    const app1 = makeApp({
      id: 'a1', status: 'InterviewScheduled',
      appliedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-11T00:00:00Z',
    })
    const app2 = makeApp({
      id: 'a2', status: 'InterviewScheduled',
      appliedAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-21T00:00:00Z',
    })
    const w = mountHome([app1, app2])
    await flushPromises()
    // avg = (10 + 20) / 2 = 15 d
    const cards = w.findAll('.kpi-card')
    expect(cards[3].find('.kpi-value').text()).toBe('15 d')
  })

  it('includes Accepted applications in avg days calculation', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(1, { Accepted: 1 }))
    const app = makeApp({
      status: 'Accepted',
      appliedAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-31T00:00:00Z',
    })
    const w = mountHome([app])
    await flushPromises()
    const cards = w.findAll('.kpi-card')
    expect(cards[3].find('.kpi-value').text()).toBe('30 d')
  })

  it('kpi-strip is not rendered while stats are loading', async () => {
    vi.mocked(api.getStats).mockImplementation(() => new Promise(() => {}))
    const w = mountHome()
    await flushPromises()
    expect(w.find('.kpi-strip').exists()).toBe(false)
    expect(w.find('.state-msg').text()).toBe('Loading…')
  })

  it('kpi labels are present', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats(1, { Applied: 1 }))
    const w = mountHome()
    await flushPromises()
    const text = w.find('.kpi-strip').text()
    expect(text).toContain('Total applied')
    expect(text).toContain('Response rate')
    expect(text).toContain('Offer rate')
    expect(text).toContain('Avg. days to response')
  })
})
