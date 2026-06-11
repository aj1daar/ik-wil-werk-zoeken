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

function makeJwt(email = 'new@example.com'): string {
  const b64 = (obj: unknown) => btoa(JSON.stringify(obj))
  const payload = { sub: 'u1', email, firstName: 'Jan', lastName: 'de Vries', exp: 9999999999 }
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.fakesig`
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/register', component: RegisterView },
      { path: '/',         component: { template: '<div id="home"/>' } },
      { path: '/login',    component: { template: '<div id="login"/>' } },
    ]
  })
}

// Fill all required fields. Returns the wrapper for chaining.
async function fillRequired(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('#firstName').setValue('Jan')
  await wrapper.find('#lastName').setValue('de Vries')
  await wrapper.find('#reg-email').setValue('jan@example.com')
  await wrapper.find('#reg-password').setValue('password123')
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

  it('renders GDPR consent checkbox', () => {
    expect(mountView().find('input[type="checkbox"]').exists()).toBe(true)
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

  it('submit button is disabled when gdprConsent is unchecked even if all other fields filled', async () => {
    const w = mountView()
    await fillRequired(w)
    // gdprConsent is still unchecked
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('submit button is enabled when all fields filled and gdprConsent checked', async () => {
    const w = mountView()
    await fillRequired(w)
    await w.find('input[type="checkbox"]').setValue(true)
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('submit button is disabled when firstName is missing', async () => {
    const w = mountView()
    await w.find('#lastName').setValue('de Vries')
    await w.find('#reg-email').setValue('a@b.com')
    await w.find('#reg-password').setValue('pass123')
    await w.find('input[type="checkbox"]').setValue(true)
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  // ── GDPR enforcement ─────────────────────────────────────────────────────

  it('submitting without gdprConsent shows an error without calling api.register', async () => {
    vi.mocked(api.register).mockResolvedValue({ token: makeJwt() })
    const w = mountView()
    await fillRequired(w)
    // Do NOT check consent, force-trigger submit
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.register).not.toHaveBeenCalled()
    expect(w.find('.auth-error').exists()).toBe(true)
  })

  // ── successful registration ──────────────────────────────────────────────

  it('calls api.register with trimmed data and a gdprConsentAt timestamp', async () => {
    vi.mocked(api.register).mockResolvedValue({ token: makeJwt() })
    const w = mountView()
    await w.find('#firstName').setValue('  Jan  ')
    await w.find('#lastName').setValue('  de Vries  ')
    await w.find('#reg-email').setValue('JAN@EXAMPLE.COM')
    await w.find('#reg-password').setValue('password123')
    await w.find('input[type="checkbox"]').setValue(true)
    await w.find('form').trigger('submit')
    await flushPromises()

    const call = vi.mocked(api.register).mock.calls[0][0]
    expect(call.firstName).toBe('Jan')
    expect(call.lastName).toBe('de Vries')
    expect(call.email).toBe('jan@example.com')
    expect(call.password).toBe('password123')
    expect(call.gdprConsentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('navigates to / on successful registration', async () => {
    vi.mocked(api.register).mockResolvedValue({ token: makeJwt() })
    const w = mountView()
    await fillRequired(w)
    await w.find('input[type="checkbox"]').setValue(true)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })

  // ── optional preference fields ───────────────────────────────────────────

  it('includes targetRole in preferences when filled', async () => {
    vi.mocked(api.register).mockResolvedValue({ token: makeJwt() })
    const w = mountView()
    await fillRequired(w)
    await w.find('#targetRole').setValue('Software Engineer')
    await w.find('input[type="checkbox"]').setValue(true)
    await w.find('form').trigger('submit')
    await flushPromises()
    const call = vi.mocked(api.register).mock.calls[0][0]
    expect(call.preferences?.targetRole).toBe('Software Engineer')
  })

  it('targetRole is undefined when left empty', async () => {
    vi.mocked(api.register).mockResolvedValue({ token: makeJwt() })
    const w = mountView()
    await fillRequired(w)
    await w.find('input[type="checkbox"]').setValue(true)
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
    await w.find('input[type="checkbox"]').setValue(true)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('.auth-error').exists()).toBe(true)
    expect(w.text()).toContain('409 Email already in use')
  })

  it('stays on /register after a failed registration', async () => {
    vi.mocked(api.register).mockRejectedValue(new Error('Bad'))
    const w = mountView()
    await fillRequired(w)
    await w.find('input[type="checkbox"]').setValue(true)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/register')
  })
})
