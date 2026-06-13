import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useApplicationsStore,
  STATUS_LABELS,
  STATUS_COLOR,
  REJECTION_REASON_LABELS,
  ALL_STATUSES,
} from '../applications'
import type { Application, Stats } from '../../api'

vi.mock('../../api', () => ({
  api: {
    getApplications:   vi.fn(),
    createApplication: vi.fn(),
    updateApplication: vi.fn(),
    deleteApplication: vi.fn(),
    getStats:          vi.fn(),
    bulkUpdateStatus:  vi.fn(),
  }
}))

import { api } from '../../api'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id:          'app-1',
    userId:      'user-1',
    companyName: 'Acme',
    position:    'Engineer',
    appliedAt:   '2026-01-15T00:00:00Z',
    status:      'Applied',
    locations:   [],
    updatedAt:   '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

function makeStats(overrides: Partial<Stats> = {}): Stats {
  return { total: 5, byStatus: { Applied: 3, Rejected: 2 }, ...overrides }
}

// ── exported constants ────────────────────────────────────────────────────────

describe('STATUS_LABELS', () => {
  it('covers all seven statuses', () => {
    const expected = ['Applied','InterviewScheduled','OfferReceived','OnHold','Rejected','Withdrawn','Accepted']
    expect(Object.keys(STATUS_LABELS)).toEqual(expect.arrayContaining(expected))
    expect(Object.keys(STATUS_LABELS)).toHaveLength(7)
  })

  it('has non-empty string for every status', () => {
    for (const label of Object.values(STATUS_LABELS)) {
      expect(label.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('STATUS_COLOR', () => {
  it('covers all seven statuses', () => {
    expect(Object.keys(STATUS_COLOR)).toHaveLength(7)
  })

  it('every status has a chip CSS class name', () => {
    for (const cls of Object.values(STATUS_COLOR)) {
      expect(cls).toMatch(/^chip-/)
    }
  })
})

describe('REJECTION_REASON_LABELS', () => {
  it('covers all six reasons', () => {
    const expected = ['dutch_language','another_candidate','incompatible_profile','salary_mismatch','internal_hire','other']
    expect(Object.keys(REJECTION_REASON_LABELS)).toEqual(expect.arrayContaining(expected))
    expect(Object.keys(REJECTION_REASON_LABELS)).toHaveLength(6)
  })
})

describe('ALL_STATUSES', () => {
  it('is an array of all seven status keys', () => {
    expect(ALL_STATUSES).toHaveLength(7)
    expect(ALL_STATUSES).toContain('Applied')
    expect(ALL_STATUSES).toContain('Accepted')
    expect(ALL_STATUSES).toContain('Rejected')
  })
})

// ── load ──────────────────────────────────────────────────────────────────────

describe('useApplicationsStore – load', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('populates applications on success', async () => {
    vi.mocked(api.getApplications).mockResolvedValue([makeApp()])
    const store = useApplicationsStore()
    await store.load()
    expect(store.applications).toHaveLength(1)
    expect(store.applications[0].companyName).toBe('Acme')
  })

  it('clears loading flag after success', async () => {
    vi.mocked(api.getApplications).mockResolvedValue([])
    const store = useApplicationsStore()
    await store.load()
    expect(store.loading).toBe(false)
  })

  it('sets error message on API failure', async () => {
    vi.mocked(api.getApplications).mockRejectedValue(new Error('Network'))
    const store = useApplicationsStore()
    await store.load()
    expect(store.error).toBeTruthy()
    expect(store.loading).toBe(false)
  })

  it('clears previous error on fresh load', async () => {
    vi.mocked(api.getApplications).mockRejectedValueOnce(new Error('First'))
    const store = useApplicationsStore()
    await store.load()
    expect(store.error).toBeTruthy()

    vi.mocked(api.getApplications).mockResolvedValue([])
    await store.load()
    expect(store.error).toBeNull()
  })
})

// ── loadStats ─────────────────────────────────────────────────────────────────

describe('useApplicationsStore – loadStats', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('populates stats on success', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    const store = useApplicationsStore()
    await store.loadStats()
    expect(store.stats).toEqual(makeStats())
    expect(store.statsLoading).toBe(false)
  })

  it('calls API with no params when called bare', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    await useApplicationsStore().loadStats()
    expect(api.getStats).toHaveBeenCalledWith(undefined, undefined)
  })

  it('passes from and to when provided', async () => {
    vi.mocked(api.getStats).mockResolvedValue(makeStats())
    await useApplicationsStore().loadStats('2026-01-01', '2026-06-30')
    expect(api.getStats).toHaveBeenCalledWith('2026-01-01', '2026-06-30')
  })

  it('clears statsLoading even on failure', async () => {
    vi.mocked(api.getStats).mockRejectedValue(new Error('oops'))
    const store = useApplicationsStore()
    await store.loadStats().catch(() => {})
    expect(store.statsLoading).toBe(false)
  })
})

// ── create ────────────────────────────────────────────────────────────────────

describe('useApplicationsStore – create', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('adds returned application to the front of the list', async () => {
    const existing = makeApp({ id: 'existing', companyName: 'OldCo' })
    const created  = makeApp({ id: 'new-app',  companyName: 'NewCo' })
    vi.mocked(api.createApplication).mockResolvedValue(created)

    const store = useApplicationsStore()
    store.$patch({ applications: [existing] })
    await store.create({ companyName: 'NewCo', position: 'Dev', appliedAt: '2026-06-01T00:00:00Z', locations: [] })

    expect(store.applications[0].id).toBe('new-app')
    expect(store.applications[1].id).toBe('existing')
  })

  it('returns the created application', async () => {
    const created = makeApp({ id: 'created-id' })
    vi.mocked(api.createApplication).mockResolvedValue(created)
    const store = useApplicationsStore()
    const result = await store.create({ companyName: 'X', position: 'Y', appliedAt: '2026-06-01T00:00:00Z', locations: [] })
    expect(result.id).toBe('created-id')
  })
})

// ── update ────────────────────────────────────────────────────────────────────

describe('useApplicationsStore – update', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('replaces the existing application in list', async () => {
    const original = makeApp({ id: 'app-1', status: 'Applied' })
    const updated  = makeApp({ id: 'app-1', status: 'Rejected' })
    vi.mocked(api.updateApplication).mockResolvedValue(updated)

    const store = useApplicationsStore()
    store.$patch({ applications: [original] })
    await store.update('app-1', { status: 'Rejected' })

    expect(store.applications[0].status).toBe('Rejected')
    expect(store.applications).toHaveLength(1)
  })

  it('does not change list length when updating', async () => {
    const apps = [makeApp({ id: 'a' }), makeApp({ id: 'b' })]
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ id: 'a' }))
    const store = useApplicationsStore()
    store.$patch({ applications: apps })
    await store.update('a', {})
    expect(store.applications).toHaveLength(2)
  })

  it('returns the updated application', async () => {
    const updated = makeApp({ id: 'app-1', notes: 'follow up' })
    vi.mocked(api.updateApplication).mockResolvedValue(updated)
    const store = useApplicationsStore()
    store.$patch({ applications: [makeApp({ id: 'app-1' })] })
    const result = await store.update('app-1', { notes: 'follow up' })
    expect(result.notes).toBe('follow up')
  })
})

// ── remove ────────────────────────────────────────────────────────────────────

describe('useApplicationsStore – remove', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('removes the application from the list', async () => {
    vi.mocked(api.deleteApplication).mockResolvedValue(undefined)
    const store = useApplicationsStore()
    store.$patch({ applications: [makeApp({ id: 'app-1' }), makeApp({ id: 'app-2' })] })
    await store.remove('app-1')
    expect(store.applications).toHaveLength(1)
    expect(store.applications[0].id).toBe('app-2')
  })

  it('calls API with the correct id', async () => {
    vi.mocked(api.deleteApplication).mockResolvedValue(undefined)
    const store = useApplicationsStore()
    store.$patch({ applications: [makeApp({ id: 'app-99' })] })
    await store.remove('app-99')
    expect(api.deleteApplication).toHaveBeenCalledWith('app-99')
  })

  it('leaves other applications untouched', async () => {
    vi.mocked(api.deleteApplication).mockResolvedValue(undefined)
    const store = useApplicationsStore()
    store.$patch({ applications: [makeApp({ id: 'a' }), makeApp({ id: 'b' }), makeApp({ id: 'c' })] })
    await store.remove('b')
    expect(store.applications.map(a => a.id)).toEqual(['a', 'c'])
  })
})

// ── bulkUpdate ────────────────────────────────────────────────────────────────

describe('useApplicationsStore – bulkUpdate', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('updates each returned application in the list', async () => {
    const apps = [
      makeApp({ id: 'a', status: 'Applied' }),
      makeApp({ id: 'b', status: 'Applied' }),
      makeApp({ id: 'c', status: 'Applied' }),
    ]
    const updated = [
      makeApp({ id: 'a', status: 'Rejected' }),
      makeApp({ id: 'b', status: 'Rejected' }),
    ]
    vi.mocked(api.bulkUpdateStatus).mockResolvedValue(updated)
    const store = useApplicationsStore()
    store.$patch({ applications: apps })
    await store.bulkUpdate(['a', 'b'], 'Rejected')
    expect(store.applications.find(a => a.id === 'a')?.status).toBe('Rejected')
    expect(store.applications.find(a => a.id === 'b')?.status).toBe('Rejected')
    expect(store.applications.find(a => a.id === 'c')?.status).toBe('Applied')
  })

  it('calls API with correct ids and status', async () => {
    vi.mocked(api.bulkUpdateStatus).mockResolvedValue([])
    const store = useApplicationsStore()
    await store.bulkUpdate(['id1', 'id2'], 'Withdrawn')
    expect(api.bulkUpdateStatus).toHaveBeenCalledWith(['id1', 'id2'], 'Withdrawn')
  })

  it('returns the updated applications', async () => {
    const updated = [makeApp({ id: 'x', status: 'Accepted' })]
    vi.mocked(api.bulkUpdateStatus).mockResolvedValue(updated)
    const store = useApplicationsStore()
    store.$patch({ applications: [makeApp({ id: 'x' })] })
    const result = await store.bulkUpdate(['x'], 'Accepted')
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('Accepted')
  })

  it('does not modify applications not in the returned list', async () => {
    const apps = [makeApp({ id: 'a' }), makeApp({ id: 'b' })]
    vi.mocked(api.bulkUpdateStatus).mockResolvedValue([makeApp({ id: 'a', status: 'Accepted' })])
    const store = useApplicationsStore()
    store.$patch({ applications: apps })
    await store.bulkUpdate(['a'], 'Accepted')
    expect(store.applications.find(a => a.id === 'b')?.status).toBe('Applied')
  })

  it('empty API response leaves list unchanged', async () => {
    const apps = [makeApp({ id: 'a', status: 'Applied' })]
    vi.mocked(api.bulkUpdateStatus).mockResolvedValue([])
    const store = useApplicationsStore()
    store.$patch({ applications: apps })
    await store.bulkUpdate(['a'], 'Rejected')
    expect(store.applications[0].status).toBe('Applied')
  })

  it('propagates API error', async () => {
    vi.mocked(api.bulkUpdateStatus).mockRejectedValue(new Error('Server error'))
    const store = useApplicationsStore()
    await expect(store.bulkUpdate(['a'], 'Rejected')).rejects.toThrow('Server error')
  })

  it('attacker supplying more than 100 ids is rejected by backend — API call still passes ids through', async () => {
    // The store forwards all ids to the API; the 100-id cap is enforced by the backend.
    // This test documents that the store does not silently truncate.
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`)
    vi.mocked(api.bulkUpdateStatus).mockResolvedValue([])
    const store = useApplicationsStore()
    await store.bulkUpdate(ids, 'Rejected')
    expect(api.bulkUpdateStatus).toHaveBeenCalledWith(ids, 'Rejected')
  })
})

// ── appliedSponsorIds ─────────────────────────────────────────────────────────

describe('useApplicationsStore – appliedSponsorIds', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('returns empty Set when no applications', () => {
    const store = useApplicationsStore()
    expect(store.appliedSponsorIds.size).toBe(0)
  })

  it('returns empty Set when no application has a sponsorCompanyId', () => {
    const store = useApplicationsStore()
    store.$patch({ applications: [makeApp(), makeApp({ id: 'app-2' })] })
    expect(store.appliedSponsorIds.size).toBe(0)
  })

  it('includes sponsorCompanyId from linked applications', () => {
    const store = useApplicationsStore()
    store.$patch({
      applications: [
        makeApp({ id: 'a', sponsorCompanyId: 'co-1' }),
        makeApp({ id: 'b', sponsorCompanyId: 'co-2' }),
      ],
    })
    expect(store.appliedSponsorIds.has('co-1')).toBe(true)
    expect(store.appliedSponsorIds.has('co-2')).toBe(true)
    expect(store.appliedSponsorIds.size).toBe(2)
  })

  it('deduplicates when multiple applications share the same sponsorCompanyId', () => {
    const store = useApplicationsStore()
    store.$patch({
      applications: [
        makeApp({ id: 'a', sponsorCompanyId: 'co-1' }),
        makeApp({ id: 'b', sponsorCompanyId: 'co-1' }),
      ],
    })
    expect(store.appliedSponsorIds.size).toBe(1)
    expect(store.appliedSponsorIds.has('co-1')).toBe(true)
  })

  it('skips applications with undefined sponsorCompanyId', () => {
    const store = useApplicationsStore()
    store.$patch({
      applications: [
        makeApp({ id: 'a', sponsorCompanyId: 'co-1' }),
        makeApp({ id: 'b' }),
        makeApp({ id: 'c', sponsorCompanyId: undefined }),
      ],
    })
    expect(store.appliedSponsorIds.size).toBe(1)
    expect(store.appliedSponsorIds.has('co-1')).toBe(true)
  })

  it('returns a Set (supports .has() lookup)', () => {
    const store = useApplicationsStore()
    store.$patch({ applications: [makeApp({ sponsorCompanyId: 'co-99' })] })
    const ids = store.appliedSponsorIds
    expect(ids instanceof Set).toBe(true)
    expect(ids.has('co-99')).toBe(true)
    expect(ids.has('not-in-set')).toBe(false)
  })
})
