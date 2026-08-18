import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegisterView from '../RegisterView.vue'

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
    ]
  })
}

// Fill all required fields. Returns the wrapper for chaining.
async function fillRequired(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('#firstName').setValue('Jan')
  await wrapper.find('#lastName').setValue('de Vries')
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

  it('renders firstName input', () => {
    expect(mountView().find('#firstName').exists()).toBe(true)
  })

  it('renders lastName input', () => {
    expect(mountView().find('#lastName').exists()).toBe(true)
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

  it('submit button is disabled when firstName is missing', async () => {
    const w = mountView()
    await w.find('#lastName').setValue('de Vries')
    await w.find('#reg-email').setValue('a@b.com')
    await w.find('#reg-password').setValue('pass123')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('submit button is disabled when password is shorter than 8 characters', async () => {
    const w = mountView()
    await w.find('#firstName').setValue('Jan')
    await w.find('#lastName').setValue('de Vries')
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

  it('calls api.register with trimmed data and a gdprConsentAt timestamp', async () => {
    vi.mocked(api.register).mockResolvedValue(undefined)
    const w = mountView()
    await w.find('#firstName').setValue('  Jan  ')
    await w.find('#lastName').setValue('  de Vries  ')
    await w.find('#reg-email').setValue('JAN@EXAMPLE.COM')
    await w.find('#reg-password').setValue('password123')
    await w.find('#reg-confirm-password').setValue('password123')
    await w.find('form').trigger('submit')
    await flushPromises()

    const call = vi.mocked(api.register).mock.calls[0][0]
    expect(call.firstName).toBe('Jan')
    expect(call.lastName).toBe('de Vries')
    expect(call.email).toBe('jan@example.com')
    expect(call.password).toBe('password123')
    expect(call.gdprConsentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
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

  // ── optional preference fields ───────────────────────────────────────────

  it('includes targetRole in preferences when filled', async () => {
    vi.mocked(api.register).mockResolvedValue(undefined)
    const w = mountView()
    await fillRequired(w)
    await w.find('#targetRole').setValue('Software Engineer')
    await w.find('form').trigger('submit')
    await flushPromises()
    const call = vi.mocked(api.register).mock.calls[0][0]
    expect(call.preferences?.targetRole).toBe('Software Engineer')
  })

  it('targetRole is undefined when left empty', async () => {
    vi.mocked(api.register).mockResolvedValue(undefined)
    const w = mountView()
    await fillRequired(w)
    await w.find('form').trigger('submit')
    await flushPromises()
    const call = vi.mocked(api.register).mock.calls[0][0]
    expect(call.preferences?.targetRole).toBeUndefined()
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
