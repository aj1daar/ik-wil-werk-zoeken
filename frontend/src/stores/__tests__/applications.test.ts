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

  it('every color contains bg- and text- classes', () => {
    for (const classes of Object.values(STATUS_COLOR)) {
      expect(classes).toMatch(/bg-/)
      expect(classes).toMatch(/text-/)
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
