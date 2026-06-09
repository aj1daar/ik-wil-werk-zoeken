import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompaniesStore, STATUSES, STATUS_COLORS } from '../companies'
import type { SponsorCompany, ApplicationRecord } from '../../api'

vi.mock('../../api', () => ({
  api: {
    getCompanies: vi.fn(),
    getRecords: vi.fn(),
    saveRecord: vi.fn(),
    deleteRecord: vi.fn()
  }
}))

function makeCompany(partial: Partial<SponsorCompany> & { id: string; name: string }): SponsorCompany {
  return { kvKNumber: '00000000', ...partial }
}

function makeRecord(companyId: string, status = 'Applied'): ApplicationRecord {
  return { id: companyId, sponsorCompanyId: companyId, status, cities: [], updatedAt: '' }
}

describe('STATUSES', () => {
  it('has 9 entries', () => {
    expect(STATUSES).toHaveLength(9)
  })

  it('contains expected lifecycle statuses', () => {
    expect(STATUSES).toContain('Bookmarked')
    expect(STATUSES).toContain('Applied')
    expect(STATUSES).toContain('Ongoing Interview')
    expect(STATUSES).toContain('Offer Accepted')
    expect(STATUSES).toContain('Rejected')
  })
})

describe('STATUS_COLORS', () => {
  it('has a color entry for every status', () => {
    for (const s of STATUSES) {
      expect(STATUS_COLORS, `missing color for "${s}"`).toHaveProperty(s)
    }
  })
})

describe('useCompaniesStore – tracked getter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('returns empty when there are no records', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    expect(store.tracked).toHaveLength(0)
  })

  it('joins companies with their records', () => {
    const store = useCompaniesStore()
    const company = makeCompany({ id: 'c1', name: 'Acme' })
    const record = makeRecord('c1')
    store.$patch({ companies: [company], records: { c1: record } })
    expect(store.tracked).toHaveLength(1)
    expect(store.tracked[0].name).toBe('Acme')
    expect(store.tracked[0].record).toEqual(record)
  })

  it('omits records whose company is not in companies list', () => {
    const store = useCompaniesStore()
    store.$patch({ records: { unknown: makeRecord('unknown') } })
    expect(store.tracked).toHaveLength(0)
  })
})

describe('useCompaniesStore – search', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('returns empty for blank query', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    expect(store.search('')).toHaveLength(0)
    expect(store.search('   ')).toHaveLength(0)
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

  it('matches by techStackTags', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [
      makeCompany({ id: 'c1', name: 'ASML', techStackTags: ['EUV', 'C++'] }),
      makeCompany({ id: 'c2', name: 'Adyen', techStackTags: ['Java', 'Go'] })
    ]})
    expect(store.search('java')).toHaveLength(1)
    expect(store.search('java')[0].name).toBe('Adyen')
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

  it('attaches record when company is tracked', () => {
    const store = useCompaniesStore()
    const company = makeCompany({ id: 'c1', name: 'Acme' })
    const record = makeRecord('c1', 'Applied')
    store.$patch({ companies: [company], records: { c1: record } })
    const results = store.search('acme')
    expect(results[0].record).toEqual(record)
  })

  it('record is null for untracked company', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    expect(store.search('acme')[0].record).toBeNull()
  })
})
