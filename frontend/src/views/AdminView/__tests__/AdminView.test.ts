import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminView from '../AdminView.vue'
import type { AdminUserSummary, SyncLog } from '../../../api'

vi.mock('../../../api', () => ({
  api: {
    adminListUsers:          vi.fn(),
    adminPromote:            vi.fn(),
    adminReloadSponsors:     vi.fn(),
    adminEnrichSponsors:     vi.fn(),
    adminRetryLowConfidence: vi.fn(),
    adminGetSyncLogs:           vi.fn(),
  },
}))

import { api } from '../../../api'

type Wrapper = ReturnType<typeof mount>

function makeUser(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    userId: 'u1', email: 'someone@example.com', firstName: 'Jan', lastName: 'de Vries',
    role: 'user', emailVerified: true, createdAt: '2026-01-15T00:00:00Z', ...overrides,
  }
}

function makeLog(overrides: Partial<SyncLog> = {}): SyncLog {
  return {
    id: 1, syncedAt: '2026-06-20T00:00:00Z', triggerSource: 'timer',
    added: 12, updated: 3, removed: 0, enriched: 0, totalAfterSync: 12790, ...overrides,
  }
}

async function mountView(users: AdminUserSummary[] = [makeUser()], logs: SyncLog[] = [makeLog()]) {
  setActivePinia(createPinia())
  vi.mocked(api.adminListUsers).mockResolvedValue(users)
  vi.mocked(api.adminGetSyncLogs).mockResolvedValue(logs)
  const wrapper = mount(AdminView)
  await flushPromises()
  return wrapper
}

const buttonSaying = (wrapper: Wrapper, text: string) =>
  wrapper.findAll('button').find(b => b.text().toLowerCase().includes(text.toLowerCase()))!

beforeEach(() => vi.clearAllMocks())
afterEach(() => { document.body.innerHTML = '' })

// ── users ────────────────────────────────────────────────────────────────────

describe('AdminView – the user list', () => {
  it('loads users and sync history on open', async () => {
    await mountView()
    expect(api.adminListUsers).toHaveBeenCalledTimes(1)
    expect(api.adminGetSyncLogs).toHaveBeenCalledTimes(1)
  })

  it('shows each user with their role and verified state', async () => {
    const wrapper = await mountView([
      makeUser({ userId: 'u1', email: 'boss@example.com', role: 'admin' }),
      makeUser({ userId: 'u2', email: 'friend@example.com', firstName: 'Ada', lastName: 'Lovelace', emailVerified: false }),
    ])
    const rows = wrapper.findAll('table[aria-label="Registered users"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('boss@example.com')
    expect(rows[0].find('.role-badge--admin').text()).toBe('admin')
    expect(rows[1].text()).toContain('Ada Lovelace')
    expect(rows[1].text()).toContain('No')
  })

  it('reports a failed load instead of an empty table', async () => {
    vi.mocked(api.adminListUsers).mockRejectedValue(new Error('Forbidden'))
    vi.mocked(api.adminGetSyncLogs).mockResolvedValue([])
    const wrapper = mount(AdminView)
    await flushPromises()

    const error = wrapper.findAll('.form-error').find(p => p.text() === 'Forbidden')!
    expect(error.attributes('role')).toBe('alert')
    expect(wrapper.find('table[aria-label="Registered users"]').exists()).toBe(false)
  })
})

// ── promotion ────────────────────────────────────────────────────────────────

describe('AdminView – promoting a user', () => {
  const promote = async (wrapper: Wrapper, email: string) => {
    await wrapper.find('#promote-email').setValue(email)
    await wrapper.find('.promote-form').trigger('submit')
    await flushPromises()
  }

  it('trims the address, reports success and reloads the list', async () => {
    vi.mocked(api.adminPromote).mockResolvedValue(makeUser({ email: 'friend@example.com', role: 'admin' }))
    const wrapper = await mountView()

    await promote(wrapper, '  friend@example.com  ')

    expect(api.adminPromote).toHaveBeenCalledWith('friend@example.com')
    expect(wrapper.find('.form-success').text()).toBe('friend@example.com is now an admin.')
    expect(api.adminListUsers).toHaveBeenCalledTimes(2)
    expect((wrapper.find('#promote-email').element as HTMLInputElement).value).toBe('')
  })

  it('does nothing on a blank or whitespace-only address', async () => {
    const wrapper = await mountView()
    await promote(wrapper, '   ')
    expect(api.adminPromote).not.toHaveBeenCalled()
    expect(buttonSaying(wrapper, 'promote').attributes('disabled')).toBeDefined()
  })

  it('keeps what was typed and shows why the server refused', async () => {
    vi.mocked(api.adminPromote).mockRejectedValue(new Error('No user with that email'))
    const wrapper = await mountView()

    await promote(wrapper, 'nobody@example.com')

    expect(wrapper.find('.form-error').text()).toBe('No user with that email')
    expect((wrapper.find('#promote-email').element as HTMLInputElement).value).toBe('nobody@example.com')
    expect(api.adminListUsers).toHaveBeenCalledTimes(1)
  })
})

// ── register reload ──────────────────────────────────────────────────────────

describe('AdminView – reloading the IND register', () => {
  it('reports what the sync did and refreshes the history', async () => {
    vi.mocked(api.adminReloadSponsors).mockResolvedValue({ message: '12 added, 3 updated' })
    const wrapper = await mountView()

    await buttonSaying(wrapper, 'reload').trigger('click')
    await flushPromises()

    expect(wrapper.find('.form-success').text()).toBe('12 added, 3 updated')
    expect(api.adminGetSyncLogs).toHaveBeenCalledTimes(2)
  })

  it('surfaces a failed reload', async () => {
    vi.mocked(api.adminReloadSponsors).mockRejectedValue(new Error('IND register unreachable'))
    const wrapper = await mountView()

    await buttonSaying(wrapper, 'reload').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.form-error').some(p => p.text() === 'IND register unreachable')).toBe(true)
  })
})

// ── enrichment ───────────────────────────────────────────────────────────────

describe('AdminView – enriching companies', () => {
  it('keeps asking for batches until nothing is left, then says it is done', async () => {
    vi.mocked(api.adminEnrichSponsors)
      .mockResolvedValueOnce({ enriched: 10, remaining: 5, message: 'ok' })
      .mockResolvedValueOnce({ enriched: 5,  remaining: 0, message: 'ok' })
    const wrapper = await mountView()

    await buttonSaying(wrapper, 'enrich').trigger('click')
    await flushPromises()

    expect(api.adminEnrichSponsors).toHaveBeenCalledTimes(2)
    const modal = document.querySelector('.enrich-modal')!
    expect(modal.textContent).toContain('All done.')
    expect(modal.textContent).toContain('15')
  })

  it('stops after the batch in flight when asked to stop', async () => {
    // The first batch is held open so Stop lands mid-request, which is the
    // only moment the loop can be interrupted.
    let finishFirstBatch!: (value: { enriched: number; remaining: number; message: string }) => void
    vi.mocked(api.adminEnrichSponsors)
      .mockImplementationOnce(() => new Promise(resolve => { finishFirstBatch = resolve }))
      .mockResolvedValue({ enriched: 10, remaining: 500, message: 'ok' })
    const wrapper = await mountView()

    await buttonSaying(wrapper, 'enrich').trigger('click')
    await flushPromises()
    expect(document.querySelector('.enrich-modal .btn-danger')).not.toBeNull()

    ;(document.querySelector('.enrich-modal .btn-danger') as HTMLElement).click()
    finishFirstBatch({ enriched: 10, remaining: 500, message: 'ok' })
    await flushPromises()

    expect(api.adminEnrichSponsors).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.enrich-modal')!.textContent).toContain('Stopped early.')
  })

  it('shows the failure inside the progress modal', async () => {
    vi.mocked(api.adminEnrichSponsors).mockRejectedValue(new Error('Gemini quota exceeded'))
    const wrapper = await mountView()

    await buttonSaying(wrapper, 'enrich').trigger('click')
    await flushPromises()

    expect(document.querySelector('.enrich-modal')!.textContent).toContain('Gemini quota exceeded')
  })

  it('runs a single test batch without opening the progress modal', async () => {
    vi.mocked(api.adminEnrichSponsors).mockResolvedValue({ enriched: 10, remaining: 42, message: 'ok' })
    const wrapper = await mountView()

    await buttonSaying(wrapper, 'run 1 batch').trigger('click')
    await flushPromises()

    expect(api.adminEnrichSponsors).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.enrich-modal')).toBeNull()
    expect(wrapper.find('.batch-result').text()).toContain('42')
  })
})

// ── low-confidence retry ─────────────────────────────────────────────────────

describe('AdminView – retrying low-confidence companies', () => {
  it('loops until none remain', async () => {
    vi.mocked(api.adminRetryLowConfidence)
      .mockResolvedValueOnce({ enriched: 10, remaining: 2, message: 'ok' })
      .mockResolvedValueOnce({ enriched: 2,  remaining: 0, message: 'ok' })
    const wrapper = await mountView()

    await buttonSaying(wrapper, 'retry').trigger('click')
    await flushPromises()

    expect(api.adminRetryLowConfidence).toHaveBeenCalledTimes(2)
    expect(document.querySelector('.enrich-modal')!.textContent).toContain('All done.')
  })
})

// ── sync history ─────────────────────────────────────────────────────────────

describe('AdminView – sync history', () => {
  it('shows one row per sync, signed for added and removed', async () => {
    const wrapper = await mountView([makeUser()], [
      makeLog({ id: 1, added: 12, removed: 4 }),
      makeLog({ id: 2, triggerSource: 'admin', added: 0, removed: 0 }),
    ])
    const rows = wrapper.findAll('table[aria-label="IND sync history"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('+12')
    expect(rows[0].text()).toContain('-4')
    expect(rows[1].find('.role-badge--admin').text()).toBe('admin')
    expect(rows[1].text()).toContain('0')
  })

  it('says so when nothing has synced yet', async () => {
    const wrapper = await mountView([makeUser()], [])
    expect(wrapper.text()).toContain('No syncs recorded yet.')
  })
})
