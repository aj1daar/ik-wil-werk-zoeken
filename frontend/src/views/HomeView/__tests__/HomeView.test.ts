import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomeView from '../HomeView.vue'

vi.mock('../../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStatusFlow:     vi.fn(),
  }
}))

import { api } from '../../../api'
import type { Application } from '../../../api'

function makeFlow() {
  return { nodes: [], edges: [] }
}

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: crypto.randomUUID(), userId: 'u1', companyName: 'Acme', position: 'Engineer',
    appliedAt: '2026-01-15T00:00:00Z', status: 'Applied', locations: [],
    updatedAt: '2026-01-15T00:00:00Z', ...overrides,
  }
}

// Follow-up dates are stored as a calendar day at midnight UTC — build one
// for "n days from the local today" the same way the API would send it.
function isoDaysFromToday(n: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + n)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}T00:00:00Z`
}

function mountHome(apps: Application[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(api.getApplications).mockResolvedValue(apps)
  return mount(HomeView, {
    global: {
      plugins: [pinia],
      stubs: { StatusTree: true, RejectionChart: true, AreaChart: true, RouterLink: RouterLinkStub },
    },
  })
}

async function mountBoard(apps: Application[]) {
  vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
  const w = mountHome(apps)
  await flushPromises()
  return w
}

function boardCompanies(w: ReturnType<typeof mountHome>) {
  return w.findAll('.board-row .board-company').map(c => c.text())
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('HomeView – rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the Next up board heading as the page h1', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()
    expect(w.findAll('h1')).toHaveLength(1)
    expect(w.find('h1').text()).toBe('Next up')
  })

  it('renders all six range buttons', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
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
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()
    const lastYearBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last year')
    expect(lastYearBtn?.classes()).toContain('range-btn--active')
  })

  it('exposes the active range to assistive tech with aria-pressed', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()
    const pressed = w.findAll('button.range-btn').filter(b => b.attributes('aria-pressed') === 'true')
    expect(pressed.map(b => b.text())).toEqual(['Last year'])
  })

  it('custom date inputs are hidden until Custom is selected', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()
    expect(w.find('.custom-range').exists()).toBe(false)
  })
})

// ── range selection ───────────────────────────────────────────────────────────

describe('HomeView – range selection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clicking a range button makes it active', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()

    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    expect(threeMonthBtn?.classes()).toContain('range-btn--active')
    expect(threeMonthBtn?.attributes('aria-pressed')).toBe('true')
  })

  it('clicking "Custom" shows the Overall checkbox and date pickers', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()

    const customBtn = w.findAll('button.range-btn').find(b => b.text() === 'Custom')
    await customBtn!.trigger('click')
    expect(w.find('.custom-range').exists()).toBe(true)
    expect(w.find('.custom-overall-cb').exists()).toBe(true)
    expect(w.findAll('.dp-trigger')).toHaveLength(2)
  })

  it('checking Overall in Custom hides date pickers and calls getStats with no params', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()

    const customBtn = w.findAll('button.range-btn').find(b => b.text() === 'Custom')
    await customBtn!.trigger('click')
    vi.mocked(api.getStatusFlow).mockClear()

    await w.find('.custom-overall-cb').setValue(true)
    await flushPromises()

    expect(w.findAll('.dp-trigger')).toHaveLength(0)
    const [from, to] = vi.mocked(api.getStatusFlow).mock.calls[0]
    expect(from).toBeUndefined()
    expect(to).toBeUndefined()
  })

  it('clicking a range button calls api.getStatusFlow again', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()
    const callsAfterMount = vi.mocked(api.getStatusFlow).mock.calls.length

    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    await flushPromises()

    expect(vi.mocked(api.getStatusFlow).mock.calls.length).toBeGreaterThan(callsAfterMount)
  })

  it('3m button passes from/to to getStats', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()
    vi.mocked(api.getStatusFlow).mockClear()

    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    await flushPromises()

    const [from, to] = vi.mocked(api.getStatusFlow).mock.calls[0]
    expect(from).toBeTruthy()
    expect(to).toBeTruthy()
  })

  it('"Last year" button passes from/to to getStats', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    const w = mountHome()
    await flushPromises()
    vi.mocked(api.getStatusFlow).mockClear()

    // Switch away then back to Last year to trigger watch
    const threeMonthBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last 3 months')
    await threeMonthBtn!.trigger('click')
    await flushPromises()
    vi.mocked(api.getStatusFlow).mockClear()

    const lastYearBtn = w.findAll('button.range-btn').find(b => b.text() === 'Last year')
    await lastYearBtn!.trigger('click')
    await flushPromises()

    const [from, to] = vi.mocked(api.getStatusFlow).mock.calls[0]
    expect(from).toBeTruthy()
    expect(to).toBeTruthy()
  })
})

// ── stats display ─────────────────────────────────────────────────────────────

describe('HomeView – stats display', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls getStats once on mount', async () => {
    vi.mocked(api.getStatusFlow).mockResolvedValue(makeFlow())
    mountHome()
    await flushPromises()
    expect(api.getStatusFlow).toHaveBeenCalledTimes(1)
  })
})

// ── Next up board ─────────────────────────────────────────────────────────────

describe('HomeView – Next up board', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists overdue, due-today and upcoming follow-ups soonest first', async () => {
    const w = await mountBoard([
      makeApp({ companyName: 'Later',   followUpDate: isoDaysFromToday(5) }),
      makeApp({ companyName: 'Late',    followUpDate: isoDaysFromToday(-3) }),
      makeApp({ companyName: 'TodayCo', followUpDate: isoDaysFromToday(0) }),
    ])
    expect(boardCompanies(w)).toEqual(['Late', 'TodayCo', 'Later'])
  })

  it('shows the position next to the company', async () => {
    const w = await mountBoard([makeApp({ companyName: 'Acme', position: 'Data Engineer', followUpDate: isoDaysFromToday(1) })])
    expect(w.find('.board-row .board-position').text()).toBe('Data Engineer')
  })

  it.each([
    [-10, '10 days late'],
    [-2,  '2 days late'],
    [-1,  '1 day late'],
    [0,   'Due today'],
    [1,   'Due tomorrow'],
    [2,   'In 2 days'],
    [14,  'In 14 days'],
  ])('labels a follow-up %i days from today as "%s"', async (days, label) => {
    const w = await mountBoard([makeApp({ followUpDate: isoDaysFromToday(days) })])
    expect(w.find('.board-row .board-when').text()).toBe(label)
  })

  it('marks late rows and the due-today row so they stand out', async () => {
    const w = await mountBoard([
      makeApp({ companyName: 'A', followUpDate: isoDaysFromToday(-1) }),
      makeApp({ companyName: 'B', followUpDate: isoDaysFromToday(0) }),
      makeApp({ companyName: 'C', followUpDate: isoDaysFromToday(3) }),
    ])
    const rows = w.findAll('.board-row')
    expect(rows[0].classes()).toContain('board-row--late')
    expect(rows[1].classes()).toContain('board-row--today')
    expect(rows[2].classes()).not.toContain('board-row--late')
    expect(rows[2].classes()).not.toContain('board-row--today')
  })

  it.each(['Rejected', 'Withdrawn', 'Accepted', 'Ghosted'] as const)(
    'leaves out %s applications even when their follow-up is overdue', async (status) => {
      const w = await mountBoard([makeApp({ status, followUpDate: isoDaysFromToday(-2) })])
      expect(w.findAll('.board-row')).toHaveLength(0)
    },
  )

  it.each(['Applied', 'InterviewScheduled', 'Assessment', 'OfferReceived', 'OnHold'] as const)(
    'keeps %s applications on the board', async (status) => {
      const w = await mountBoard([makeApp({ status, followUpDate: isoDaysFromToday(1) })])
      expect(w.findAll('.board-row')).toHaveLength(1)
    },
  )

  it('leaves out applications with no follow-up date', async () => {
    const w = await mountBoard([makeApp({ followUpDate: undefined })])
    expect(w.findAll('.board-row')).toHaveLength(0)
  })

  it.each(['', 'not-a-date', '2026-13-45T00:00:00Z', 'tomorrow'])(
    'ignores a malformed follow-up date (%j) instead of crashing', async (bad) => {
      const w = await mountBoard([
        makeApp({ companyName: 'Broken', followUpDate: bad }),
        makeApp({ companyName: 'Fine',   followUpDate: isoDaysFromToday(1) }),
      ])
      expect(boardCompanies(w)).toEqual(['Fine'])
    },
  )

  it('includes a follow-up exactly two weeks out but not one a day later', async () => {
    const w = await mountBoard([
      makeApp({ companyName: 'Edge', followUpDate: isoDaysFromToday(14) }),
      makeApp({ companyName: 'Past', followUpDate: isoDaysFromToday(15) }),
    ])
    expect(boardCompanies(w)).toEqual(['Edge'])
  })

  it('keeps very old overdue follow-ups on the board', async () => {
    const w = await mountBoard([makeApp({ followUpDate: '2020-01-01T00:00:00Z' })])
    expect(w.findAll('.board-row')).toHaveLength(1)
    expect(w.find('.board-when').text()).toMatch(/days late$/)
  })

  it('sorts follow-ups due the same day by company name', async () => {
    const w = await mountBoard([
      makeApp({ companyName: 'Zeta',  followUpDate: isoDaysFromToday(2) }),
      makeApp({ companyName: 'alpha', followUpDate: isoDaysFromToday(2) }),
      makeApp({ companyName: 'Mid',   followUpDate: isoDaysFromToday(2) }),
    ])
    expect(boardCompanies(w)).toEqual(['alpha', 'Mid', 'Zeta'])
  })

  it('shows at most six rows and says how many more are waiting', async () => {
    const apps = Array.from({ length: 9 }, (_, i) =>
      makeApp({ companyName: `Co ${i}`, followUpDate: isoDaysFromToday(i - 4) }))
    const w = await mountBoard(apps)
    expect(w.findAll('.board-row')).toHaveLength(6)
    expect(w.find('.board-more').text()).toBe('3 more not shown')
    // the six shown are the six soonest
    expect(boardCompanies(w)).toEqual(['Co 0', 'Co 1', 'Co 2', 'Co 3', 'Co 4', 'Co 5'])
  })

  it('does not show a "more" note when everything fits', async () => {
    const w = await mountBoard([makeApp({ followUpDate: isoDaysFromToday(1) })])
    expect(w.find('.board-more').exists()).toBe(false)
  })

  it('summarises overdue and upcoming counts', async () => {
    const w = await mountBoard([
      makeApp({ followUpDate: isoDaysFromToday(-5) }),
      makeApp({ followUpDate: isoDaysFromToday(-1) }),
      makeApp({ followUpDate: isoDaysFromToday(0) }),
    ])
    expect(w.find('.board-summary').text()).toBe('2 overdue, 1 coming up')
  })

  it('summary mentions only the part that applies', async () => {
    const overdueOnly = await mountBoard([makeApp({ followUpDate: isoDaysFromToday(-1) })])
    expect(overdueOnly.find('.board-summary').text()).toBe('1 overdue')

    const upcomingOnly = await mountBoard([makeApp({ followUpDate: isoDaysFromToday(3) })])
    expect(upcomingOnly.find('.board-summary').text()).toBe('1 coming up')
  })

  it('counts every due follow-up in the summary, including ones past the six-row cap', async () => {
    const apps = Array.from({ length: 8 }, (_, i) => makeApp({ followUpDate: isoDaysFromToday(-(i + 1)) }))
    const w = await mountBoard(apps)
    expect(w.find('.board-summary').text()).toBe('8 overdue')
  })

  it('has no summary line when nothing is due', async () => {
    const w = await mountBoard([makeApp({ followUpDate: isoDaysFromToday(30) })])
    expect(w.find('.board-summary').exists()).toBe(false)
  })

  it('with no applications at all, explains the board and links to add one', async () => {
    const w = await mountBoard([])
    expect(w.find('.board-empty').text()).toContain('Add your first application')
    const link = w.findComponent(RouterLinkStub)
    expect(link.props('to')).toBe('/applications')
    expect(link.text()).toBe('Add an application')
  })

  it('with applications but nothing due, says so and links to the list', async () => {
    const w = await mountBoard([makeApp({ followUpDate: isoDaysFromToday(30) }), makeApp({ followUpDate: undefined })])
    expect(w.findAll('.board-row')).toHaveLength(0)
    expect(w.find('.board-empty').text()).toContain('Nothing to chase in the next two weeks')
    const link = w.findComponent(RouterLinkStub)
    expect(link.props('to')).toBe('/applications')
    expect(link.text()).toBe('Open my applications')
  })

  it('renders company and position names as text, never as HTML', async () => {
    const w = await mountBoard([makeApp({
      companyName: '<img src=x onerror="alert(1)">',
      position: '<script>alert(2)</script>',
      followUpDate: isoDaysFromToday(0),
    })])
    expect(w.find('.board-row img').exists()).toBe(false)
    expect(w.find('.board-row script').exists()).toBe(false)
    expect(w.find('.board-company').text()).toBe('<img src=x onerror="alert(1)">')
  })

  it('updates when an application is closed after the board has rendered', async () => {
    const app = makeApp({ companyName: 'Closing', followUpDate: isoDaysFromToday(-1) })
    const w = await mountBoard([app])
    expect(w.findAll('.board-row')).toHaveLength(1)

    const { useApplicationsStore } = await import('../../../stores/applications')
    const store = useApplicationsStore()
    store.applications = [{ ...store.applications[0], status: 'Rejected' }]
    await flushPromises()
    expect(w.findAll('.board-row')).toHaveLength(0)
  })
})

// ── onboarding banner ─────────────────────────────────────────────────────────

describe('HomeView – onboarding banner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage?.removeItem('iwwz_onboarded')
  })

  it('does not shout the app name in capitals', async () => {
    const w = await mountBoard([])
    const banner = w.find('.onboarding-banner')
    if (banner.exists()) expect(banner.text()).not.toContain('IK WIL WERK ZOEKEN')
  })
})
