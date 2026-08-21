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

  it('status journey always shows the Applied entry synthesized from appliedAt', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await flushPromises()
    expect(w.findAll('.sj-item')).toHaveLength(1)
    expect(w.find('.sj-item .chip').text()).toContain('Applied')
  })

  it('status journey auto-loads history on mount', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([makeHistory()])
    mountPanel(makeApp())
    await flushPromises()
    expect(api.getStatusHistory).toHaveBeenCalledWith('app-1')
  })

  it('renders success rate input', () => {
    const w = mountPanel(makeApp())
    expect(w.find('#ap-success-rate').exists()).toBe(true)
  })

  it('pre-fills success rate input from the application', () => {
    const w = mountPanel(makeApp({ successRate: 75 }))
    expect((w.find('#ap-success-rate').element as HTMLInputElement).value).toBe('75')
  })

  it('success rate input is empty when application has no successRate', () => {
    const w = mountPanel(makeApp({ successRate: undefined }))
    expect((w.find('#ap-success-rate').element as HTMLInputElement).value).toBe('')
  })

  it('shows "HSM sponsor" tag when application has a sponsorCompanyId', () => {
    const w = mountPanel(makeApp({ sponsorCompanyId: 'co-1' }))
    expect(w.find('.sponsor-chip').text()).toBe('HSM sponsor')
    expect(w.find('.sponsor-chip').classes()).toContain('sponsor-chip--yes')
  })

  it('shows "Not HSM sponsor" tag when application has no sponsorCompanyId', () => {
    const w = mountPanel(makeApp({ sponsorCompanyId: undefined }))
    expect(w.find('.sponsor-chip').text()).toBe('Not HSM sponsor')
    expect(w.find('.sponsor-chip').classes()).toContain('sponsor-chip--no')
  })
})

// ── job posting: link vs email ──────────────────────────────────────────────────

describe('ApplicationPanel – job posting link or email', () => {
  const originalClipboard = navigator.clipboard
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
    document.body.innerHTML = ''
  })

  it('field accepts free text (not constrained to URL format)', () => {
    const w = mountPanel(makeApp())
    expect(w.find('#ap-joburl').attributes('type')).toBe('text')
  })

  it('shows the "open" link button when jobUrl is a URL', () => {
    const w = mountPanel(makeApp({ jobUrl: 'https://example.com/jobs/1' }))
    expect(w.find('.joburl-open-btn').exists()).toBe(true)
    expect(w.find('a.joburl-open-btn').exists()).toBe(true)
    expect(w.find('a.joburl-open-btn').attributes('href')).toBe('https://example.com/jobs/1')
  })

  it('shows the "copy" button (not a link) when jobUrl is an email', () => {
    const w = mountPanel(makeApp({ jobUrl: 'hr@company.com' }))
    expect(w.find('.joburl-open-btn').exists()).toBe(true)
    expect(w.find('a.joburl-open-btn').exists()).toBe(false)
    expect(w.find('button.joburl-open-btn').exists()).toBe(true)
  })

  it('shows no button when jobUrl is empty', () => {
    const w = mountPanel(makeApp({ jobUrl: undefined }))
    expect(w.find('.joburl-open-btn').exists()).toBe(false)
  })

  it('shows no button when jobUrl is neither a recognizable url nor an email', () => {
    const w = mountPanel(makeApp({ jobUrl: 'ask the recruiter' }))
    expect(w.find('.joburl-open-btn').exists()).toBe(false)
  })

  it('switches from the open-link button to the copy button as the field is edited from a URL to an email', async () => {
    const w = mountPanel(makeApp({ jobUrl: 'https://example.com' }))
    expect(w.find('a.joburl-open-btn').exists()).toBe(true)
    await w.find('#ap-joburl').setValue('hr@company.com')
    expect(w.find('a.joburl-open-btn').exists()).toBe(false)
    expect(w.find('button.joburl-open-btn').exists()).toBe(true)
  })

  it('clicking the copy button copies the email to the clipboard', async () => {
    const w = mountPanel(makeApp({ jobUrl: 'hr@company.com' }))
    await w.find('button.joburl-open-btn').trigger('click')
    expect(writeText).toHaveBeenCalledWith('hr@company.com')
  })

  it('shows a "Copied to clipboard" toast after copying', async () => {
    // Toast is teleported to <body>, outside the mounted component tree —
    // query the document directly, same pattern as ConfirmDialog below.
    const w = mountPanel(makeApp({ jobUrl: 'hr@company.com' }))
    expect(document.querySelector('.toast-success')).toBeNull()
    await w.find('button.joburl-open-btn').trigger('click')
    await flushPromises()
    expect(document.querySelector('.toast-success')).not.toBeNull()
    expect(document.querySelector('.toast-success')!.textContent).toContain('Copied to clipboard')
  })

  it('does not show a toast if the clipboard write fails', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const w = mountPanel(makeApp({ jobUrl: 'hr@company.com' }))
    await w.find('button.joburl-open-btn').trigger('click')
    await flushPromises()
    expect(document.querySelector('.toast-success')).toBeNull()
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

  // Regression: the panel never tracked sponsorCompanyId at all, so every
  // save sent it as undefined — the backend trusts the payload as the full
  // state of the field, so this silently wiped the sponsor link (surfacing
  // as the HSM tag flipping to "Not HSM sponsor") on *any* save, most
  // noticeably when marking an application Rejected.

  it('preserves sponsorCompanyId when saving after only changing status to Rejected', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp({ status: 'Applied', sponsorCompanyId: 'co-1' }))
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-edit-select').setValue('Rejected')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-1',
      expect.objectContaining({ status: 'Rejected', sponsorCompanyId: 'co-1' })
    )
  })

  it('preserves sponsorCompanyId when saving after an unrelated field edit (notes)', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp({ sponsorCompanyId: 'co-1' }))
    await w.find('#ap-notes').setValue('some notes')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-1',
      expect.objectContaining({ sponsorCompanyId: 'co-1' })
    )
  })

  it('keeps sponsorCompanyId undefined on save when the application never had one', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp({ sponsorCompanyId: undefined }))
    await w.find('#ap-notes').setValue('some notes')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    const payload = vi.mocked(api.updateApplication).mock.calls[0][1]
    expect(payload.sponsorCompanyId).toBeUndefined()
  })

  it('clears sponsorCompanyId when the company name is retyped', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp({ sponsorCompanyId: 'co-1' }))
    await w.find('#ap-company').setValue('A Totally Different Co')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    const payload = vi.mocked(api.updateApplication).mock.calls[0][1]
    expect(payload.sponsorCompanyId).toBeUndefined()
  })

  it('save closes the panel immediately (fire-and-forget)', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp())
    await w.find('button.btn-primary').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('shows validation error and does not close when company name is empty', async () => {
    const w = mountPanel(makeApp())
    await w.find('#ap-company').setValue('')
    await w.find('button.btn-primary').trigger('click')
    expect(w.find('.save-error').exists()).toBe(true)
    expect(w.text()).toContain('Company name is required')
    expect(w.emitted('close')).toBeFalsy()
    expect(api.updateApplication).not.toHaveBeenCalled()
  })

  it('updated success rate is passed to the API', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp())
    await w.find('#ap-success-rate').setValue('80')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-1',
      expect.objectContaining({ successRate: 80 })
    )
  })

  it('clearing success rate sends undefined', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp({ successRate: 50 }))
    await w.find('#ap-success-rate').setValue('')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    const payload = vi.mocked(api.updateApplication).mock.calls[0][1]
    expect(payload.successRate).toBeUndefined()
  })

  it('success rate of 0 is passed through, not dropped as falsy', async () => {
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp())
    await w.find('#ap-success-rate').setValue('0')
    await w.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(api.updateApplication).toHaveBeenCalledWith('app-1',
      expect.objectContaining({ successRate: 0 })
    )
  })

  it('shows validation error and does not save when success rate exceeds 100', async () => {
    const w = mountPanel(makeApp())
    await w.find('#ap-success-rate').setValue('150')
    await w.find('button.btn-primary').trigger('click')
    expect(w.text()).toContain('Success rate must be between 0 and 100.')
    expect(api.updateApplication).not.toHaveBeenCalled()
  })

  it('shows validation error and does not save when success rate is negative', async () => {
    const w = mountPanel(makeApp())
    await w.find('#ap-success-rate').setValue('-10')
    await w.find('button.btn-primary').trigger('click')
    expect(w.text()).toContain('Success rate must be between 0 and 100.')
    expect(api.updateApplication).not.toHaveBeenCalled()
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

  it('always shows the Applied entry even when API returns empty array', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await flushPromises()
    expect(w.findAll('.sj-item')).toHaveLength(1)
    expect(w.find('.sj-item .chip').text()).toContain('Applied')
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

  it('clicking edit on the Applied entry shows a date picker but no status select', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h1', status: 'Applied', statusDate: '2026-01-15' }),
    ])
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-btn:not(.sh-btn--danger)').trigger('click')
    expect(w.find('.sh-edit-row').exists()).toBe(true)
    expect(w.find('.sh-edit-select').exists()).toBe(false)
  })

  it('clicking edit on a non-Applied entry shows both status select and date picker', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h1', status: 'InterviewScheduled', statusDate: '2026-02-01' }),
    ])
    const w = mountPanel(makeApp())
    await flushPromises()
    // Two items: Applied (synthetic) and InterviewScheduled; click edit on the last one
    const editBtns = w.findAll('.sh-btn:not(.sh-btn--danger)')
    await editBtns[editBtns.length - 1].trigger('click')
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

  it('inline edit save updates the entry locally without calling any API', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h-42', status: 'InterviewScheduled', statusDate: '2026-02-01' }),
    ])
    const w = mountPanel(makeApp())
    await flushPromises()
    const editBtns = w.findAll('.sh-btn:not(.sh-btn--danger)')
    await editBtns[editBtns.length - 1].trigger('click')
    await w.find('.sh-save-btn').trigger('click')
    expect(api.updateStatusHistory).not.toHaveBeenCalled()
    expect(api.updateApplication).not.toHaveBeenCalled()
  })

  it('Applied entry has no delete button', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h1', status: 'Applied', statusDate: '2026-01-15' }),
    ])
    const w = mountPanel(makeApp())
    await flushPromises()
    expect(w.find('.sh-btn--danger').exists()).toBe(false)
  })

  it('non-Applied entry has a delete button that shows ConfirmDialog', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h-99', status: 'InterviewScheduled', statusDate: '2026-02-01' }),
    ])
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-btn--danger').trigger('click')
    await nextTick()
    expect(document.querySelector('.cd-confirm')).not.toBeNull()
  })

  it('confirming delete removes entry from the list locally without calling API', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h-delete', status: 'InterviewScheduled', statusDate: '2026-02-01' }),
    ])
    const w = mountPanel(makeApp())
    await flushPromises()
    expect(w.findAll('.sj-item')).toHaveLength(2)
    await w.find('.sh-btn--danger').trigger('click')
    await nextTick()
    document.querySelector<HTMLElement>('.cd-confirm')!.click()
    await flushPromises()
    expect(w.findAll('.sj-item')).toHaveLength(1)
    expect(api.deleteStatusHistory).not.toHaveBeenCalled()
  })

  it('deleted entry is sent to the API when footer Save is clicked', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([
      makeHistory({ id: 'h-delete', status: 'InterviewScheduled', statusDate: '2026-02-01' }),
    ])
    vi.mocked(api.deleteStatusHistory).mockResolvedValue(undefined)
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp())
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-btn--danger').trigger('click')
    await nextTick()
    document.querySelector<HTMLElement>('.cd-confirm')!.click()
    await flushPromises()
    await w.find('.footer-primary').trigger('click')
    await flushPromises()
    expect(api.deleteStatusHistory).toHaveBeenCalledWith('h-delete')
  })

  it('deleted entry is removed from the list', async () => {
    const h1 = makeHistory({ id: 'h-1', status: 'Applied' })
    const h2 = makeHistory({ id: 'h-2', status: 'InterviewScheduled' })
    vi.mocked(api.getStatusHistory).mockResolvedValue([h1, h2])
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

  it('adding a new entry shows it immediately without calling API', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await flushPromises()
    expect(w.findAll('.sj-item')).toHaveLength(2)   // Applied + new entry
    expect(w.find('.sh-add-form').exists()).toBe(false)
    expect(api.addStatusHistory).not.toHaveBeenCalled()
  })

  it('new entry is sent to the API when footer Save is clicked', async () => {
    vi.mocked(api.getStatusHistory).mockResolvedValue([])
    vi.mocked(api.addStatusHistory).mockResolvedValue(makeHistory({ id: 'h-new', status: 'Assessment' }))
    vi.mocked(api.updateApplication).mockResolvedValue(makeApp({ status: 'Assessment' }))
    const w = mountPanel(makeApp())
    await flushPromises()
    await w.find('.sh-add-btn').trigger('click')
    await w.find('.sh-add-form .sh-save-btn').trigger('click')
    await w.find('.footer-primary').trigger('click')
    await flushPromises()
    expect(api.addStatusHistory).toHaveBeenCalledWith('app-1', expect.objectContaining({
      status: expect.any(String),
      statusDate: expect.any(String),
    }))
    expect(api.updateApplication).toHaveBeenCalledWith('app-1', expect.any(Object))
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
