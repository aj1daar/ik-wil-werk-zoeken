import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { Transition } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CompaniesView from '../CompaniesView.vue'

vi.mock('../../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStats:          vi.fn(),
    getCompanies:      vi.fn(),
    adminUpdateCompanySummary: vi.fn(),
  },
}))

import { api } from '../../../api'
import type { SponsorCompany, Application } from '../../../api'

// Always return empty arrays so stores never set state to undefined
beforeEach(() => {
  vi.mocked(api.getApplications).mockResolvedValue([])
})

function makeSponsor(overrides: Partial<SponsorCompany> = {}): SponsorCompany {
  return {
    id: 'sp-1', name: 'Acme B.V.', kvKNumber: '12345678',
    lastVerifiedAt: '2026-01-01T00:00:00Z', ...overrides,
  }
}

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1', userId: 'u1', companyName: 'Acme B.V.', position: 'Engineer',
    appliedAt: '2026-01-01T00:00:00Z', status: 'Applied', locations: [],
    updatedAt: '2026-06-01T00:00:00Z', sponsorCompanyId: 'sp-1', ...overrides,
  }
}

function mountView(sponsors: SponsorCompany[] = [], apps: Application[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(api.getCompanies).mockResolvedValue(sponsors)
  vi.mocked(api.getApplications).mockResolvedValue(apps)
  return mount(CompaniesView, { global: { plugins: [pinia] } })
}

function modalTransitions(wrapper: ReturnType<typeof mount>) {
  return (wrapper.findAllComponents(Transition) as unknown as VueWrapper<any>[])
    .filter(t => t.props('name') === 'modal')
}

// ── modal transition wrapper ──────────────────────────────────────────────────

describe('CompaniesView – modal transition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a <Transition name="modal"> wrapping the new-application modal', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(modalTransitions(wrapper).length).toBeGreaterThanOrEqual(1)
  })

  it('NewApplicationModal is absent by default', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(false)
  })

  it('NewApplicationModal opens after selecting a company and clicking Start Application', async () => {
    const wrapper = mountView([makeSponsor()])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.footer-primary').trigger('click')
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(true)
  })

  it('prefill company name is passed to the modal', async () => {
    const wrapper = mountView([makeSponsor({ name: 'TechCorp' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.footer-primary').trigger('click')
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).props('prefillCompany')).toBe('TechCorp')
  })

  it('NewApplicationModal closes when it emits close', async () => {
    const wrapper = mountView([makeSponsor()])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.footer-primary').trigger('click')
    await wrapper.findComponent({ name: 'NewApplicationModal' }).vm.$emit('close')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'NewApplicationModal' }).exists()).toBe(false)
  })
})

// ── company list & selection ──────────────────────────────────────────────────

describe('CompaniesView – company list', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading state while fetching', async () => {
    vi.mocked(api.getCompanies).mockReturnValue(new Promise(() => {}))
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(CompaniesView, { global: { plugins: [pinia] } })
    await nextTick() // let onMounted fire and loading=true propagate to DOM
    expect(wrapper.text()).toContain('Loading')
  })

  it('renders company rows after load', async () => {
    const wrapper = mountView([makeSponsor({ name: 'Alpha B.V.' }), makeSponsor({ id: 'sp-2', name: 'Beta N.V.' })])
    await flushPromises()
    expect(wrapper.findAll('.company-row')).toHaveLength(2)
  })

  it('shows empty state when no companies are loaded', async () => {
    const wrapper = mountView([])
    await flushPromises()
    expect(wrapper.text()).toContain('No IND sponsor companies loaded yet')
  })

  it('selecting a row opens the detail panel', async () => {
    const wrapper = mountView([makeSponsor()])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.detail-panel').exists()).toBe(true)
  })

  it('clicking the same row again deselects the panel', async () => {
    const wrapper = mountView([makeSponsor()])
    await flushPromises()
    const row = wrapper.find('.company-row')
    await row.trigger('click')
    expect(wrapper.find('.detail-panel').exists()).toBe(true)
    await row.trigger('click')
    expect(wrapper.find('.detail-panel').exists()).toBe(false)
  })

  it('detail panel shows the company name', async () => {
    const wrapper = mountView([makeSponsor({ name: 'Bigcorp International' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.detail-panel').text()).toContain('Bigcorp International')
  })
})

// ── "Applied here" overlay ────────────────────────────────────────────────────

describe('CompaniesView – applied here overlay', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows status chip on company row when user has applied via sponsorCompanyId', async () => {
    const wrapper = mountView(
      [makeSponsor({ id: 'sp-1', name: 'Acme B.V.' })],
      [makeApp({ sponsorCompanyId: 'sp-1', status: 'Applied' })]
    )
    await flushPromises()
    expect(wrapper.find('.status-chip').exists()).toBe(true)
    expect(wrapper.find('.status-chip').text()).toContain('Applied')
  })

  it('does not show status chip when no application exists for a company', async () => {
    const wrapper = mountView(
      [makeSponsor({ id: 'sp-2', name: 'OtherCo' })],
      []
    )
    await flushPromises()
    expect(wrapper.find('.status-chip').exists()).toBe(false)
  })

  it('shows most recent application status when multiple apps exist for same company', async () => {
    const wrapper = mountView(
      [makeSponsor({ id: 'sp-1' })],
      [
        makeApp({ id: 'app-1', sponsorCompanyId: 'sp-1', status: 'Applied',   updatedAt: '2026-01-01T00:00:00Z' }),
        makeApp({ id: 'app-2', sponsorCompanyId: 'sp-1', status: 'Rejected',  updatedAt: '2026-06-10T00:00:00Z' }),
      ]
    )
    await flushPromises()
    expect(wrapper.find('.status-chip').text()).toContain('Rejected')
  })

  it('shows application info in detail panel when user has applied', async () => {
    const wrapper = mountView(
      [makeSponsor({ id: 'sp-1' })],
      [makeApp({ sponsorCompanyId: 'sp-1', status: 'InterviewScheduled', position: 'Senior Engineer' })]
    )
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.detail-panel').text()).toContain('Interviewing')
    expect(wrapper.find('.detail-panel').text()).toContain('Senior Engineer')
  })

  it('shows "Add Another Application" button when already applied', async () => {
    const wrapper = mountView(
      [makeSponsor({ id: 'sp-1' })],
      [makeApp({ sponsorCompanyId: 'sp-1' })]
    )
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.footer-primary').text()).toContain('Add Another Application')
  })

  it('shows "Start Application" button when not applied', async () => {
    const wrapper = mountView([makeSponsor({ id: 'sp-1' })], [])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.footer-primary').text()).toContain('Start Application')
  })

  it('shows status chip via name match when sponsorCompanyId is null', async () => {
    const wrapper = mountView(
      [makeSponsor({ id: 'sp-1', name: 'Acme B.V.' })],
      [makeApp({ sponsorCompanyId: undefined, companyName: 'Acme B.V.', status: 'Applied' })]
    )
    await flushPromises()
    expect(wrapper.find('.status-chip').exists()).toBe(true)
    expect(wrapper.find('.status-chip').text()).toContain('Applied')
  })

  it('name match is case-insensitive and trims whitespace', async () => {
    const wrapper = mountView(
      [makeSponsor({ id: 'sp-1', name: 'Acme B.V.' })],
      [makeApp({ sponsorCompanyId: undefined, companyName: '  acme b.v.  ', status: 'Rejected' })]
    )
    await flushPromises()
    expect(wrapper.find('.status-chip').exists()).toBe(true)
    expect(wrapper.find('.status-chip').text()).toContain('Rejected')
  })

  it('ID match takes priority over name match when both exist', async () => {
    const wrapper = mountView(
      [makeSponsor({ id: 'sp-1', name: 'Acme B.V.' })],
      [
        makeApp({ id: 'app-id',   sponsorCompanyId: 'sp-1',     companyName: 'Acme B.V.', status: 'Rejected',  updatedAt: '2026-01-01T00:00:00Z' }),
        makeApp({ id: 'app-name', sponsorCompanyId: undefined,   companyName: 'Acme B.V.', status: 'Applied',   updatedAt: '2026-06-10T00:00:00Z' }),
      ]
    )
    await flushPromises()
    // The ID-matched app wins regardless of date; name-only app should not override it
    expect(wrapper.find('.status-chip').text()).toContain('Rejected')
  })
})

// ── applied filter toggle ─────────────────────────────────────────────────────

describe('CompaniesView – applied filter toggle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the applied filter toggle with All / Applied / Not applied buttons', async () => {
    const wrapper = mountView()
    await flushPromises()
    const text = wrapper.find('.applied-toggle').text()
    expect(text).toContain('All')
    expect(text).toContain('Applied')
    expect(text).toContain('Not applied')
  })

  it('"All" is active by default', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.applied-toggle-btn--active').text()).toBe('All')
  })

  it('clicking "Applied" shows only companies with applications', async () => {
    const wrapper = mountView(
      [
        makeSponsor({ id: 'sp-1', name: 'Applied Co' }),
        makeSponsor({ id: 'sp-2', name: 'Not Applied Co' }),
      ],
      [makeApp({ sponsorCompanyId: 'sp-1' })]
    )
    await flushPromises()
    const buttons = wrapper.findAll('.applied-toggle-btn')
    await buttons[1].trigger('click') // "Applied"
    await nextTick()
    const rows = wrapper.findAll('.company-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Applied Co')
  })

  it('clicking "Not applied" shows only companies without applications', async () => {
    const wrapper = mountView(
      [
        makeSponsor({ id: 'sp-1', name: 'Applied Co' }),
        makeSponsor({ id: 'sp-2', name: 'Not Applied Co' }),
      ],
      [makeApp({ sponsorCompanyId: 'sp-1' })]
    )
    await flushPromises()
    const buttons = wrapper.findAll('.applied-toggle-btn')
    await buttons[2].trigger('click') // "Not applied"
    await nextTick()
    const rows = wrapper.findAll('.company-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Not Applied Co')
  })

  it('clearFilters resets applied filter to "all"', async () => {
    const wrapper = mountView(
      [makeSponsor({ id: 'sp-1' })],
      [makeApp({ sponsorCompanyId: 'sp-1' })]
    )
    await flushPromises()
    // Activate "Applied" filter
    await wrapper.findAll('.applied-toggle-btn')[1].trigger('click')
    await nextTick()
    expect(wrapper.find('.btn-clear-filters').exists()).toBe(true)
    await wrapper.find('.btn-clear-filters').trigger('click')
    await nextTick()
    expect(wrapper.find('.applied-toggle-btn--active').text()).toBe('All')
  })

  it('"Applied" filter shows company matched by name when sponsorCompanyId is null', async () => {
    const wrapper = mountView(
      [
        makeSponsor({ id: 'sp-1', name: 'Name Matched Co' }),
        makeSponsor({ id: 'sp-2', name: 'Unrelated Co' }),
      ],
      [makeApp({ sponsorCompanyId: undefined, companyName: 'Name Matched Co', status: 'Applied' })]
    )
    await flushPromises()
    await wrapper.findAll('.applied-toggle-btn')[1].trigger('click')
    await nextTick()
    const rows = wrapper.findAll('.company-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Name Matched Co')
  })

  it('applied filter toggle appears in clear-filters check', async () => {
    const wrapper = mountView()
    await flushPromises()
    // Before applying filter, no clear-filters button
    expect(wrapper.find('.btn-clear-filters').exists()).toBe(false)
    // After applying filter
    await wrapper.findAll('.applied-toggle-btn')[1].trigger('click')
    await nextTick()
    expect(wrapper.find('.btn-clear-filters').exists()).toBe(true)
  })
})

// ── parent company grouping ───────────────────────────────────────────────────

describe('CompaniesView – parent company grouping', () => {
  beforeEach(() => vi.clearAllMocks())

  it('two companies with the same parentCompanyName render as a single group header', async () => {
    const wrapper = mountView([
      makeSponsor({ id: 'sp-1', name: 'ABN AMRO Clearing Bank N.V.', parentCompanyName: 'ABN AMRO' }),
      makeSponsor({ id: 'sp-2', name: 'ABN AMRO Securities B.V.', parentCompanyName: 'ABN AMRO' }),
    ])
    await flushPromises()
    expect(wrapper.findAll('.group-header-row')).toHaveLength(1)
    expect(wrapper.find('.group-header-row').text()).toContain('ABN AMRO')
    expect(wrapper.find('.group-count-badge').text()).toContain('2')
  })

  it('subsidiaries are hidden until the group header is clicked', async () => {
    const wrapper = mountView([
      makeSponsor({ id: 'sp-1', name: 'ABN AMRO Clearing', parentCompanyName: 'ABN AMRO' }),
      makeSponsor({ id: 'sp-2', name: 'ABN AMRO Securities', parentCompanyName: 'ABN AMRO' }),
    ])
    await flushPromises()
    expect(wrapper.findAll('.company-row--subsidiary')).toHaveLength(0)
    await wrapper.find('.group-header-row').trigger('click')
    await nextTick()
    expect(wrapper.findAll('.company-row--subsidiary')).toHaveLength(2)
  })

  it('clicking group header again collapses subsidiaries', async () => {
    const wrapper = mountView([
      makeSponsor({ id: 'sp-1', name: 'ABN AMRO Clearing', parentCompanyName: 'ABN AMRO' }),
      makeSponsor({ id: 'sp-2', name: 'ABN AMRO Securities', parentCompanyName: 'ABN AMRO' }),
    ])
    await flushPromises()
    const header = wrapper.find('.group-header-row')
    await header.trigger('click')
    await nextTick()
    expect(wrapper.findAll('.company-row--subsidiary')).toHaveLength(2)
    await header.trigger('click')
    await nextTick()
    expect(wrapper.findAll('.company-row--subsidiary')).toHaveLength(0)
  })

  it('selecting a subsidiary row opens the detail panel', async () => {
    const wrapper = mountView([
      makeSponsor({ id: 'sp-1', name: 'ABN AMRO Clearing', parentCompanyName: 'ABN AMRO' }),
      makeSponsor({ id: 'sp-2', name: 'ABN AMRO Securities', parentCompanyName: 'ABN AMRO' }),
    ])
    await flushPromises()
    await wrapper.find('.group-header-row').trigger('click')
    await nextTick()
    await wrapper.find('.company-row--subsidiary').trigger('click')
    await nextTick()
    expect(wrapper.find('.detail-panel').exists()).toBe(true)
    expect(wrapper.find('.panel-title').text()).toContain('ABN AMRO')
  })

  it('a single company with parentCompanyName renders as a regular row (not a group)', async () => {
    const wrapper = mountView([
      makeSponsor({ id: 'sp-1', name: 'Solo Subsidiary B.V.', parentCompanyName: 'BigCorp' }),
    ])
    await flushPromises()
    expect(wrapper.findAll('.group-header-row')).toHaveLength(0)
    expect(wrapper.findAll('.company-row')).toHaveLength(1)
  })

  it('companies without parentCompanyName render as regular rows', async () => {
    const wrapper = mountView([
      makeSponsor({ id: 'sp-1', name: 'Alpha' }),
      makeSponsor({ id: 'sp-2', name: 'Beta' }),
    ])
    await flushPromises()
    expect(wrapper.findAll('.group-header-row')).toHaveLength(0)
    expect(wrapper.findAll('.company-row')).toHaveLength(2)
  })

  it('group header and ungrouped companies are sorted alphabetically together', async () => {
    const wrapper = mountView([
      makeSponsor({ id: 'sp-1', name: 'Zebra Corp' }), // ungrouped Z
      makeSponsor({ id: 'sp-2', name: 'ABN AMRO Bank', parentCompanyName: 'ABN AMRO' }),
      makeSponsor({ id: 'sp-3', name: 'ABN AMRO Securities', parentCompanyName: 'ABN AMRO' }),
      makeSponsor({ id: 'sp-4', name: 'Mango Inc' }), // ungrouped M
    ])
    await flushPromises()
    const rowTexts = wrapper.findAll('.company-row').map(r => r.text())
    // ABN AMRO group header should appear before Mango, Mango before Zebra
    const abn = rowTexts.findIndex(t => t.includes('ABN AMRO'))
    const mango = rowTexts.findIndex(t => t.includes('Mango'))
    const zebra = rowTexts.findIndex(t => t.includes('Zebra'))
    expect(abn).toBeLessThan(mango)
    expect(mango).toBeLessThan(zebra)
  })

  it('multiple groups from different parents are each collapsible independently', async () => {
    const wrapper = mountView([
      makeSponsor({ id: 'sp-1', name: 'ABN AMRO A', parentCompanyName: 'ABN AMRO' }),
      makeSponsor({ id: 'sp-2', name: 'ABN AMRO B', parentCompanyName: 'ABN AMRO' }),
      makeSponsor({ id: 'sp-3', name: 'ING Bank A', parentCompanyName: 'ING' }),
      makeSponsor({ id: 'sp-4', name: 'ING Bank B', parentCompanyName: 'ING' }),
    ])
    await flushPromises()
    expect(wrapper.findAll('.group-header-row')).toHaveLength(2)
    // Expand only first group
    await wrapper.findAll('.group-header-row')[0].trigger('click')
    await nextTick()
    expect(wrapper.findAll('.company-row--subsidiary')).toHaveLength(2)
    // Expand second group too
    await wrapper.findAll('.group-header-row')[1].trigger('click')
    await nextTick()
    expect(wrapper.findAll('.company-row--subsidiary')).toHaveLength(4)
  })
})

// ── pagination / PAGE_SIZE resize ───────────────────────────────────────────────

class MockResizeObserver {
  static latest: MockResizeObserver | null = null
  cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) { this.cb = cb; MockResizeObserver.latest = this }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function fireResize(clientHeight: number, rowHeight: number, listEl: HTMLElement) {
  Object.defineProperty(listEl, 'clientHeight', { value: clientHeight, configurable: true })
  const firstRow = listEl.querySelector<HTMLElement>('.company-row')
  if (firstRow) Object.defineProperty(firstRow, 'offsetHeight', { value: rowHeight, configurable: true })
  MockResizeObserver.latest!.cb([] as unknown as ResizeObserverEntry[], MockResizeObserver.latest as unknown as ResizeObserver)
}

function makeManySponsors(n: number): SponsorCompany[] {
  return Array.from({ length: n }, (_, i) => makeSponsor({ id: `sp-${i}`, name: `Company ${i}` }))
}

function activePageLabel(wrapper: ReturnType<typeof mount>): string | undefined {
  return wrapper.findAll('.page-btn--active')[0]?.text()
}

describe('CompaniesView – pagination survives PAGE_SIZE resize (Chrome iOS toolbar collapse)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getApplications).mockResolvedValue([])
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('stays on page 2 when a resize fires but page 2 is still in range', async () => {
    const wrapper = mountView(makeManySponsors(25))
    await flushPromises()

    await wrapper.findAll('.page-btn').find(b => b.text() === '2')!.trigger('click')
    expect(activePageLabel(wrapper)).toBe('2')

    const listEl = wrapper.find('.company-list').element as HTMLElement
    fireResize(600, 50, listEl) // -> PAGE_SIZE 12, pageCount ceil(25/12)=3, page 2 still valid
    await flushPromises()

    expect(activePageLabel(wrapper)).toBe('2')
  })

  it('clamps down to the last page when a resize makes page 2 go out of range', async () => {
    const wrapper = mountView(makeManySponsors(15))
    await flushPromises()

    await wrapper.findAll('.page-btn').find(b => b.text() === '2')!.trigger('click')
    expect(activePageLabel(wrapper)).toBe('2')

    const listEl = wrapper.find('.company-list').element as HTMLElement
    fireResize(680, 34, listEl) // -> PAGE_SIZE 20, pageCount ceil(15/20)=1, page 2 no longer valid
    await flushPromises()

    expect(wrapper.find('.pagination-info').text()).toContain('1–15')
  })

  it('ignores resize-driven PAGE_SIZE recalculation on mobile widths, where .dashboard is height:auto and the measurement is circular', async () => {
    // window.innerWidth alone doesn't drive happy-dom's matchMedia — the
    // viewport has to be set through its dedicated API for `(max-width)"
    // queries (what the production guard uses) to actually match.
    ;(window as any).happyDOM.setViewport({ width: 375 })
    try {
      const wrapper = mountView(makeManySponsors(25))
      await flushPromises()
      expect(wrapper.find('.pagination-info').text()).toContain('1–10') // stable default PAGE_SIZE=10

      const listEl = wrapper.find('.company-list').element as HTMLElement
      fireResize(680, 34, listEl) // would otherwise push PAGE_SIZE to 20
      await flushPromises()

      expect(wrapper.find('.pagination-info').text()).toContain('1–10') // unchanged
    } finally {
      ;(window as any).happyDOM.setViewport({ width: 1024 })
    }
  })
})

// ── admin: edit company description ─────────────────────────────────────────

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o))
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

const ADMIN_JWT = makeJwt({ sub: 'admin-1', email: 'admin@iwwz.nl', role: 'admin', exp: 9999999999 })
const USER_JWT  = makeJwt({ sub: 'user-1',  email: 'user@iwwz.nl',  role: 'user',  exp: 9999999999 })

describe('CompaniesView – admin: edit company description', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => sessionStorage.removeItem('token'))

  it('shows no Edit button for a non-admin user', async () => {
    sessionStorage.setItem('token', USER_JWT)
    const wrapper = mountView([makeSponsor({ summary: 'A great company.' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.summary-edit-btn').exists()).toBe(false)
  })

  it('shows no Edit button for a logged-out session', async () => {
    const wrapper = mountView([makeSponsor({ summary: 'A great company.' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.summary-edit-btn').exists()).toBe(false)
  })

  it('shows an Edit button for an admin user', async () => {
    sessionStorage.setItem('token', ADMIN_JWT)
    const wrapper = mountView([makeSponsor({ summary: 'A great company.' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.summary-edit-btn').exists()).toBe(true)
  })

  it('admin sees an "About" section (with an Edit affordance) even when there is no summary yet', async () => {
    sessionStorage.setItem('token', ADMIN_JWT)
    const wrapper = mountView([makeSponsor({ summary: undefined })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.find('.summary-edit-btn').exists()).toBe(true)
    expect(wrapper.text()).toContain('No description yet.')
  })

  it('non-admin sees no "About" section at all when there is no summary', async () => {
    sessionStorage.setItem('token', USER_JWT)
    const wrapper = mountView([makeSponsor({ summary: undefined })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    expect(wrapper.text()).not.toContain('No description yet.')
  })

  it('clicking Edit opens a textarea pre-filled with the current summary', async () => {
    sessionStorage.setItem('token', ADMIN_JWT)
    const wrapper = mountView([makeSponsor({ summary: 'Original text.' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.summary-edit-btn').trigger('click')
    const textarea = wrapper.find('.summary-textarea')
    expect(textarea.exists()).toBe(true)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Original text.')
  })

  it('Cancel discards changes and hides the textarea without saving', async () => {
    sessionStorage.setItem('token', ADMIN_JWT)
    const wrapper = mountView([makeSponsor({ summary: 'Original text.' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.summary-edit-btn').trigger('click')
    await wrapper.find('.summary-textarea').setValue('Edited but not saved.')
    await wrapper.findAll('button').find(b => b.text() === 'Cancel')!.trigger('click')
    expect(wrapper.find('.summary-textarea').exists()).toBe(false)
    expect(wrapper.text()).toContain('Original text.')
    expect(api.adminUpdateCompanySummary).not.toHaveBeenCalled()
  })

  it('Save calls store.updateSummary with the edited text and re-renders it', async () => {
    sessionStorage.setItem('token', ADMIN_JWT)
    vi.mocked(api.adminUpdateCompanySummary).mockResolvedValue(
      makeSponsor({ summary: 'Edited and saved.' })
    )
    const wrapper = mountView([makeSponsor({ summary: 'Original text.' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.summary-edit-btn').trigger('click')
    await wrapper.find('.summary-textarea').setValue('Edited and saved.')
    await wrapper.findAll('button').find(b => b.text() === 'Save')!.trigger('click')
    await flushPromises()
    expect(api.adminUpdateCompanySummary).toHaveBeenCalledWith('sp-1', 'Edited and saved.')
    expect(wrapper.find('.summary-textarea').exists()).toBe(false)
    expect(wrapper.text()).toContain('Edited and saved.')
  })

  it('trims whitespace before saving', async () => {
    sessionStorage.setItem('token', ADMIN_JWT)
    vi.mocked(api.adminUpdateCompanySummary).mockResolvedValue(makeSponsor({ summary: 'trimmed' }))
    const wrapper = mountView([makeSponsor({ summary: 'x' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.summary-edit-btn').trigger('click')
    await wrapper.find('.summary-textarea').setValue('  trimmed  ')
    await wrapper.findAll('button').find(b => b.text() === 'Save')!.trigger('click')
    await flushPromises()
    expect(api.adminUpdateCompanySummary).toHaveBeenCalledWith('sp-1', 'trimmed')
  })

  it('shows an error and keeps editing open when the save fails', async () => {
    sessionStorage.setItem('token', ADMIN_JWT)
    vi.mocked(api.adminUpdateCompanySummary).mockRejectedValue(new Error('403 Forbidden'))
    const wrapper = mountView([makeSponsor({ summary: 'Original text.' })])
    await flushPromises()
    await wrapper.find('.company-row').trigger('click')
    await wrapper.find('.summary-edit-btn').trigger('click')
    await wrapper.find('.summary-textarea').setValue('New text.')
    await wrapper.findAll('button').find(b => b.text() === 'Save')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('403 Forbidden')
    expect(wrapper.find('.summary-textarea').exists()).toBe(true)
  })

  it('closes editing mode when a different company is selected', async () => {
    sessionStorage.setItem('token', ADMIN_JWT)
    const wrapper = mountView([
      makeSponsor({ id: 'sp-1', name: 'Alpha', summary: 'Alpha summary' }),
      makeSponsor({ id: 'sp-2', name: 'Beta',  summary: 'Beta summary' }),
    ])
    await flushPromises()
    const rows = wrapper.findAll('.company-row')
    await rows[0].trigger('click')
    await wrapper.find('.summary-edit-btn').trigger('click')
    expect(wrapper.find('.summary-textarea').exists()).toBe(true)

    await rows[1].trigger('click')
    expect(wrapper.find('.summary-textarea').exists()).toBe(false)
  })
})
