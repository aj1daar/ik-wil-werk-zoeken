import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SidePanel from '../sidepanel/SidePanel.vue'
import { getToken, setToken } from '../lib/auth'

vi.mock('../lib/api', () => ({
  api: {
    login: vi.fn(),
    parseJobLink: vi.fn(),
    lookupSponsors: vi.fn(),
    getApplications: vi.fn(),
    createApplication: vi.fn(),
  },
  UnauthorizedError: class extends Error {},
}))

import { api } from '../lib/api'

function liveToken(): string {
  const part = (value: unknown) => btoa(JSON.stringify(value))
  return `${part({ alg: 'HS256' })}.${part({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
}

function clipboard(text: string | null) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: vi.fn(async () => {
        if (text === null) throw new DOMException('Denied', 'NotAllowedError')
        return text
      }),
    },
  })
}

async function open() {
  const wrapper = mount(SidePanel, { attachTo: document.body })
  await flushPromises()
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof open>>

const note = (w: Wrapper) => w.find('.panel-note')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getApplications).mockResolvedValue([])
  vi.mocked(api.lookupSponsors).mockResolvedValue({ query: '', exact: null, matches: [] })
  vi.mocked(api.parseJobLink).mockResolvedValue({
    company: 'Acme B.V.', position: 'Senior Backend Engineer', locations: ['Amsterdam'], source: 'jsonld',
  })
  clipboard('https://acme.nl/job/1')
})

// ── signing in ───────────────────────────────────────────────────────────────

describe('SidePanel – who is signed in', () => {
  it('asks for a sign-in when there is no session', async () => {
    const w = await open()
    expect(w.find('#panel-email').exists()).toBe(true)
    expect(w.find('#panel-company').exists()).toBe(false)
  })

  it('asks for a sign-in when the stored session has expired', async () => {
    const part = (value: unknown) => btoa(JSON.stringify(value))
    await setToken(`${part({})}.${part({ exp: Math.floor(Date.now() / 1000) - 60 })}.sig`)
    const w = await open()
    expect(w.find('#panel-email').exists()).toBe(true)
  })

  it('touches nothing on the server before there is a session', async () => {
    await open()
    expect(api.parseJobLink).not.toHaveBeenCalled()
    expect(api.getApplications).not.toHaveBeenCalled()
  })

  it('goes straight to the form once signed in', async () => {
    await setToken(liveToken())
    const w = await open()
    expect(w.find('#panel-company').exists()).toBe(true)
  })

  it('reads the clipboard after a sign-in from the panel', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: liveToken() })
    const w = await open()
    await w.find('#panel-email').setValue('me@example.com')
    await w.find('#panel-password').setValue('secret')
    await w.find('form').trigger('submit')
    await flushPromises()
    await flushPromises()
    expect(api.parseJobLink).toHaveBeenCalledWith('https://acme.nl/job/1')
  })

  it('forgets the session on sign-out', async () => {
    await setToken(liveToken())
    const w = await open()
    await w.find('.panel-signout').trigger('click')
    await flushPromises()
    expect(await getToken()).toBeNull()
    expect(w.find('#panel-email').exists()).toBe(true)
  })

  it('offers no sign-out before anyone is signed in', async () => {
    const w = await open()
    expect(w.find('.panel-signout').exists()).toBe(false)
  })
})

// ── the copied link ──────────────────────────────────────────────────────────

describe('SidePanel – the link', () => {
  beforeEach(async () => { await setToken(liveToken()) })

  it('parses what was copied, without being asked', async () => {
    await open()
    expect(api.parseJobLink).toHaveBeenCalledWith('https://acme.nl/job/1')
  })

  it('shows which link it is working from', async () => {
    const w = await open()
    expect(w.find('.panel-source').text()).toBe('https://acme.nl/job/1')
  })

  it('hands the parsed values to the form', async () => {
    const w = await open()
    expect((w.find('#panel-company').element as HTMLInputElement).value).toBe('Acme B.V.')
    expect((w.find('#panel-position').element as HTMLInputElement).value).toBe('Senior Backend Engineer')
  })

  it('asks for a paste when nothing useful was copied', async () => {
    clipboard('just some notes')
    const w = await open()
    expect(w.find('#panel-paste').exists()).toBe(true)
    expect(note(w).text()).toContain('Nothing copied that looks like a link')
    expect(api.parseJobLink).not.toHaveBeenCalled()
  })

  it('asks for a paste when the clipboard cannot be read at all', async () => {
    clipboard(null)
    const w = await open()
    expect(w.find('#panel-paste').exists()).toBe(true)
  })

  it('leaves the read button alone until the pasted text is a link', async () => {
    clipboard('nothing useful')
    const w = await open()
    const button = w.find('.panel-paste-actions .btn-primary')
    expect(button.attributes('disabled')).toBeDefined()

    await w.find('#panel-paste').setValue('not a link')
    expect(button.attributes('disabled')).toBeDefined()

    await w.find('#panel-paste').setValue('https://acme.nl/job/2')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('parses a pasted link', async () => {
    clipboard('nothing useful')
    const w = await open()
    await w.find('#panel-paste').setValue('https://acme.nl/job/2')
    await w.find('.panel-paste-actions .btn-primary').trigger('click')
    await flushPromises()
    expect(api.parseJobLink).toHaveBeenCalledWith('https://acme.nl/job/2')
  })

  it('parses a pasted link on Enter too', async () => {
    clipboard('nothing useful')
    const w = await open()
    await w.find('#panel-paste').setValue('https://acme.nl/job/3')
    await w.find('#panel-paste').trigger('keydown.enter')
    await flushPromises()
    expect(api.parseJobLink).toHaveBeenCalledWith('https://acme.nl/job/3')
  })

  it('can be told to look at the clipboard again', async () => {
    clipboard('nothing useful')
    const w = await open()
    clipboard('https://acme.nl/job/4')
    await w.findAll('.panel-paste-actions button')[1].trigger('click')
    await flushPromises()
    expect(api.parseJobLink).toHaveBeenCalledWith('https://acme.nl/job/4')
  })

  it('still offers the form when the link yields nothing', async () => {
    vi.mocked(api.parseJobLink).mockResolvedValue({ company: null, position: null, locations: [], source: 'none' })
    const w = await open()
    expect(note(w).text()).toContain('Could not read anything from that link')
    expect(w.find('#panel-company').exists()).toBe(true)
  })

  it('still offers the form when the parse request fails', async () => {
    vi.mocked(api.parseJobLink).mockRejectedValue(new Error('500 Internal Server Error'))
    const w = await open()
    expect(note(w).text()).toContain('Could not read that link')
    expect(w.find('#panel-company').exists()).toBe(true)
  })

  it('sends the session back to sign-in when the parse says it ended', async () => {
    vi.mocked(api.parseJobLink).mockRejectedValue(new Error('Your session has ended. Sign in again.'))
    const w = await open()
    expect(w.find('#panel-email').exists()).toBe(true)
    expect(note(w).exists()).toBe(false)
  })
})

// ── after saving ─────────────────────────────────────────────────────────────

describe('SidePanel – after saving', () => {
  beforeEach(async () => {
    await setToken(liveToken())
    vi.mocked(api.createApplication).mockResolvedValue({
      id: 'a1', companyName: 'Acme B.V.', position: 'Senior Backend Engineer',
      status: 'Applied', appliedAt: '2026-10-09T00:00:00.000Z',
    })
  })

  async function save(w: Wrapper) {
    await w.find('form button[type="submit"]').trigger('submit')
    await flushPromises()
  }

  it('says what was saved', async () => {
    const w = await open()
    await save(w)
    expect(w.find('.panel-saved-line').text()).toContain('Senior Backend Engineer')
    expect(w.find('.panel-saved-line').text()).toContain('Acme B.V.')
  })

  it('links to the applications page in the app', async () => {
    const w = await open()
    await save(w)
    expect(w.find('.panel-link').attributes('href')).toBe('https://iwwz.nogoibay.org/applications')
  })

  it('opens that link in a tab of its own', async () => {
    const w = await open()
    await save(w)
    expect(w.find('.panel-link').attributes('target')).toBe('_blank')
  })

  it('starts again on Add another, with whatever is copied by then', async () => {
    const w = await open()
    await save(w)
    clipboard('https://acme.nl/job/9')
    await w.find('.panel-saved .btn-primary').trigger('click')
    await flushPromises()
    await flushPromises()
    expect(api.parseJobLink).toHaveBeenLastCalledWith('https://acme.nl/job/9')
  })

  it('refreshes the application list for the next duplicate check', async () => {
    const w = await open()
    await save(w)
    await w.find('.panel-saved .btn-primary').trigger('click')
    await flushPromises()
    expect(api.getApplications).toHaveBeenCalledTimes(2)
  })
})

// ── the duplicate check's own failures ───────────────────────────────────────

describe('SidePanel – when the application list cannot be loaded', () => {
  it('shows the form anyway, since the list only feeds the warning', async () => {
    await setToken(liveToken())
    vi.mocked(api.getApplications).mockRejectedValue(new Error('503 Service Unavailable'))
    const w = await open()
    expect(w.find('#panel-company').exists()).toBe(true)
    expect(w.find('.dup-warning').exists()).toBe(false)
  })
})
