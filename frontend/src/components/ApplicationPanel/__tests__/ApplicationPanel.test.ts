import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ApplicationPanel from '../ApplicationPanel.vue'
import type { Application } from '../../../api'

vi.mock('../../../api', () => ({
  api: {
    getApplications:      vi.fn(),
    createApplication:    vi.fn(),
    updateApplication:    vi.fn(),
    deleteApplication:    vi.fn(),
    getStats:             vi.fn(),
    getActivityLog:       vi.fn().mockResolvedValue([]),
    getStatusHistory:     vi.fn().mockResolvedValue([]),
    addStatusHistory:     vi.fn(),
    updateStatusHistory:  vi.fn(),
    deleteStatusHistory:  vi.fn(),
  }
}))

import { api } from '../../../api'
import type { StatusHistory } from '../../../api'

function makeHistory(overrides: Partial<StatusHistory> = {}): StatusHistory {
  return {
    id: crypto.randomUUID(), applicationId: 'app-1',
    status: 'Applied', statusDate: '2026-01-15', createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1', userId: 'u1', companyName: 'Acme', position: 'Engineer',
    appliedAt: '2026-01-15T00:00:00Z', status: 'Applied', locations: [],
    updatedAt: '2026-01-15T00:00:00Z', ...overrides,
  }
}

function mountPanel(app: Application) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(ApplicationPanel, { global: { plugins: [pinia] }, props: { application: app } })
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('ApplicationPanel – rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows company name in header', () => {
    const w = mountPanel(makeApp({ companyName: 'Booking.com' }))
    expect(w.find('.panel-title').text()).toBe('Booking.com')
  })

  it('shows position in header subtitle', () => {
    const w = mountPanel(makeApp({ position: 'Senior Engineer' }))
    expect(w.find('.panel-subtitle').text()).toBe('Senior Engineer')
  })

  it('rejection reason section is hidden when status is Applied', () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    expect(w.find('#ap-reason').exists()).toBe(false)
  })

  it('rejection reason section is shown when status is Rejected', () => {
    const w = mountPanel(makeApp({ status: 'Rejected' }))
    expect(w.find('#ap-reason').exists()).toBe(true)
  })

  it('rejection note textarea is shown when status is Rejected', () => {
    const w = mountPanel(makeApp({ status: 'Rejected' }))
    expect(w.find('#ap-reason-note').exists()).toBe(true)
  })

  it('status journey section is always visible', () => {
    const w = mountPanel(makeApp())
    expect(w.find('.sj-section').exists()).toBe(true)
  })

  it('status journey shows "No status changes yet." when history is empty', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await flushPromises()
    expect(w.find('.sj-section').text()).toContain('No status changes yet.')
  })

  it('status journey auto-loads history on mount', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([makeHistory()])
    mountPanel(makeApp())
    await flushPromises()
    expect(api.getStatusHistory).toHaveBeenCalledWith('app-1')
  })
})

// ── close ─────────────────────────────────────────────────────────────────────

describe('ApplicationPanel – close', () => {
  it('close button emits close', async () => {
    const w = mountPanel(makeApp())
    await w.find('button[aria-label="Close panel"]').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})

// ── rejection reason toggle ───────────────────────────────────────────────────

describe('ApplicationPanel – rejection reason toggle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejection section shows when application prop changes to Rejected', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp({ status: 'Applied' }))
    expect(w.find('#ap-reason').exists()).toBe(false)
    await w.setProps({ application: makeApp({ status: 'Rejected' }) })
    await flushPromises()
    expect(w.find('#ap-reason').exists()).toBe(true)
  })

  it('rejection section hides when application prop changes away from Rejected', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp({ status: 'Rejected' }))
    expect(w.find('#ap-reason').exists()).toBe(true)
    await w.setProps({ application: makeApp({ status: 'Applied' }) })
    await flushPromises()
    expect(w.find('#ap-reason').exists()).toBe(false)
  })

  it('rejection section shows after history entry with Rejected status is loaded', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ status: 'Rejected', statusDate: '2026-03-01' }),
    ])
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'Rejected' }))
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await flushPromises()
    expect(w.find('#ap-reason').exists()).toBe(true)
  })
})

// ── save ──────────────────────────────────────────────────────────────────────

describe('ApplicationPanel – save', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clicking Save calls api.updateApplication with the application id', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp({ id: 'app-42' }))
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-42', expect.any(Object))
  })

  it('updated company name is passed to the API', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp())
    await w.find('#ap-company').setValue('NewCorp')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-1',
      expect.objectContaining({ companyName: 'NewCorp' })
    )
  })

  it('statusDate is never included in the save payload', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.find('.footer-primary').trigger('click')
    await flushPromises()
    const payload = vi.mocked(api.updateApplication).mock.calls[0][1]
    expect(payload.statusDate).toBeUndefined()
  })

  it('shows save error when API throws', async () => {
    vi.mocked(api.updateApplication).mockRejectedValue(new Error('oops'))
    const w = mountPanel(makeApp())
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(w.find('.save-error').exists()).toBe(true)
    expect(w.text()).toContain('Save failed')
  })
})

// ── delete ────────────────────────────────────────────────────────────────────

describe('ApplicationPanel – delete', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => { document.body.innerHTML = '' })

  async function clickDeleteThenConfirm(w: ReturnType<typeof mountPanel>) {
    await w.find('button.btn-danger').trigger('click')
    await nextTick()
    document.querySelector<HTMLElement>('.cd-confirm')!.click()
  }

  it('clicking Delete and confirming calls api.deleteApplication', async () => {
    vi.mocked(api.deleteApplication).mockResolvedValue(undefined)
    const w = mountPanel(makeApp({ id: 'app-99' }))
    await clickDeleteThenConfirm(w)
    await flushPromises()
    expect(api.deleteApplication).toHaveBeenCalledWith('app-99')
  })

  it('emits close after successful delete', async () => {
    vi.mocked(api.deleteApplication).mockResolvedValue(undefined)
    const w = mountPanel(makeApp())
    await clickDeleteThenConfirm(w)
    await flushPromises()
    expect(w.emitted('close')).toBeTruthy()
  })

  it('shows error and does not emit close when delete fails', async () => {
    vi.mocked(api.deleteApplication).mockRejectedValue(new Error('delete failed'))
    const w = mountPanel(makeApp())
    await clickDeleteThenConfirm(w)
    await flushPromises()
    expect(w.emitted('close')).toBeFalsy()
    expect(w.find('.save-error').exists()).toBe(true)
  })
})

// ── prop sync (watch) ─────────────────────────────────────────────────────────

describe('ApplicationPanel – prop watch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates companyName field when application prop changes', async () => {
    const w = mountPanel(makeApp({ companyName: 'Acme' }))
    expect((w.find('#ap-company').element as HTMLInputElement).value).toBe('Acme')

    await w.setProps({ application: makeApp({ companyName: 'ASML' }) })
    expect((w.find('#ap-company').element as HTMLInputElement).value).toBe('ASML')
  })

  it('reloads status history when application prop changes', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp({ id: 'app-1' }))
    await flushPromises()
    vi.clearAllMocks()
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    await w.setProps({ application: makeApp({ id: 'app-2' }) })
    await flushPromises()
    expect(api.getStatusHistory).toHaveBeenCalledWith('app-2')
  })
})

// ── status chip in header ─────────────────────────────────────────────────────

describe('ApplicationPanel – status chip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a status chip in the panel header', () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    expect(w.find('.panel-title-block .chip').exists()).toBe(true)
  })

  it('chip shows the current status label', () => {
    const w = mountPanel(makeApp({ status: 'InterviewScheduled' }))
    expect(w.find('.panel-title-block .chip').text()).toContain('Interviewing')
  })

  it('chip updates when application prop changes status', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.setProps({ application: makeApp({ status: 'Accepted' }) })
    await flushPromises()
    expect(w.find('.panel-title-block .chip').text()).toContain('Accepted')
  })

  it('chip does not have chip-updated class before saving', () => {
    const w = mountPanel(makeApp())
    expect(w.find('.chip').classes()).not.toContain('chip-updated')
  })

  it('chip gains chip-updated class immediately after successful save', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'OnHold' }))
    const w = mountPanel(makeApp())
    await w.find('.footer-primary').trigger('click')
    await flushPromises()
    expect(w.find('.chip').classes()).toContain('chip-updated')
  })

  it('chip-updated class is absent when save fails', async () => {
    vi.mocked(api.updateApplication).mockRejectedValue(new Error('Server error'))
    const w = mountPanel(makeApp())
    await w.find('.footer-primary').trigger('click')
    await flushPromises()
    expect(w.find('.chip').classes()).not.toContain('chip-updated')
  })

  it('chip reflects latest history entry status after history loads', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ status: 'Assessment', statusDate: '2026-03-01' }),
    ])
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'Assessment' }))
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await flushPromises()
    expect(w.find('.panel-title-block .chip').text()).toContain('Assessment')
  })
})

// ── status journey section ────────────────────────────────────────────────────

describe('ApplicationPanel – status journey', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => { document.body.innerHTML = '' })

  it('shows history entries returned by the API', async () => {
    const entries = [
      makeHistory({ status: 'Applied', statusDate: '2026-01-15' }),
      makeHistory({ status: 'InterviewScheduled', statusDate: '2026-02-01' }),
    ]
    vi.mocked(api.getStatusHistory).mockResolvedValue(entries)
    const w = mountPanel(makeApp())
    await flushPromises()
    expect(w.findAll('.sj-item')).toHaveLength(2)
  })

  it('shows "No status changes yet." when API returns empty array', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await flushPromises()
    expect(w.text()).toContain('No status changes yet.')
  })

  it('entries are ordered oldest first (chronological)', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h2', status: 'InterviewScheduled', statusDate: '2026-02-01' }),
      makeHistory({ id: 'h1', status: 'Applied', statusDate: '2026-01-15' }),
    ])
    const w = mountPanel(makeApp())
    await flushPromises()
    const chips = w.findAll('.sj-item .chip')
    expect(chips[0].text()).toContain('Applied')
    expect(chips[1].text()).toContain('Interviewing')
  })

  it('each history entry shows a status chip and date', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ status: 'Applied', statusDate: '2026-01-15' }),
    ])
    const w = mountPanel(makeApp())
    await flushPromises()
    const item = w.find('.sj-item')
    expect(item.find('.chip').exists()).toBe(true)
    expect(item.find('.sj-date').exists()).toBe(true)
  })

  it('clicking edit shows inline edit form for that entry', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h1', status: 'Applied', statusDate: '2026-01-15' }),
    ])
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-btn:not(.sh-btn--danger)').trigger('click')
    expect(w.find('.sh-edit-row').exists()).toBe(true)
    expect(w.find('.sh-edit-select').exists()).toBe(true)
  })

  it('cancel edit hides the edit form', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([makeHistory({ id: 'h1' })])
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-btn:not(.sh-btn--danger)').trigger('click')
    expect(w.find('.sh-edit-row').exists()).toBe(true)
    await w.find('.sh-cancel-btn').trigger('click')
    expect(w.find('.sh-edit-row').exists()).toBe(false)
  })

  it('saving edit calls api.updateStatusHistory with the entry id', async () => {
    const entry = makeHistory({ id: 'h-42', status: 'Applied', statusDate: '2026-01-15' })
    vi.mocked(api.getStatusHistory).mockResolvedValue([entry])
    vi.mocked(api.updateStatusHistory).mockResolvedValue({ ...entry, status: 'OnHold' })
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'OnHold' }))
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-btn:not(.sh-btn--danger)').trigger('click')
    await w.find('.sh-save-btn').trigger('click')
    await flushPromises()
    expect(api.updateStatusHistory).toHaveBeenCalledWith('h-42', expect.any(Object))
  })

  it('saving edit syncs application status via updateApplication', async () => {
    const entry = makeHistory({ id: 'h-1', status: 'Applied', statusDate: '2026-01-15' })
    vi.mocked(api.getStatusHistory).mockResolvedValue([entry])
    vi.mocked(api.updateStatusHistory).mockResolvedValue({ ...entry, status: 'OnHold' })
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'OnHold' }))
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-btn:not(.sh-btn--danger)').trigger('click')
    await w.find('.sh-save-btn').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-1', expect.objectContaining({ status: 'OnHold' }))
  })

  it('delete button shows ConfirmDialog', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([makeHistory({ id: 'h-99' })])
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-btn--danger').trigger('click')
    await nextTick()
    expect(document.querySelector('.cd-confirm')).not.toBeNull()
  })

  it('confirming delete calls api.deleteStatusHistory', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([makeHistory({ id: 'h-delete' })])
    vi.mocked(api.deleteStatusHistory).mockResolvedValue(undefined)
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-btn--danger').trigger('click')
    await nextTick()
    document.querySelector<HTMLElement>('.cd-confirm')!.click()
    await flushPromises()
    expect(api.deleteStatusHistory).toHaveBeenCalledWith('h-delete')
  })

  it('deleted entry is removed from the list', async () => {
    const h1 = makeHistory({ id: 'h-1', status: 'Applied' })
    const h2 = makeHistory({ id: 'h-2', status: 'InterviewScheduled' })
    vi.mocked(api.getStatusHistory).mockResolvedValue([h1, h2])
    vi.mocked(api.deleteStatusHistory).mockResolvedValue(undefined)
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp())
    await flushPromises()
    expect(w.findAll('.sj-item')).toHaveLength(2)
    await w.findAll('.sh-btn--danger')[0].trigger('click')
    await nextTick()
    document.querySelector<HTMLElement>('.cd-confirm')!.click()
    await flushPromises()
    expect(w.findAll('.sj-item')).toHaveLength(1)
  })

  it('"Change status" button shows the add form', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    expect(w.find('.sh-add-form').exists()).toBe(true)
  })

  it('saving a new entry calls api.addStatusHistory', async () => {
    const newEntry = makeHistory({ id: 'h-new', status: 'Assessment' })
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    vi.mocked(api.addStatusHistory).mockResolvedValue(newEntry)
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'Assessment' }))
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await flushPromises()
    expect(api.addStatusHistory).toHaveBeenCalledWith('app-1', expect.objectContaining({
      status: expect.any(String),
      statusDate: expect.any(String),
    }))
  })

  it('adding a new entry syncs application status via updateApplication', async () => {
    const newEntry = makeHistory({ id: 'h-new', status: 'Assessment' })
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    vi.mocked(api.addStatusHistory).mockResolvedValue(newEntry)
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'Assessment' }))
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-1', expect.objectContaining({ status: 'Assessment' }))
  })

  it('new entry appears in the list after add', async () => {
    const newEntry = makeHistory({ id: 'h-new', status: 'Assessment' })
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    vi.mocked(api.addStatusHistory).mockResolvedValue(newEntry)
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'Assessment' }))
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await flushPromises()
    expect(w.findAll('.sj-item')).toHaveLength(1)
    expect(w.find('.sh-add-form').exists()).toBe(false)
  })

  it('cancel add hides the add form without adding', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    expect(w.find('.sh-add-form').exists()).toBe(true)
    await w.find('.sh-add-form .sh-cancel-btn').trigger('click')
    expect(w.find('.sh-add-form').exists()).toBe(false)
    expect(api.addStatusHistory).not.toHaveBeenCalled()
  })

  it('shows error message when addStatusHistory fails', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    vi.mocked(api.addStatusHistory).mockRejectedValue(new Error('fail'))
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await flushPromises()
    expect(w.find('.sh-add-form .sh-error').exists()).toBe(true)
  })

  it('Assessment status is available in the add-entry dropdown', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    const options = w.find('.sh-add-form .sh-edit-select').findAll('option')
    const values = options.map(o => o.element.value)
    expect(values).toContain('Assessment')
  })
})
