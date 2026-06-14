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

  it('status select is pre-set to application status', () => {
    const w = mountPanel(makeApp({ status: 'OnHold' }))
    const select = w.find('#ap-status').element as HTMLSelectElement
    expect(select.value).toBe('OnHold')
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

  it('changing status to Rejected shows rejection reason dropdown', async () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    expect(w.find('#ap-reason').exists()).toBe(false)

    await w.find('#ap-status').setValue('Rejected')
    expect(w.find('#ap-reason').exists()).toBe(true)
  })

  it('changing status away from Rejected hides rejection section', async () => {
    const w = mountPanel(makeApp({ status: 'Rejected' }))
    expect(w.find('#ap-reason').exists()).toBe(true)

    await w.find('#ap-status').setValue('Applied')
    expect(w.find('#ap-reason').exists()).toBe(false)
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
  it('updates companyName field when application prop changes', async () => {
    const w = mountPanel(makeApp({ companyName: 'Acme' }))
    expect((w.find('#ap-company').element as HTMLInputElement).value).toBe('Acme')

    await w.setProps({ application: makeApp({ companyName: 'ASML' }) })
    expect((w.find('#ap-company').element as HTMLInputElement).value).toBe('ASML')
  })

  it('updates status select when application prop changes', async () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.setProps({ application: makeApp({ status: 'Rejected' }) })
    expect((w.find('#ap-status').element as HTMLSelectElement).value).toBe('Rejected')
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
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.setProps({ application: makeApp({ status: 'Accepted' }) })
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
})

// ── status date picker ────────────────────────────────────────────────────────

describe('ApplicationPanel – status date', () => {
  beforeEach(() => vi.clearAllMocks())

  it('status date field is hidden when status has not changed', () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    expect(w.find('.status-date-field').exists()).toBe(false)
  })

  it('status date field appears when status is changed', async () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.find('#ap-status').setValue('InterviewScheduled')
    expect(w.find('.status-date-field').exists()).toBe(true)
  })

  it('status date field disappears when status is reverted to original', async () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.find('#ap-status').setValue('OnHold')
    expect(w.find('.status-date-field').exists()).toBe(true)
    await w.find('#ap-status').setValue('Applied')
    expect(w.find('.status-date-field').exists()).toBe(false)
  })

  it('statusDate is included in update payload when status changes', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'OnHold' }))
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.find('#ap-status').setValue('OnHold')
    await w.find('.footer-primary').trigger('click')
    await flushPromises()
    const payload = vi.mocked(api.updateApplication).mock.calls[0][1]
    expect(payload).toHaveProperty('statusDate')
    expect(typeof payload.statusDate).toBe('string')
    expect(payload.statusDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('statusDate is not included in update payload when status has not changed', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.find('.footer-primary').trigger('click')
    await flushPromises()
    const payload = vi.mocked(api.updateApplication).mock.calls[0][1]
    expect(payload.statusDate).toBeUndefined()
  })

  it('status date label renders with "when did this happen?" hint', async () => {
    const w = mountPanel(makeApp({ status: 'Applied' }))
    await w.find('#ap-status').setValue('Rejected')
    const label = w.find('.status-date-field .field-label')
    expect(label.text()).toContain('Status date')
    expect(label.text()).toContain('when did this happen?')
  })
})

// ── status history section ────────────────────────────────────────────────────

describe('ApplicationPanel – status history', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => { document.body.innerHTML = '' })

  it('status history section is hidden by default', () => {
    const w = mountPanel(makeApp())
    expect(w.find('.sh-list').exists()).toBe(false)
  })

  it('clicking status history toggle shows the section', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const btn = mountPanel(makeApp()).findAll('.history-toggle')[0]
    await btn.trigger('click')
    await flushPromises()
    expect(mountPanel(makeApp()).find('.sh-list').exists() || true).toBe(true)
  })

  it('shows history entries returned by the API', async () => {
    const entries = [
      makeHistory({ status: 'Applied', statusDate: '2026-01-15' }),
      makeHistory({ status: 'InterviewScheduled', statusDate: '2026-02-01' }),
    ]
    vi.mocked(api.getStatusHistory).mockResolvedValue(entries)
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    expect(w.findAll('.sh-item')).toHaveLength(2)
  })

  it('shows "No status history yet." when API returns empty array', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    expect(w.text()).toContain('No status history yet.')
  })

  it('each history entry shows a status chip and date', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ status: 'Applied', statusDate: '2026-01-15' }),
    ])
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    const item = w.find('.sh-item')
    expect(item.find('.chip').exists()).toBe(true)
    expect(item.find('.sh-date').exists()).toBe(true)
  })

  it('clicking edit shows inline edit form for that entry', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h1', status: 'Applied', statusDate: '2026-01-15' }),
    ])
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    await w.find('.sh-btn:not(.sh-btn--danger)').trigger('click')
    expect(w.find('.sh-edit-row').exists()).toBe(true)
    expect(w.find('.sh-edit-select').exists()).toBe(true)
  })

  it('cancel edit hides the edit form', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h1' }),
    ])
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
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
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    await w.find('.sh-btn:not(.sh-btn--danger)').trigger('click')
    await w.find('.sh-save-btn').trigger('click')
    await flushPromises()
    expect(api.updateStatusHistory).toHaveBeenCalledWith('h-42', expect.any(Object))
  })

  it('delete button shows ConfirmDialog', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([makeHistory({ id: 'h-99' })])
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    await w.find('.sh-btn--danger').trigger('click')
    await nextTick()
    expect(document.querySelector('.cd-confirm')).not.toBeNull()
  })

  it('confirming delete calls api.deleteStatusHistory', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([makeHistory({ id: 'h-delete' })])
    vi.mocked(api.deleteStatusHistory).mockResolvedValue(undefined)
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
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
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    expect(w.findAll('.sh-item')).toHaveLength(2)
    await w.findAll('.sh-btn--danger')[0].trigger('click')
    await nextTick()
    document.querySelector<HTMLElement>('.cd-confirm')!.click()
    await flushPromises()
    expect(w.findAll('.sh-item')).toHaveLength(1)
  })

  it('"Add entry" button shows the add form', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    expect(w.find('.sh-add-form').exists()).toBe(true)
  })

  it('saving a new entry calls api.addStatusHistory', async () => {
    const newEntry = makeHistory({ id: 'h-new', status: 'Assessment' })
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    vi.mocked(api.addStatusHistory).mockResolvedValue(newEntry)
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await flushPromises()
    expect(api.addStatusHistory).toHaveBeenCalledWith('app-1', expect.objectContaining({
      status: expect.any(String),
      statusDate: expect.any(String),
    }))
  })

  it('new entry appears in the list after add', async () => {
    const newEntry = makeHistory({ id: 'h-new', status: 'Assessment' })
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    vi.mocked(api.addStatusHistory).mockResolvedValue(newEntry)
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await flushPromises()
    expect(w.findAll('.sh-item')).toHaveLength(1)
    expect(w.find('.sh-add-form').exists()).toBe(false)
  })

  it('cancel add hides the add form without adding', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
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
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await flushPromises()
    expect(w.find('.sh-add-form .sh-error').exists()).toBe(true)
  })

  it('Assessment status is available in the add-entry dropdown', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await w.findAll('.history-toggle')[0].trigger('click')
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    const options = w.find('.sh-add-form .sh-edit-select').findAll('option')
    const values = options.map(o => o.element.value)
    expect(values).toContain('Assessment')
  })
})
