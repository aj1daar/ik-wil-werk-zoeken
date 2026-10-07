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

// ── name sorting ─────────────────────────────────────────────────────────────

const tileNames = (w: ReturnType<typeof mount>) => w.findAll('.company-tile .tile-name').map(t => t.text())

describe('CompaniesView – name sorting', () => {
  it('A→Z ignores leading quotes and symbols in register names', async () => {
    const w = mountView([
      makeSponsor({ id: '1', name: '"Zeta" Machinefabriek' }),
      makeSponsor({ id: '2', name: 'Alpha' }),
      makeSponsor({ id: '3', name: '@Beta' }),
      makeSponsor({ id: '4', name: "'Petite' Delta" }),
    ])
    await flushPromises()
    expect(tileNames(w)).toEqual(['Alpha', '@Beta', "'Petite' Delta", '"Zeta" Machinefabriek'])
  })

  it('compares digits as numbers, so 2 comes before 10', async () => {
    const w = mountView([
      makeSponsor({ id: '1', name: '10X Genomics' }),
      makeSponsor({ id: '2', name: '2 Getthere' }),
      makeSponsor({ id: '3', name: '1 Cube' }),
    ])
    await flushPromises()
    expect(tileNames(w)).toEqual(['1 Cube', '2 Getthere', '10X Genomics'])
  })

  it('ignores case and accents', async () => {
    const w = mountView([
      makeSponsor({ id: '1', name: 'émile' }),
      makeSponsor({ id: '2', name: 'Delta' }),
      makeSponsor({ id: '3', name: 'apple' }),
    ])
    await flushPromises()
    expect(tileNames(w)).toEqual(['apple', 'Delta', 'émile'])
  })

  it('Z→A uses the same rule, reversed', async () => {
    const w = mountView([
      makeSponsor({ id: '1', name: '"Zeta"' }),
      makeSponsor({ id: '2', name: 'Alpha' }),
      makeSponsor({ id: '3', name: '@Beta' }),
    ])
    await flushPromises()
    await w.find('select[aria-label="Sort companies"]').setValue('za')
    expect(tileNames(w)).toEqual(['"Zeta"', '@Beta', 'Alpha'])
  })

  it('a name made only of symbols sorts first instead of crashing', async () => {
    const w = mountView([makeSponsor({ id: '1', name: 'Beta' }), makeSponsor({ id: '2', name: '***' })])
    await flushPromises()
    expect(tileNames(w)).toEqual(['***', 'Beta'])
  })

  it('shows the name exactly as registered, only the order changes', async () => {
    const w = mountView([makeSponsor({ id: '1', name: '"AAE" Advanced Automated Equipment' })])
    await flushPromises()
    expect(tileNames(w)).toEqual(['"AAE" Advanced Automated Equipment'])
  })
})

// ── tile accessibility ───────────────────────────────────────────────────────

describe('CompaniesView – tile accessibility', () => {
  it('tiles are not fake buttons wrapping the website link', async () => {
    const w = mountView([makeSponsor({ websiteUrl: 'https://acme.example' })])
    await flushPromises()
    const tile = w.find('.company-tile')
    expect(tile.attributes('role')).toBeUndefined()
    expect(tile.attributes('tabindex')).toBeUndefined()
  })

  it('the company name is a real button that opens the company', async () => {
    const w = mountView([makeSponsor({ name: 'Acme' })])
    await flushPromises()
    const btn = w.find('button.tile-name')
    expect(btn.attributes('type')).toBe('button')
    await btn.trigger('click')
    expect(w.findComponent({ name: 'CompanyDetailModal' }).exists()).toBe(true)
  })

  it('the website link opens the site without opening the company', async () => {
    const w = mountView([makeSponsor({ websiteUrl: 'https://acme.example' })])
    await flushPromises()
    const link = w.find('.tile-website')
    // stop happy-dom actually following the link; the click still bubbles
    link.element.addEventListener('click', e => e.preventDefault())
    await link.trigger('click')
    expect(w.findComponent({ name: 'CompanyDetailModal' }).exists()).toBe(false)
  })
})

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

  it('asks for one row when two companies are left, so they sit side by side', async () => {
    // The row height is a fixed eighth of the card (see .company-grid), so the
    // row count only decides placement, never the size of a tile.
    const w = mountView(manySponsors(2))
    await flushPromises()
    expect(w.find('.company-grid').attributes('style')).toContain('--tile-rows: 1')
  })

  it('asks for one row for a single company too', async () => {
    const w = mountView(manySponsors(1))
    await flushPromises()
    expect(w.find('.company-grid').attributes('style')).toContain('--tile-rows: 1')
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

// ── application-status + list-view dropdowns ─────────────────────────────────

const statusSelect = (w: ReturnType<typeof mountView>) => w.find('select[aria-label="Application status"]')
const listSelect   = (w: ReturnType<typeof mountView>) => w.find('select[aria-label="List view"]')
const interestBtn  = (w: ReturnType<typeof mountView>) =>
  w.findAll('.btn-list').find(b => /(to|from) interested/.test(b.text()))

describe('CompaniesView – status dropdown', () => {
  it('"Applied" shows only companies with an application', async () => {
    const w = mountView(
      [makeSponsor({ id: 'sp-1', name: 'Applied Co' }), makeSponsor({ id: 'sp-2', name: 'Not Applied Co' })],
      [makeApp({ sponsorCompanyId: 'sp-1' })],
    )
    await flushPromises()
    await statusSelect(w).setValue('applied')
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
    await statusSelect(w).setValue('not-applied')
    await nextTick()
    const tiles = w.findAll('.company-tile')
    expect(tiles).toHaveLength(1)
    expect(tiles[0].text()).toContain('Not Applied Co')
  })

  it('clearFilters resets both dropdowns', async () => {
    const w = mountView([makeSponsor({ id: 'sp-1' })], [makeApp({ sponsorCompanyId: 'sp-1' })])
    await flushPromises()
    await statusSelect(w).setValue('applied')
    await listSelect(w).setValue('interested')
    await nextTick()
    await w.find('.btn-clear-filters').trigger('click')
    await nextTick()
    expect((statusSelect(w).element as HTMLSelectElement).value).toBe('all')
    expect((listSelect(w).element as HTMLSelectElement).value).toBe('all')
  })
})

// ── the dead end a filter can leave you in ───────────────────────────────────

describe('CompaniesView – empty results', () => {
  const clearButton = (w: ReturnType<typeof mountView>) =>
    w.findAll('.state-msg button').find(b => b.text() === 'Clear filters')

  it('offers a way out when a filter matches nothing', async () => {
    const w = mountView([makeSponsor({ id: 'sp-1', name: 'Acme B.V.' })])
    await flushPromises()
    await w.find('.filter-search input').setValue('nothing matches this')
    await nextTick()

    expect(w.find('.state-msg').text()).toContain('No companies match your filters')
    expect(clearButton(w)).toBeDefined()
  })

  it('clearing from the empty state brings the companies back', async () => {
    const w = mountView([makeSponsor({ id: 'sp-1', name: 'Acme B.V.' })])
    await flushPromises()
    await w.find('.filter-search input').setValue('nothing matches this')
    await nextTick()
    await clearButton(w)!.trigger('click')
    await nextTick()

    expect(w.findAll('.company-tile')).toHaveLength(1)
    expect(w.find('.state-msg').exists()).toBe(false)
  })

  it('offers nothing to clear when the register itself is empty', async () => {
    // Nothing is filtered here, so a Clear button would be a dead control.
    const w = mountView([])
    await flushPromises()

    expect(w.find('.state-msg').text()).toContain('No IND sponsor companies loaded yet')
    expect(clearButton(w)).toBeUndefined()
  })
})

// ── facet filters, several values at a time ──────────────────────────────────

describe('CompaniesView – multi-select facet filters', () => {
  async function openFacets(w: ReturnType<typeof mountView>) {
    const toggle = w.findAll('.btn-filter-toggle').find(b => b.text().includes('Filters'))!
    await toggle.trigger('click')
    await nextTick()
    return w
  }

  function facet(w: ReturnType<typeof mountView>, label: string) {
    return w.findAll('.multi-filter').find(f =>
      f.find('.multi-filter-trigger').attributes('aria-label') === label)!
  }

  async function choose(w: ReturnType<typeof mountView>, label: string, values: string[]) {
    const group = facet(w, label)
    // The panel stays open while choosing, so a second call to this helper must
    // not toggle it shut.
    if (!group.find('.multi-filter-panel').exists()) {
      await group.find('.multi-filter-trigger').trigger('click')
      await nextTick()
    }
    for (const value of values) {
      const box = group.findAll('.multi-filter-option')
        .find(o => o.text().trim() === value)!
        .find('input')
      await box.trigger('change')
      await nextTick()
    }
    return w
  }

  const CITY_SPONSORS = [
    makeSponsor({ id: 'sp-1', name: 'Amsterdam Co', city: 'Amsterdam' }),
    makeSponsor({ id: 'sp-2', name: 'Rotterdam Co', city: 'Rotterdam' }),
    makeSponsor({ id: 'sp-3', name: 'Utrecht Co',   city: 'Utrecht' }),
  ]

  it('shows companies from every chosen city, not just the last one', async () => {
    const w = mountView(CITY_SPONSORS)
    await flushPromises()
    await openFacets(w)
    await choose(w, 'Filter by city', ['Amsterdam', 'Utrecht'])

    const names = w.findAll('.company-tile').map(t => t.text())
    expect(names).toHaveLength(2)
    expect(names.join(' ')).toContain('Amsterdam Co')
    expect(names.join(' ')).toContain('Utrecht Co')
    expect(names.join(' ')).not.toContain('Rotterdam Co')
  })

  it('narrows again when a city is unticked', async () => {
    const w = mountView(CITY_SPONSORS)
    await flushPromises()
    await openFacets(w)
    await choose(w, 'Filter by city', ['Amsterdam', 'Utrecht'])
    await choose(w, 'Filter by city', ['Utrecht'])

    expect(w.findAll('.company-tile')).toHaveLength(1)
    expect(w.find('.company-tile').text()).toContain('Amsterdam Co')
  })

  it('combines facets: either city, and only that policy', async () => {
    const w = mountView([
      makeSponsor({ id: 'sp-1', name: 'Hybrid Amsterdam', city: 'Amsterdam', remotePolicy: 'hybrid' }),
      makeSponsor({ id: 'sp-2', name: 'Onsite Amsterdam', city: 'Amsterdam', remotePolicy: 'onsite' }),
      makeSponsor({ id: 'sp-3', name: 'Hybrid Utrecht',   city: 'Utrecht',   remotePolicy: 'hybrid' }),
      makeSponsor({ id: 'sp-4', name: 'Hybrid Delft',     city: 'Delft',     remotePolicy: 'hybrid' }),
    ])
    await flushPromises()
    await openFacets(w)
    await choose(w, 'Filter by city', ['Amsterdam', 'Utrecht'])
    await choose(w, 'Filter by remote policy', ['hybrid'])

    const names = w.findAll('.company-tile').map(t => t.text()).join(' ')
    expect(w.findAll('.company-tile')).toHaveLength(2)
    expect(names).toContain('Hybrid Amsterdam')
    expect(names).toContain('Hybrid Utrecht')
  })

  it('counts every chosen value on the Filters button', async () => {
    const w = mountView(CITY_SPONSORS)
    await flushPromises()
    await openFacets(w)
    await choose(w, 'Filter by city', ['Amsterdam', 'Utrecht'])

    const toggle = w.findAll('.btn-filter-toggle').find(b => b.text().includes('Filters'))!
    expect(toggle.find('.filter-count').text()).toBe('2')
  })

  it('Clear empties every facet', async () => {
    const w = mountView(CITY_SPONSORS)
    await flushPromises()
    await openFacets(w)
    await choose(w, 'Filter by city', ['Amsterdam', 'Utrecht'])
    await w.find('.btn-clear-filters').trigger('click')
    await nextTick()

    expect(w.findAll('.company-tile')).toHaveLength(3)
    expect(facet(w, 'Filter by city').find('.multi-filter-trigger').text()).toContain('All cities')
  })

  it('goes back to the first page when a facet changes', async () => {
    const w = mountView([
      ...manySponsors(40),
      makeSponsor({ id: 'sp-x', name: 'Zuid Co', city: 'Rotterdam' }),
    ])
    await flushPromises()
    const pageTwo = w.findAll('.page-btn').find(b => b.text().trim() === '2')
    if (pageTwo) {
      await pageTwo.trigger('click')
      await nextTick()
    }
    await openFacets(w)
    await choose(w, 'Filter by city', ['Rotterdam'])

    expect(w.findAll('.company-tile')).toHaveLength(1)
    expect(w.find('.company-tile').text()).toContain('Zuid Co')
  })
})

// ── interested list ──────────────────────────────────────────────────────────

describe('CompaniesView – interested list', () => {
  it('marks a company interested from the modal and stars its tile', async () => {
    const w = mountView([makeSponsor({ id: 'sp-1', name: 'Acme' })])
    await flushPromises()
    expect(w.find('.company-tile .tile-star').exists()).toBe(false)

    await w.find('.company-tile').trigger('click')
    await interestBtn(w)!.trigger('click')
    await flushPromises()

    expect(api.setCompanyList).toHaveBeenCalledWith('sp-1', 'interested')
    expect(w.find('.company-tile .tile-star').exists()).toBe(true)
  })

  it('the list-view dropdown shows the interested count and filters to it', async () => {
    vi.mocked(api.getCompanyLists).mockResolvedValue({ interested: ['sp-1'], hidden: [] })
    const w = mountView([makeSponsor({ id: 'sp-1', name: 'Acme' }), makeSponsor({ id: 'sp-2', name: 'Other' })])
    await flushPromises()
    expect(listSelect(w).text()).toContain('Interested only (1)')

    await listSelect(w).setValue('interested')
    await nextTick()
    const tiles = w.findAll('.company-tile')
    expect(tiles).toHaveLength(1)
    expect(tiles[0].text()).toContain('Acme')
  })

  it('un-marks from the modal (sends kind "none")', async () => {
    vi.mocked(api.getCompanyLists).mockResolvedValue({ interested: ['sp-1'], hidden: [] })
    const w = mountView([makeSponsor({ id: 'sp-1' })])
    await flushPromises()
    await w.find('.company-tile').trigger('click')
    await interestBtn(w)!.trigger('click')
    await flushPromises()
    expect(api.setCompanyList).toHaveBeenCalledWith('sp-1', 'none')
  })

  it('rolls back and warns when the server rejects the change', async () => {
    vi.mocked(api.setCompanyList).mockRejectedValue(new Error('boom'))
    const w = mountView([makeSponsor({ id: 'sp-1' })])
    await flushPromises()
    await w.find('.company-tile').trigger('click')
    await interestBtn(w)!.trigger('click')
    await flushPromises()
    expect(w.find('.list-error').exists()).toBe(true)
  })

  it('a hidden company can be marked interested from the "Hidden only" view', async () => {
    vi.mocked(api.getCompanyLists).mockResolvedValue({ interested: [], hidden: ['sp-1'] })
    const w = mountView([makeSponsor({ id: 'sp-1' })])
    await flushPromises()
    expect(w.findAll('.company-tile')).toHaveLength(0)   // hidden by default
    await listSelect(w).setValue('hidden')
    await nextTick()
    await w.find('.company-tile').trigger('click')
    await interestBtn(w)!.trigger('click')
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

// ── loading placeholders ──────────────────────────────────────────────────────

describe('CompaniesView – while companies load', () => {
  it('shows a grid of placeholder tiles in the real grid', async () => {
    setActivePinia(createPinia())
    vi.mocked(api.getCompanies).mockReturnValue(new Promise(() => {}))
    vi.mocked(api.getApplications).mockResolvedValue([])
    const w = mount(CompaniesView, { global: { plugins: [createPinia()] } })
    await flushPromises()
    expect(w.find('[role="status"]').text()).toBe('Loading companies')
    expect(w.findAll('.skeleton-tile')).toHaveLength(16)
    // 8 rows by 2 columns, not one row of 16: the real grid's row count comes
    // from loaded companies, of which there are none yet
    expect(w.find('.loading-region .company-grid').attributes('style')).toContain('--tile-rows: 8')
    expect(w.find('.loading-region .company-grid').attributes('aria-hidden')).toBe('true')
    expect(w.text()).not.toContain('Loading…')
  })
})
