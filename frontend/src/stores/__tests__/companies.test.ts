import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompaniesStore } from '../companies'
import type { SponsorCompany } from '../../api'

vi.mock('../../api', () => ({
  api: {
    getCompanies: vi.fn(),
    adminUpdateCompany: vi.fn(),
  }
}))

import { api } from '../../api'

function makeCompany(partial: Partial<SponsorCompany> & { id: string; name: string }): SponsorCompany {
  return { kvKNumber: '00000000', lastVerifiedAt: '2024-01-01T00:00:00Z', ...partial }
}

function seedStore(companies: SponsorCompany[]) {
  const store = useCompaniesStore()
  store.$patch({ companies })
  return store
}

// ── load ─────────────────────────────────────────────────────────────────────

describe('useCompaniesStore – load', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('loads companies from API', async () => {
    const companies = [makeCompany({ id: 'c1', name: 'Acme' })]
    vi.mocked(api.getCompanies).mockResolvedValue(companies)
    const store = useCompaniesStore()
    await store.load()
    expect(store.companies).toEqual(companies)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('skips fetch if companies already loaded', async () => {
    vi.mocked(api.getCompanies).mockResolvedValue([makeCompany({ id: 'c1', name: 'Acme' })])
    const store = useCompaniesStore()
    await store.load()
    await store.load()
    expect(api.getCompanies).toHaveBeenCalledTimes(1)
  })

  it('sets error on API failure', async () => {
    vi.mocked(api.getCompanies).mockRejectedValue(new Error('Network error'))
    const store = useCompaniesStore()
    await store.load()
    expect(store.error).toBeTruthy()
    expect(store.loading).toBe(false)
  })

  it('loading flag is false after load regardless of outcome', async () => {
    vi.mocked(api.getCompanies).mockRejectedValue(new Error('oops'))
    const store = useCompaniesStore()
    await store.load()
    expect(store.loading).toBe(false)
  })
})

// ── search ────────────────────────────────────────────────────────────────────

describe('useCompaniesStore – search', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('returns empty for blank query', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    expect(store.search('')).toHaveLength(0)
  })

  it('returns empty for whitespace-only query', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    expect(store.search('   ')).toHaveLength(0)
  })

  it('returns empty when companies list is empty', () => {
    expect(useCompaniesStore().search('acme')).toHaveLength(0)
  })

  it('matches by company name (case-insensitive)', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [
      makeCompany({ id: 'c1', name: 'Booking.com' }),
      makeCompany({ id: 'c2', name: 'ASML' })
    ]})
    const results = store.search('BOOK')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Booking.com')
  })

  it('matches by coreIndustry', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [
      makeCompany({ id: 'c1', name: 'Adyen', coreIndustry: 'Financial Services' }),
      makeCompany({ id: 'c2', name: 'Picnic', coreIndustry: 'Logistics' })
    ]})
    expect(store.search('financial')).toHaveLength(1)
    expect(store.search('financial')[0].name).toBe('Adyen')
  })

  it('matches by techStackTags', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [
      makeCompany({ id: 'c1', name: 'ASML', techStackTags: ['EUV', 'C++'] }),
      makeCompany({ id: 'c2', name: 'Adyen', techStackTags: ['Java', 'Go'] })
    ]})
    expect(store.search('java')).toHaveLength(1)
    expect(store.search('java')[0].name).toBe('Adyen')
  })

  it('matches by functionalTags', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [
      makeCompany({ id: 'c1', name: 'Adyen', functionalTags: ['Fintech', 'B2B SaaS'] }),
      makeCompany({ id: 'c2', name: 'Picnic', functionalTags: ['Logistics', 'B2C'] })
    ]})
    expect(store.search('fintech')).toHaveLength(1)
    expect(store.search('fintech')[0].name).toBe('Adyen')
  })

  it('caps results at 60 even when more match', () => {
    const store = useCompaniesStore()
    const companies = Array.from({ length: 80 }, (_, i) =>
      makeCompany({ id: `c${i}`, name: `Company ${i}` }))
    store.$patch({ companies })
    expect(store.search('company')).toHaveLength(60)
  })

  it('does not throw on regex-special characters in query', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme (B.V.)' })] })
    expect(() => store.search('(')).not.toThrow()
    expect(() => store.search('.*')).not.toThrow()
    expect(() => store.search('[test]')).not.toThrow()
  })

  it('returns no results when query has no matches', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    expect(store.search('xyzzynonexistent')).toHaveLength(0)
  })

  it('search matches by city', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'ASML', city: 'Eindhoven' }),
      makeCompany({ id: 'c2', name: 'Booking.com', city: 'Amsterdam' }),
    ])
    expect(store.search('eindhoven')).toHaveLength(1)
    expect(store.search('eindhoven')[0].name).toBe('ASML')
  })

  it('search city is case-insensitive', () => {
    const store = seedStore([makeCompany({ id: 'c1', name: 'ING', city: 'Amsterdam' })])
    expect(store.search('AMSTERDAM')).toHaveLength(1)
  })
})

// ── allCities ─────────────────────────────────────────────────────────────────

describe('useCompaniesStore – allCities', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('returns empty array when no companies', () => {
    expect(useCompaniesStore().allCities).toHaveLength(0)
  })

  it('returns sorted unique city list', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', city: 'Utrecht' }),
      makeCompany({ id: 'c2', name: 'B', city: 'Amsterdam' }),
      makeCompany({ id: 'c3', name: 'C', city: 'Amsterdam' }),
      makeCompany({ id: 'c4', name: 'D' }), // no city
    ])
    expect(store.allCities).toEqual(['Amsterdam', 'Utrecht'])
  })

  it('omits companies without city', () => {
    const store = seedStore([makeCompany({ id: 'c1', name: 'NoCityCompany' })])
    expect(store.allCities).toHaveLength(0)
  })
})

// ── allTags ───────────────────────────────────────────────────────────────────

describe('useCompaniesStore – allTags', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('returns empty array when no companies', () => {
    expect(useCompaniesStore().allTags).toHaveLength(0)
  })

  it('combines coreIndustry, techStackTags and functionalTags', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', coreIndustry: 'Fintech', techStackTags: ['Java'], functionalTags: ['B2B'] }),
    ])
    expect(store.allTags).toContain('Fintech')
    expect(store.allTags).toContain('Java')
    expect(store.allTags).toContain('B2B')
  })

  it('deduplicates tags across companies', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', techStackTags: ['Python'] }),
      makeCompany({ id: 'c2', name: 'B', techStackTags: ['Python'] }),
    ])
    expect(store.allTags.filter(t => t === 'Python')).toHaveLength(1)
  })

  it('returns sorted list', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', techStackTags: ['Zebra', 'Apple'] }),
    ])
    expect(store.allTags[0]).toBe('Apple')
    expect(store.allTags[1]).toBe('Zebra')
  })
})

// ── filter ────────────────────────────────────────────────────────────────────

describe('useCompaniesStore – filter', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  const companies = [
    makeCompany({ id: 'c1', name: 'ASML',        city: 'Eindhoven', coreIndustry: 'Semiconductors', techStackTags: ['C++'], functionalTags: ['Hardware'] }),
    makeCompany({ id: 'c2', name: 'Adyen',        city: 'Amsterdam', coreIndustry: 'Fintech',        techStackTags: ['Java', 'Go'], functionalTags: ['Payments'] }),
    makeCompany({ id: 'c3', name: 'Booking.com',  city: 'Amsterdam', coreIndustry: 'Travel',         techStackTags: ['Java', 'Kotlin'], functionalTags: ['B2C'] }),
    makeCompany({ id: 'c4', name: 'Signify',      city: 'Eindhoven', coreIndustry: 'IoT',            techStackTags: ['Python'], functionalTags: ['Hardware'] }),
  ]

  it('no filters returns all companies (up to 100)', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: [] })
    expect(result).toHaveLength(4)
  })

  it('filters by city', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: 'Amsterdam', includeTags: [], excludeTags: [] })
    expect(result).toHaveLength(2)
    expect(result.map(c => c.name).sort()).toEqual(['Adyen', 'Booking.com'])
  })

  it('city filter is exact match (not partial)', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: 'Amster', includeTags: [], excludeTags: [] })
    expect(result).toHaveLength(0)
  })

  it('filters by query within city-filtered results', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: 'adyen', city: 'Amsterdam', includeTags: [], excludeTags: [] })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Adyen')
  })

  it('include tag requires all included tags to be present', () => {
    const store = seedStore(companies)
    // 'Java' matches Adyen and Booking.com; 'Go' only matches Adyen
    const result = store.filter({ query: '', city: '', includeTags: ['Java', 'Go'], excludeTags: [] })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Adyen')
  })

  it('single include tag returns all matching companies', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: ['Java'], excludeTags: [] })
    expect(result).toHaveLength(2)
    expect(result.map(c => c.name).sort()).toEqual(['Adyen', 'Booking.com'])
  })

  it('exclude tag removes matching companies', () => {
    const store = seedStore(companies)
    // Exclude 'Hardware' — removes ASML and Signify
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: ['Hardware'] })
    expect(result).toHaveLength(2)
    expect(result.map(c => c.name).sort()).toEqual(['Adyen', 'Booking.com'])
  })

  it('exclude tag takes precedence when a tag is also in include', () => {
    // includeTags and excludeTags are separate; the UI prevents overlap but the store handles it gracefully
    const store = seedStore(companies)
    // Include 'Java', Exclude 'Kotlin' — Adyen has Java (no Kotlin) → stays; Booking.com has both → excluded
    const result = store.filter({ query: '', city: '', includeTags: ['Java'], excludeTags: ['Kotlin'] })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Adyen')
  })

  it('coreIndustry is treated as a tag for include/exclude', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: ['Fintech'], excludeTags: [] })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Adyen')
  })

  it('city + includeTags combined filter', () => {
    const store = seedStore(companies)
    // Amsterdam companies with Hardware tag — none (Adyen and Booking.com are in Amsterdam, neither has Hardware)
    const result = store.filter({ query: '', city: 'Amsterdam', includeTags: ['Hardware'], excludeTags: [] })
    expect(result).toHaveLength(0)
  })

  it('empty companies list returns empty', () => {
    const store = seedStore([])
    const result = store.filter({ query: 'anything', city: 'Amsterdam', includeTags: ['Java'], excludeTags: [] })
    expect(result).toHaveLength(0)
  })

  it('caps results at 100', () => {
    const manyCompanies = Array.from({ length: 120 }, (_, i) =>
      makeCompany({ id: `c${i}`, name: `Company ${i}`, city: 'Amsterdam' }))
    const store = seedStore(manyCompanies)
    const result = store.filter({ query: '', city: 'Amsterdam', includeTags: [], excludeTags: [] })
    expect(result).toHaveLength(100)
  })

  it('query on company with no city does not throw', () => {
    const store = seedStore([makeCompany({ id: 'c1', name: 'NoCityCompany' })])
    expect(() => store.filter({ query: 'city', city: '', includeTags: [], excludeTags: [] })).not.toThrow()
  })
})

// ── allWorkingLanguages ───────────────────────────────────────────────────────

describe('useCompaniesStore – allWorkingLanguages', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('returns empty array when no companies', () => {
    expect(useCompaniesStore().allWorkingLanguages).toHaveLength(0)
  })

  it('returns sorted unique working languages', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', workingLanguage: 'Dutch' }),
      makeCompany({ id: 'c2', name: 'B', workingLanguage: 'English' }),
      makeCompany({ id: 'c3', name: 'C', workingLanguage: 'Dutch' }),
    ])
    expect(store.allWorkingLanguages).toEqual(['Dutch', 'English'])
  })

  it('omits companies without workingLanguage', () => {
    const store = seedStore([makeCompany({ id: 'c1', name: 'A' })])
    expect(store.allWorkingLanguages).toHaveLength(0)
  })

  it('sorts alphabetically', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', workingLanguage: 'Spanish' }),
      makeCompany({ id: 'c2', name: 'B', workingLanguage: 'English' }),
      makeCompany({ id: 'c3', name: 'C', workingLanguage: 'Dutch' }),
    ])
    expect(store.allWorkingLanguages).toEqual(['Dutch', 'English', 'Spanish'])
  })
})

// ── allCompanySizes ───────────────────────────────────────────────────────────

describe('useCompaniesStore – allCompanySizes', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('returns empty array when no companies', () => {
    expect(useCompaniesStore().allCompanySizes).toHaveLength(0)
  })

  it('sorts by startup→scaleup→mid→large→enterprise order', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', companySize: 'enterprise' }),
      makeCompany({ id: 'c2', name: 'B', companySize: 'startup' }),
      makeCompany({ id: 'c3', name: 'C', companySize: 'mid' }),
      makeCompany({ id: 'c4', name: 'D', companySize: 'large' }),
      makeCompany({ id: 'c5', name: 'E', companySize: 'scaleup' }),
    ])
    expect(store.allCompanySizes).toEqual(['startup', 'scaleup', 'mid', 'large', 'enterprise'])
  })

  it('deduplicates sizes', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', companySize: 'mid' }),
      makeCompany({ id: 'c2', name: 'B', companySize: 'mid' }),
    ])
    expect(store.allCompanySizes).toEqual(['mid'])
  })

  it('omits companies without companySize', () => {
    const store = seedStore([makeCompany({ id: 'c1', name: 'A' })])
    expect(store.allCompanySizes).toHaveLength(0)
  })
})

// ── allRemotePolicies ─────────────────────────────────────────────────────────

describe('useCompaniesStore – allRemotePolicies', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('returns empty array when no companies', () => {
    expect(useCompaniesStore().allRemotePolicies).toHaveLength(0)
  })

  it('sorts by remote→hybrid→office→unknown order', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', remotePolicy: 'unknown' }),
      makeCompany({ id: 'c2', name: 'B', remotePolicy: 'office' }),
      makeCompany({ id: 'c3', name: 'C', remotePolicy: 'hybrid' }),
      makeCompany({ id: 'c4', name: 'D', remotePolicy: 'remote' }),
    ])
    expect(store.allRemotePolicies).toEqual(['remote', 'hybrid', 'office', 'unknown'])
  })

  it('deduplicates policies', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', remotePolicy: 'hybrid' }),
      makeCompany({ id: 'c2', name: 'B', remotePolicy: 'hybrid' }),
    ])
    expect(store.allRemotePolicies).toEqual(['hybrid'])
  })

  it('omits companies without remotePolicy', () => {
    const store = seedStore([makeCompany({ id: 'c1', name: 'A' })])
    expect(store.allRemotePolicies).toHaveLength(0)
  })
})

// ── filter – new extended params ──────────────────────────────────────────────

describe('useCompaniesStore – filter (workingLanguage / companySize / remotePolicy)', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  const companies = [
    makeCompany({ id: 'c1', name: 'ASML',   workingLanguage: 'English', companySize: 'large',    remotePolicy: 'office' }),
    makeCompany({ id: 'c2', name: 'Adyen',   workingLanguage: 'English', companySize: 'mid',      remotePolicy: 'hybrid' }),
    makeCompany({ id: 'c3', name: 'Picnic',  workingLanguage: 'Dutch',   companySize: 'scaleup',  remotePolicy: 'hybrid' }),
    makeCompany({ id: 'c4', name: 'Mollie',  workingLanguage: 'Dutch',   companySize: 'startup',  remotePolicy: 'remote' }),
  ]

  it('filters by workingLanguage', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: [], workingLanguage: 'Dutch' })
    expect(result.map(c => c.name).sort()).toEqual(['Mollie', 'Picnic'])
  })

  it('filters by companySize', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: [], companySize: 'mid' })
    expect(result.map(c => c.name)).toEqual(['Adyen'])
  })

  it('filters by remotePolicy', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: [], remotePolicy: 'hybrid' })
    expect(result.map(c => c.name).sort()).toEqual(['Adyen', 'Picnic'])
  })

  it('combines workingLanguage and remotePolicy filters', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: [], workingLanguage: 'Dutch', remotePolicy: 'hybrid' })
    expect(result.map(c => c.name)).toEqual(['Picnic'])
  })

  it('all three extended filters together', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: [], workingLanguage: 'English', companySize: 'mid', remotePolicy: 'hybrid' })
    expect(result.map(c => c.name)).toEqual(['Adyen'])
  })

  it('extended filter with no match returns empty', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: [], companySize: 'enterprise' })
    expect(result).toHaveLength(0)
  })

  it('undefined extended params act as no filter', () => {
    const store = seedStore(companies)
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: [], workingLanguage: undefined, companySize: undefined, remotePolicy: undefined })
    expect(result).toHaveLength(4)
  })

  it('company missing the filtered field is excluded', () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'A', workingLanguage: 'English' }),
      makeCompany({ id: 'c2', name: 'B' }), // no workingLanguage
    ])
    const result = store.filter({ query: '', city: '', includeTags: [], excludeTags: [], workingLanguage: 'English' })
    expect(result.map(c => c.name)).toEqual(['A'])
  })
})

// ── store.companies total count (for load-more) ───────────────────────────────
// The view paginates via a local displayCount ref (slicing store.companies).
// The store itself holds all companies — no hidden cap.

describe('useCompaniesStore – companies array (load-more source)', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('stores all companies without capping', () => {
    const companies = Array.from({ length: 200 }, (_, i) =>
      makeCompany({ id: `c${i}`, name: `Company ${i}` }))
    const store = seedStore(companies)
    expect(store.companies).toHaveLength(200)
  })

  it('slicing companies gives first page of 60', () => {
    const companies = Array.from({ length: 100 }, (_, i) =>
      makeCompany({ id: `c${i}`, name: `Company ${i}` }))
    const store = seedStore(companies)
    expect(store.companies.slice(0, 60)).toHaveLength(60)
    expect(store.companies.slice(0, 60)[0].name).toBe('Company 0')
  })

  it('slicing beyond total returns remaining companies only', () => {
    const companies = Array.from({ length: 45 }, (_, i) =>
      makeCompany({ id: `c${i}`, name: `Company ${i}` }))
    const store = seedStore(companies)
    // displayCount = 60 but only 45 companies — should get 45
    expect(store.companies.slice(0, 60)).toHaveLength(45)
  })

  it('canLoadMore condition: displayCount < total', () => {
    const companies = Array.from({ length: 100 }, (_, i) =>
      makeCompany({ id: `c${i}`, name: `Company ${i}` }))
    const store = seedStore(companies)
    const displayCount = 60
    expect(displayCount < store.companies.length).toBe(true)
  })

  it('canLoadMore is false when all loaded', () => {
    const companies = Array.from({ length: 50 }, (_, i) =>
      makeCompany({ id: `c${i}`, name: `Company ${i}` }))
    const store = seedStore(companies)
    const displayCount = 60
    expect(displayCount < store.companies.length).toBe(false)
  })
})

// ── updateCompany ────────────────────────────────────────────────────────────

describe('useCompaniesStore – updateCompany', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('calls api.adminUpdateCompany with the given id and patch', async () => {
    const store = seedStore([makeCompany({ id: 'c1', name: 'Acme', summary: 'old' })])
    vi.mocked(api.adminUpdateCompany).mockResolvedValue(
      makeCompany({ id: 'c1', name: 'Acme', summary: 'new summary' })
    )
    const patch = { summary: 'new summary', city: 'Delft', locations: ['Delft'] }
    await store.updateCompany('c1', patch)
    expect(api.adminUpdateCompany).toHaveBeenCalledWith('c1', patch)
  })

  it('replaces the matching company in the local array with the API response', async () => {
    const store = seedStore([
      makeCompany({ id: 'c1', name: 'Acme', summary: 'old', city: 'Amsterdam' }),
      makeCompany({ id: 'c2', name: 'Beta', summary: 'unrelated' }),
    ])
    vi.mocked(api.adminUpdateCompany).mockResolvedValue(
      makeCompany({ id: 'c1', name: 'Acme', summary: 'new summary', city: 'Delft', locations: ['Delft', 'Rijswijk'] })
    )
    await store.updateCompany('c1', { summary: 'new summary', city: 'Delft' })
    const c1 = store.companies.find(c => c.id === 'c1')
    expect(c1?.summary).toBe('new summary')
    expect(c1?.city).toBe('Delft')
    expect(c1?.locations).toEqual(['Delft', 'Rijswijk'])
    expect(store.companies.find(c => c.id === 'c2')?.summary).toBe('unrelated')
  })

  it('does not touch the array when the id is not found locally', async () => {
    const store = seedStore([makeCompany({ id: 'c1', name: 'Acme', summary: 'old' })])
    vi.mocked(api.adminUpdateCompany).mockResolvedValue(
      makeCompany({ id: 'ghost', name: 'Ghost', summary: 'new' })
    )
    await store.updateCompany('ghost', { summary: 'new' })
    expect(store.companies).toHaveLength(1)
    expect(store.companies[0].summary).toBe('old')
  })

  it('propagates an error from the API without mutating the array', async () => {
    const store = seedStore([makeCompany({ id: 'c1', name: 'Acme', summary: 'old' })])
    vi.mocked(api.adminUpdateCompany).mockRejectedValue(new Error('403 Forbidden'))
    await expect(store.updateCompany('c1', { summary: 'new' })).rejects.toThrow('403 Forbidden')
    expect(store.companies[0].summary).toBe('old')
  })
})
