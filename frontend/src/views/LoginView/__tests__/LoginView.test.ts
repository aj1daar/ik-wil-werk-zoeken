import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginView from '../LoginView.vue'

vi.mock('../../../api', () => ({
  api: {
    login:          vi.fn(),
    register:       vi.fn(),
    updateProfile:  vi.fn(),
    changePassword: vi.fn(),
  }
}))

import { api } from '../../../api'

// Standard base64 payload so parseUser (which calls atob) can decode it.
function makeJwt(email = 'test@example.com'): string {
  const b64 = (obj: unknown) => btoa(JSON.stringify(obj))
  const payload = { sub: 'u1', email, firstName: 'Jan', lastName: 'de Vries', exp: 9999999999 }
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.fakesig`
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login',    component: LoginView },
      { path: '/',         component: { template: '<div id="home"/>' } },
      { path: '/register', component: { template: '<div id="register"/>' } },
    ]
  })
}

describe('LoginView', () => {
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof makeRouter>

  beforeEach(async () => {
    sessionStorage.clear()
    pinia  = createPinia()
    setActivePinia(pinia)
    router = makeRouter()
    await router.push('/login')
    vi.clearAllMocks()
  })

  function mountView() {
    return mount(LoginView, { global: { plugins: [pinia, router] } })
  }

  // ── rendering ───────────────────────────────────────────────────────────

  it('renders email input', () => {
    expect(mountView().find('input[type="email"]').exists()).toBe(true)
  })

  it('renders password input via PasswordField', () => {
    expect(mountView().find('input[type="password"]').exists()).toBe(true)
  })

  it('renders a submit button', () => {
    expect(mountView().find('button[type="submit"]').exists()).toBe(true)
  })

  it('renders a link to /register', () => {
    expect(mountView().find('a[href="/register"]').exists()).toBe(true)
  })

  it('no error is shown before first submit', () => {
    expect(mountView().find('.auth-error').exists()).toBe(false)
  })

  // ── disabled state ──────────────────────────────────────────────────────

  it('submit button is disabled when both fields are empty', () => {
    const w = mountView()
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('submit button is disabled when only email is filled', async () => {
    const w = mountView()
    await w.find('input[type="email"]').setValue('a@b.com')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('submit button is disabled when only password is filled', async () => {
    const w = mountView()
    await w.find('#login-password').setValue('pass123')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('submit button is enabled when both fields have values', async () => {
    const w = mountView()
    await w.find('input[type="email"]').setValue('a@b.com')
    await w.find('#login-password').setValue('pass123')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  // ── successful login ─────────────────────────────────────────────────────

  it('calls api.login with trimmed lowercased email and password', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: makeJwt() })
    const w = mountView()
    await w.find('input[type="email"]').setValue('TEST@EXAMPLE.COM')
    await w.find('#login-password').setValue('mypassword')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.login).toHaveBeenCalledWith('test@example.com', 'mypassword')
  })

  it('navigates to / on successful login', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: makeJwt() })
    const w = mountView()
    await w.find('input[type="email"]').setValue('a@b.com')
    await w.find('#login-password').setValue('pass123')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })

  // ── failed login ─────────────────────────────────────────────────────────

  it('shows error message on login failure', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('Bad credentials'))
    const w = mountView()
    await w.find('input[type="email"]').setValue('a@b.com')
    await w.find('#login-password').setValue('wrong')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('.auth-error').exists()).toBe(true)
    expect(w.text()).toContain('Bad credentials')
  })

  it('shows "Incorrect email or password" for Unauthorized error', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('Unauthorized'))
    const w = mountView()
    await w.find('input[type="email"]').setValue('a@b.com')
    await w.find('#login-password').setValue('wrong')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Incorrect email or password')
  })

  it('stays on /login after a failed submission', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('Bad'))
    const w = mountView()
    await w.find('input[type="email"]').setValue('a@b.com')
    await w.find('#login-password').setValue('wrong')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('submit without filling both fields does not call api.login', async () => {
    const w = mountView()
    await w.find('input[type="email"]').setValue('a@b.com')
    // password is empty — guard in submit() returns early
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.login).not.toHaveBeenCalled()
  })
})
