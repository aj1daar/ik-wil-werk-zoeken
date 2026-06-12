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
})
