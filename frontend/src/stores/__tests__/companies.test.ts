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

import { api } from '../../api'

function makeCompany(partial: Partial<SponsorCompany> & { id: string; name: string }): SponsorCompany {
  return { kvKNumber: '00000000', ...partial }
}

function makeRecord(companyId: string, status = 'Applied'): ApplicationRecord {
  return { id: companyId, sponsorCompanyId: companyId, status, cities: [], updatedAt: '' }
}

// ── STATUSES ────────────────────────────────────────────────────────────────

describe('STATUSES', () => {
  it('has 9 entries', () => {
    expect(STATUSES).toHaveLength(9)
  })

  it('contains expected lifecycle statuses', () => {
    expect(STATUSES).toContain('Bookmarked')
    expect(STATUSES).toContain('Viewed')
    expect(STATUSES).toContain('Applied')
    expect(STATUSES).toContain('Ongoing Interview')
    expect(STATUSES).toContain('Rejected')
    expect(STATUSES).toContain('Offer Accepted')
  })

  it('contains no duplicate values', () => {
    expect(new Set(STATUSES).size).toBe(STATUSES.length)
  })

  it('contains no empty strings', () => {
    for (const s of STATUSES) expect(s.trim()).not.toBe('')
  })
})

// ── STATUS_COLORS ────────────────────────────────────────────────────────────

describe('STATUS_COLORS', () => {
  it('has a color entry for every status', () => {
    for (const s of STATUSES)
      expect(STATUS_COLORS, `missing color for "${s}"`).toHaveProperty(s)
  })

  it('no color value is an empty string', () => {
    for (const [k, v] of Object.entries(STATUS_COLORS))
      expect(v.trim(), `empty color for "${k}"`).not.toBe('')
  })
})

// ── tracked getter ───────────────────────────────────────────────────────────

describe('useCompaniesStore – tracked getter', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('returns empty when there are no records', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    expect(store.tracked).toHaveLength(0)
  })

  it('returns empty when companies list is empty', () => {
    const store = useCompaniesStore()
    store.$patch({ records: { c1: makeRecord('c1') } })
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
    store.$patch({ records: { ghost: makeRecord('ghost') } })
    expect(store.tracked).toHaveLength(0)
  })

  it('returns multiple tracked rows correctly', () => {
    const store = useCompaniesStore()
    store.$patch({
      companies: [makeCompany({ id: 'c1', name: 'A' }), makeCompany({ id: 'c2', name: 'B' })],
      records: { c1: makeRecord('c1'), c2: makeRecord('c2') }
    })
    expect(store.tracked).toHaveLength(2)
  })
})

// ── recordFor getter ────────────────────────────────────────────────────────

describe('useCompaniesStore – recordFor getter', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('returns null for an unknown company id', () => {
    expect(useCompaniesStore().recordFor('unknown')).toBeNull()
  })

  it('returns the record for a tracked company', () => {
    const store = useCompaniesStore()
    const record = makeRecord('c1')
    store.$patch({ records: { c1: record } })
    expect(store.recordFor('c1')).toEqual(record)
  })

  it('returns null after the record is removed', () => {
    const store = useCompaniesStore()
    store.$patch({ records: { c1: makeRecord('c1') } })
    delete store.records['c1']
    expect(store.recordFor('c1')).toBeNull()
  })
})

// ── load action ─────────────────────────────────────────────────────────────

describe('useCompaniesStore – load', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('loads companies and indexes records by sponsorCompanyId', async () => {
    const companies = [makeCompany({ id: 'c1', name: 'Acme' })]
    const records   = [makeRecord('c1', 'Applied')]
    vi.mocked(api.getCompanies).mockResolvedValue(companies)
    vi.mocked(api.getRecords).mockResolvedValue(records)
    const store = useCompaniesStore()
    await store.load()
    expect(store.companies).toEqual(companies)
    expect(store.records['c1']).toEqual(records[0])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error and clears loading on API failure', async () => {
    vi.mocked(api.getCompanies).mockRejectedValue(new Error('Network error'))
    const store = useCompaniesStore()
    await store.load()
    expect(store.error).toBeTruthy()
    expect(store.companies).toHaveLength(0)
    expect(store.loading).toBe(false)
  })

  it('clears a previous error on successful reload', async () => {
    vi.mocked(api.getCompanies).mockRejectedValueOnce(new Error('Fail'))
    vi.mocked(api.getCompanies).mockResolvedValueOnce([])
    vi.mocked(api.getRecords).mockResolvedValueOnce([])
    const store = useCompaniesStore()
    await store.load()
    expect(store.error).toBeTruthy()
    await store.load()
    expect(store.error).toBeNull()
  })

  it('loading flag is false after load regardless of outcome', async () => {
    vi.mocked(api.getCompanies).mockRejectedValue(new Error('oops'))
    const store = useCompaniesStore()
    await store.load()
    expect(store.loading).toBe(false)
  })
})

// ── upsertRecord action ──────────────────────────────────────────────────────

describe('useCompaniesStore – upsertRecord', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('calls saveRecord with isNew=true when company is not tracked', async () => {
    const saved = makeRecord('c1', 'Applied')
    vi.mocked(api.saveRecord).mockResolvedValue(saved)
    const store = useCompaniesStore()
    await store.upsertRecord('c1', { status: 'Applied' })
    expect(api.saveRecord).toHaveBeenCalledWith('c1', expect.objectContaining({ status: 'Applied' }), true)
    expect(store.records['c1']).toEqual(saved)
  })

  it('calls saveRecord with isNew=false when company is already tracked', async () => {
    const saved = makeRecord('c1', 'Rejected')
    vi.mocked(api.saveRecord).mockResolvedValue(saved)
    const store = useCompaniesStore()
    store.$patch({ records: { c1: makeRecord('c1', 'Applied') } })
    await store.upsertRecord('c1', { status: 'Rejected' })
    expect(api.saveRecord).toHaveBeenCalledWith('c1', expect.anything(), false)
    expect(store.records['c1'].status).toBe('Rejected')
  })

  it('propagates API errors to the caller', async () => {
    vi.mocked(api.saveRecord).mockRejectedValue(new Error('Save failed'))
    await expect(useCompaniesStore().upsertRecord('c1', {})).rejects.toThrow('Save failed')
  })
})

// ── removeRecord action ──────────────────────────────────────────────────────

describe('useCompaniesStore – removeRecord', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('calls deleteRecord and removes entry from store', async () => {
    vi.mocked(api.deleteRecord).mockResolvedValue(undefined)
    const store = useCompaniesStore()
    store.$patch({ records: { c1: makeRecord('c1') } })
    await store.removeRecord('c1')
    expect(api.deleteRecord).toHaveBeenCalledWith('c1')
    expect(store.records['c1']).toBeUndefined()
  })

  it('propagates API errors to the caller', async () => {
    vi.mocked(api.deleteRecord).mockRejectedValue(new Error('Delete failed'))
    const store = useCompaniesStore()
    store.$patch({ records: { c1: makeRecord('c1') } })
    await expect(store.removeRecord('c1')).rejects.toThrow('Delete failed')
  })
})

// ── search ───────────────────────────────────────────────────────────────────

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

  it('attaches record when company is tracked', () => {
    const store = useCompaniesStore()
    const record = makeRecord('c1', 'Applied')
    store.$patch({
      companies: [makeCompany({ id: 'c1', name: 'Acme' })],
      records: { c1: record }
    })
    expect(store.search('acme')[0].record).toEqual(record)
  })

  it('record is null for untracked company', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    expect(store.search('acme')[0].record).toBeNull()
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
    expect(() => store.search('\\n')).not.toThrow()
  })

  it('returns no results when query has no matches', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    expect(store.search('xyzzynonexistent')).toHaveLength(0)
  })

  it('matches are trimmed before comparing', () => {
    const store = useCompaniesStore()
    store.$patch({ companies: [makeCompany({ id: 'c1', name: 'Acme' })] })
    // leading/trailing spaces in query get trimmed internally
    expect(store.search('  acme  ')).toHaveLength(1)
  })
})
