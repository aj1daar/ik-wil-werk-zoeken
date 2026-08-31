import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { Transition } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompaniesView from '../CompaniesView.vue'

vi.mock('../../../api', () => ({
  api: {
    getApplications:    vi.fn(),
    createApplication:  vi.fn(),
    updateApplication:  vi.fn(),
    deleteApplication:  vi.fn(),
    getStats:           vi.fn(),
    getCompanies:       vi.fn(),
    getCompanyLists:    vi.fn(),
    setCompanyList:     vi.fn(),
    adminUpdateCompany: vi.fn(),
    parseJobLink:       vi.fn(),
  },
}))

import { api } from '../../../api'
import type { SponsorCompany, Application } from '../../../api'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getApplications).mockResolvedValue([])
  vi.mocked(api.getCompanyLists).mockResolvedValue({ interested: [], hidden: [] })
  vi.mocked(api.setCompanyList).mockImplementation((id, kind) =>
    Promise.resolve(kind === 'interested' ? { interested: [id], hidden: [] }
      : kind === 'hidden' ? { interested: [], hidden: [id] }
      : { interested: [], hidden: [] }))
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

function manySponsors(n: number): SponsorCompany[] {
  return Array.from({ length: n }, (_, i) =>
    makeSponsor({ id: `sp-${i}`, name: `Company ${String(i).padStart(3, '0')}` }))
}

function activePage(w: ReturnType<typeof mount>): string | undefined {
  return w.findAll('.page-btn--active')[0]?.text()
}

// ── grid rendering ───────────────────────────────────────────────────────────

describe('CompaniesView – company grid', () => {
  it('shows loading state while fetching', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(api.getCompanies).mockReturnValue(new Promise(() => {}))
    const w = mount(CompaniesView, { global: { plugins: [pinia] } })
    await nextTick()
    expect(w.text()).toContain('Loading')
  })

  it('renders one tile per company after load', async () => {
    const w = mountView([makeSponsor({ name: 'Alpha B.V.' }), makeSponsor({ id: 'sp-2', name: 'Beta N.V.' })])
    await flushPromises()
    expect(w.findAll('.company-tile')).toHaveLength(2)
  })

  it('shows the empty state when nothing is loaded', async () => {
    const w = mountView([])
    await flushPromises()
    expect(w.text()).toContain('No IND sponsor companies loaded yet')
  })

  it('subsidiaries are flat tiles — no grouping headers', async () => {
    const w = mountView([
      makeSponsor({ id: 'sp-1', name: 'ABN AMRO Clearing', parentCompanyName: 'ABN AMRO' }),
      makeSponsor({ id: 'sp-2', name: 'ABN AMRO Securities', parentCompanyName: 'ABN AMRO' }),
    ])
    await flushPromises()
    expect(w.findAll('.company-tile')).toHaveLength(2)
    expect(w.find('.group-header-row').exists()).toBe(false)
  })
})

// ── tile content ─────────────────────────────────────────────────────────────

describe('CompaniesView – tile content', () => {
  it('shows city, industry and working-language chips', async () => {
    const w = mountView([makeSponsor({ city: 'Amsterdam', coreIndustry: 'Fintech', workingLanguage: 'English' })])
    await flushPromises()
    const text = w.find('.company-tile .tile-chips').text()
    expect(text).toContain('Amsterdam')
    expect(text).toContain('Fintech')
    expect(text).toContain('English')
  })

  it('shows "No details yet" when the company has none of those', async () => {
    const w = mountView([makeSponsor({})])
    await flushPromises()
    expect(w.find('.company-tile .tile-empty').text()).toBe('No details yet')
  })

  it('shows a website link that does not open the modal', async () => {
    const w = mountView([makeSponsor({ websiteUrl: 'https://acme.example' })])
    await flushPromises()
    const link = w.find('.company-tile .tile-website')
    expect(link.attributes('href')).toBe('https://acme.example')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('shows the application status chip on the tile', async () => {
    const w = mountView([makeSponsor({ id: 'sp-1' })], [makeApp({ sponsorCompanyId: 'sp-1', status: 'Rejected' })])
    await flushPromises()
    expect(w.find('.company-tile .status-chip').text()).toContain('Rejected')
  })
})

// ── detail modal ─────────────────────────────────────────────────────────────

describe('CompaniesView – detail modal', () => {
  it('clicking a tile opens the CompanyDetailModal', async () => {
    const w = mountView([makeSponsor({ name: 'Bigcorp International' })])
    await flushPromises()
    expect(w.findComponent({ name: 'CompanyDetailModal' }).exists()).toBe(false)
    await w.find('.company-tile').trigger('click')
    const modal = w.findComponent({ name: 'CompanyDetailModal' })
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('Bigcorp International')
  })

  it('the modal closes when it emits close', async () => {
    const w = mountView([makeSponsor()])
    await flushPromises()
    await w.find('.company-tile').trigger('click')
    await w.findComponent({ name: 'CompanyDetailModal' }).vm.$emit('close')
    await flushPromises()
    expect(w.findComponent({ name: 'CompanyDetailModal' }).exists()).toBe(false)
  })

  it('shows the Edit button in the modal for an admin', async () => {
    const jwt = (p: object) => `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify(p))}.sig`
    sessionStorage.setItem('token', jwt({ sub: 'a', email: 'a@b.c', role: 'admin', exp: 9999999999 }))
    const w = mountView([makeSponsor({ summary: 'x' })])
    await flushPromises()
    await w.find('.company-tile').trigger('click')
    expect(w.find('.panel-edit-btn').exists()).toBe(true)
    sessionStorage.removeItem('token')
  })

  it('Start Application in the modal opens the NewApplicationModal', async () => {
    const w = mountView([makeSponsor({ name: 'TechCorp' })])
    await flushPromises()
    await w.find('.company-tile').trigger('click')
    await w.find('.footer-primary').trigger('click')
    await flushPromises()
    const nam = w.findComponent({ name: 'NewApplicationModal' })
    expect(nam.exists()).toBe(true)
    expect(nam.props('prefillCompany')).toBe('TechCorp')
  })

  it('the detail modal closes once the application flow starts', async () => {
    const w = mountView([makeSponsor()])
    await flushPromises()
    await w.find('.company-tile').trigger('click')
    await w.find('.footer-primary').trigger('click')
    await flushPromises()
    expect(w.findComponent({ name: 'CompanyDetailModal' }).exists()).toBe(false)
  })
})

// ── pagination ───────────────────────────────────────────────────────────────

describe('CompaniesView – pagination (16 per page)', () => {
  it('shows 16 tiles on a full page', async () => {
    const w = mountView(manySponsors(40))
    await flushPromises()
    expect(w.findAll('.company-tile')).toHaveLength(16)
    expect(w.find('.pagination-info').text()).toContain('1–16 of 40')
  })

  it('lays the grid out as eight rows on a full page', async () => {
    const w = mountView(manySponsors(40))
    await flushPromises()
    expect(w.find('.company-grid').attributes('style')).toContain('--tile-rows: 8')
  })

  it('shrinks the row count so a short last page still fills the card', async () => {
    const w = mountView(manySponsors(19)) // 16 + 3
    await flushPromises()
    await w.findAll('.page-btn').find(b => b.text() === '2')!.trigger('click')
    expect(w.findAll('.company-tile')).toHaveLength(3)
    // 3 tiles over 2 columns → 2 rows
    expect(w.find('.company-grid').attributes('style')).toContain('--tile-rows: 2')
  })

  it('a single page when there are 16 or fewer', async () => {
    const w = mountView(manySponsors(16))
    await flushPromises()
    expect(w.findAll('.page-btn').filter(b => /^\d+$/.test(b.text()))).toHaveLength(1)
  })

  it('clamps the current page when the list shrinks under it', async () => {
    const w = mountView(manySponsors(40))
    await flushPromises()
    await w.findAll('.page-btn').find(b => b.text() === '3')!.trigger('click')
    expect(activePage(w)).toBe('3')
    await w.find('input[aria-label="Search companies"]').setValue('Company 00')
    await flushPromises()
    expect(w.find('.pagination-info').text()).toContain('of 10') // Company 000..009
    expect(activePage(w)).toBe('1')
  })

  it('sorts the whole list before paginating, not just the visible page', async () => {
    const names = ['Zeta', 'Yankee', 'Xray', 'Whiskey', 'Victor', 'Uniform', 'Tango', 'Sierra',
                   'Romeo', 'Quebec', 'Papa', 'Oscar', 'November', 'Mike', 'Lima', 'Kilo', 'Alpha']
    const w = mountView(names.map((n, i) => makeSponsor({ id: `sp-${i}`, name: n })))
    await flushPromises()
    // default sort A→Z: first tile of page 1 is "Alpha", not source-order "Zeta"
    expect(w.findAll('.company-tile')[0].text()).toContain('Alpha')
    await w.findAll('.page-btn').find(b => b.text() === '2')!.trigger('click')
    expect(w.findAll('.company-tile').map(t => t.text()).join(' ')).toContain('Zeta')
  })
})

// ── applied filter ───────────────────────────────────────────────────────────

describe('CompaniesView – applied filter toggle', () => {
  it('"Applied" shows only companies with an application', async () => {
    const w = mountView(
      [makeSponsor({ id: 'sp-1', name: 'Applied Co' }), makeSponsor({ id: 'sp-2', name: 'Not Applied Co' })],
      [makeApp({ sponsorCompanyId: 'sp-1' })],
    )
    await flushPromises()
    await w.findAll('.applied-toggle-btn')[1].trigger('click')
    await nextTick()
    const tiles = w.findAll('.company-tile')
    expect(tiles).toHaveLength(1)
    expect(tiles[0].text()).toContain('Applied Co')
  })

  it('"Not applied" shows only companies without one', async () => {
    const w = mountView(
      [makeSponsor({ id: 'sp-1', name: 'Applied Co' }), makeSponsor({ id: 'sp-2', name: 'Not Applied Co' })],
      [makeApp({ sponsorCompanyId: 'sp-1' })],
    )
    await flushPromises()
    await w.findAll('.applied-toggle-btn')[2].trigger('click')
    await nextTick()
    const tiles = w.findAll('.company-tile')
    expect(tiles).toHaveLength(1)
    expect(tiles[0].text()).toContain('Not Applied Co')
  })

  it('clearFilters resets the applied filter to "all"', async () => {
    const w = mountView([makeSponsor({ id: 'sp-1' })], [makeApp({ sponsorCompanyId: 'sp-1' })])
    await flushPromises()
    await w.findAll('.applied-toggle-btn')[1].trigger('click')
    await nextTick()
    await w.find('.btn-clear-filters').trigger('click')
    await nextTick()
    expect(w.find('.applied-toggle-btn--active').text()).toBe('All')
  })
})

// ── interested list ──────────────────────────────────────────────────────────

describe('CompaniesView – interested list', () => {
  it('marks a company interested from the modal and stars its tile', async () => {
    const w = mountView([makeSponsor({ id: 'sp-1', name: 'Acme' })])
    await flushPromises()
    expect(w.find('.company-tile .tile-star').exists()).toBe(false)

    await w.find('.company-tile').trigger('click')
    await w.find('.star-btn').trigger('click')
    await flushPromises()

    expect(api.setCompanyList).toHaveBeenCalledWith('sp-1', 'interested')
    expect(w.find('.company-tile .tile-star').exists()).toBe(true)
  })

  it('shows an "★ Interested (N)" toggle once something is on the list', async () => {
    vi.mocked(api.getCompanyLists).mockResolvedValue({ interested: ['sp-1'], hidden: [] })
    const w = mountView([makeSponsor({ id: 'sp-1', name: 'Acme' }), makeSponsor({ id: 'sp-2', name: 'Other' })])
    await flushPromises()
    const toggle = w.findAll('button').find(b => b.text().includes('Interested'))
    expect(toggle).toBeTruthy()
    expect(toggle!.text()).toContain('Interested (1)')

    await toggle!.trigger('click')
    await flushPromises()
    const tiles = w.findAll('.company-tile')
    expect(tiles).toHaveLength(1)
    expect(tiles[0].text()).toContain('Acme')
  })

  it('un-stars from the modal (sends kind "none")', async () => {
    vi.mocked(api.getCompanyLists).mockResolvedValue({ interested: ['sp-1'], hidden: [] })
    const w = mountView([makeSponsor({ id: 'sp-1' })])
    await flushPromises()
    await w.find('.company-tile').trigger('click')
    await w.find('.star-btn').trigger('click')
    await flushPromises()
    expect(api.setCompanyList).toHaveBeenCalledWith('sp-1', 'none')
  })

  it('rolls back and warns when the server rejects the change', async () => {
    vi.mocked(api.setCompanyList).mockRejectedValue(new Error('boom'))
    const w = mountView([makeSponsor({ id: 'sp-1' })])
    await flushPromises()
    await w.find('.company-tile').trigger('click')
    await w.find('.star-btn').trigger('click')
    await flushPromises()
    expect(w.find('.list-error').exists()).toBe(true)
  })

  it('a hidden company can be starred from the "Showing hidden" view', async () => {
    vi.mocked(api.getCompanyLists).mockResolvedValue({ interested: [], hidden: ['sp-1'] })
    const w = mountView([makeSponsor({ id: 'sp-1' })])
    await flushPromises()
    // hidden companies are filtered out until you reveal them
    expect(w.findAll('.company-tile')).toHaveLength(0)
    await w.findAll('button').find(b => b.text().includes('Hidden'))!.trigger('click')
    await nextTick()
    await w.find('.company-tile').trigger('click')
    await w.find('.star-btn').trigger('click')
    await flushPromises()
    expect(api.setCompanyList).toHaveBeenCalledWith('sp-1', 'interested')
  })
})

// ── modal transition wrapper ─────────────────────────────────────────────────

describe('CompaniesView – transitions', () => {
  function modalTransitions(w: ReturnType<typeof mount>) {
    return (w.findAllComponents(Transition) as unknown as VueWrapper<any>[])
      .filter(t => t.props('name') === 'modal')
  }

  it('wraps the modals in <Transition name="modal">', async () => {
    const w = mountView()
    await flushPromises()
    expect(modalTransitions(w).length).toBeGreaterThanOrEqual(1)
  })
})
