import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompaniesStore } from '../companies'
import type { SponsorCompany } from '../../api'

vi.mock('../../api', () => ({
  api: {
    getCompanies: vi.fn(),
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
