import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { Transition } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompaniesView from '../CompaniesView.vue'

vi.mock('../../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStats:          vi.fn(),
    getCompanies:      vi.fn(),
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
