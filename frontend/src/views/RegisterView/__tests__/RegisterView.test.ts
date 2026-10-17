import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegisterView from '../RegisterView.vue'
import { PRIVACY_VERSION } from '../../../utils/privacy'

vi.mock('../../../api', () => ({
  api: {
    login:          vi.fn(),
    register:       vi.fn(),
    updateProfile:  vi.fn(),
    changePassword: vi.fn(),
  }
}))

import { api } from '../../../api'


function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/register',       component: RegisterView },
      { path: '/',               component: { template: '<div id="home"/>' } },
      { path: '/login',          component: { template: '<div id="login"/>' } },
      { path: '/forgot-password', component: { template: '<div id="forgot"/>' } },
      { path: '/privacy',        component: { template: '<div id="privacy"/>' } },
      { path: '/terms',          component: { template: '<div id="terms"/>' } },
    ]
  })
}

// An address and a password, which is all registration asks for.
async function fillRequired(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('#reg-email').setValue('jan@example.com')
  await wrapper.find('#reg-password').setValue('password123')
  await wrapper.find('#reg-confirm-password').setValue('password123')
}

describe('RegisterView', () => {
  let pinia:  ReturnType<typeof createPinia>
  let router: ReturnType<typeof makeRouter>

  beforeEach(async () => {
    sessionStorage.clear()
    pinia  = createPinia()
    setActivePinia(pinia)
    router = makeRouter()
    await router.push('/register')
    vi.clearAllMocks()
  })

  function mountView() {
    return mount(RegisterView, { global: { plugins: [pinia, router] } })
  }

  // ── rendering ───────────────────────────────────────────────────────────

  it('asks for no name', () => {
    const w = mountView()
    expect(w.find('#firstName').exists()).toBe(false)
    expect(w.find('#lastName').exists()).toBe(false)
  })

  it('asks for no job-search preferences', () => {
    const w = mountView()
    expect(w.find('#targetRole').exists()).toBe(false)
    expect(w.find('#location').exists()).toBe(false)
    expect(w.find('#workType').exists()).toBe(false)
  })

  it('says what creating an account means, and links the notice', () => {
    const w = mountView()
    expect(w.text()).toContain('privacy notice')
    expect(w.text()).toContain('terms of service')
    expect(w.find('a[href="/privacy"]').exists()).toBe(true)
    expect(w.find('a[href="/terms"]').exists()).toBe(true)
  })

  it('renders email input', () => {
    expect(mountView().find('#reg-email').exists()).toBe(true)
  })

  it('renders password input via PasswordField', () => {
    expect(mountView().find('#reg-password').exists()).toBe(true)
  })

  it('renders a submit button', () => {
    expect(mountView().find('button[type="submit"]').exists()).toBe(true)
  })

  it('renders link to /login', () => {
    expect(mountView().find('a[href="/login"]').exists()).toBe(true)
  })

  it('no error shown before first submit', () => {
    expect(mountView().find('.auth-error').exists()).toBe(false)
  })

  // ── submit button disabled state ────────────────────────────────────────

  it('submit button is disabled when all fields are empty', () => {
    expect(mountView().find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('submit button is enabled when all required fields are filled', async () => {
    const w = mountView()
    await fillRequired(w)
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('submit button is disabled when the address is missing', async () => {
    const w = mountView()
    await w.find('#reg-password').setValue('password123')
    await w.find('#reg-confirm-password').setValue('password123')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('submit button is disabled when password is shorter than 8 characters', async () => {
    const w = mountView()
    await w.find('#reg-email').setValue('jan@example.com')
    await w.find('#reg-password').setValue('short')
    await w.find('#reg-confirm-password').setValue('short')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows password requirement hint only after typing', async () => {
    const w = mountView()
    expect(w.find('.pw-reqs').exists()).toBe(false)
    await w.find('#reg-password').setValue('ab')
    expect(w.find('.pw-reqs').exists()).toBe(true)
    expect(w.find('.req-fail').exists()).toBe(true)
    await w.find('#reg-password').setValue('password123')
    expect(w.find('.req-ok').exists()).toBe(true)
  })

  // ── successful registration ──────────────────────────────────────────────

  it('sends the address, the password, the moment of agreement and the notice version', async () => {
    vi.mocked(api.register).mockResolvedValue(undefined)
    const w = mountView()
    await w.find('#reg-email').setValue('JAN@EXAMPLE.COM')
    await w.find('#reg-password').setValue('password123')
    await w.find('#reg-confirm-password').setValue('password123')
    await w.find('form').trigger('submit')
    await flushPromises()

    const call = vi.mocked(api.register).mock.calls[0][0]
    expect(call.email).toBe('jan@example.com')
    expect(call.password).toBe('password123')
    expect(call.gdprConsentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(call.privacyVersion).toBe(PRIVACY_VERSION)
  })

  it('sends nothing it was not asked for', async () => {
    vi.mocked(api.register).mockResolvedValue(undefined)
    const w = mountView()
    await fillRequired(w)
    await w.find('form').trigger('submit')
    await flushPromises()

    const call = vi.mocked(api.register).mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(call).sort()).toEqual(['email', 'gdprConsentAt', 'password', 'privacyVersion'])
  })

  it('shows "check your inbox" screen on successful registration', async () => {
    vi.mocked(api.register).mockResolvedValue(undefined)
    const w = mountView()
    await fillRequired(w)
    await w.find('form').trigger('submit')
    await flushPromises()
    // No redirect — user must verify email first
    expect(router.currentRoute.value.path).toBe('/register')
    expect(w.text()).toContain('Check your inbox')
  })

  // ── failed registration ──────────────────────────────────────────────────

  it('shows error message on registration failure', async () => {
    vi.mocked(api.register).mockRejectedValue(new Error('409 Email already in use'))
    const w = mountView()
    await fillRequired(w)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('.auth-error').exists()).toBe(true)
    expect(w.text()).toContain('409 Email already in use')
  })

  it('shows sign-in and reset links when email is already registered', async () => {
    vi.mocked(api.register).mockRejectedValue(new Error('An account with this email already exists'))
    const w = mountView()
    await fillRequired(w)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('This email is already registered')
    expect(w.find('a[href="/login"]').exists()).toBe(true)
    expect(w.find('a[href="/forgot-password"]').exists()).toBe(true)
  })

  it('stays on /register after a failed registration', async () => {
    vi.mocked(api.register).mockRejectedValue(new Error('Bad'))
    const w = mountView()
    await fillRequired(w)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/register')
  })
})
