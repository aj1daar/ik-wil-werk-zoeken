import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import VerifyEmailView from '../VerifyEmailView.vue'
import { useAuthStore } from '../../../stores/auth'

vi.mock('../../../api', () => ({
  api: { verifyEmail: vi.fn(), resendVerification: vi.fn() },
}))

import { api } from '../../../api'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/verify-email', component: { template: '<div/>' } },
      { path: '/login', component: { template: '<div/>' } },
    ],
  })
}

async function mountAt(url: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = makeRouter()
  await router.push(url)
  await router.isReady()
  const wrapper = mount(VerifyEmailView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, auth: useAuthStore() }
}

const TOKEN = 'user-1.1789000000.abc123'
// A token whose payload is not a real JWT is fine: the store only has to
// store it, and the view only has to change state.
const SESSION_TOKEN = 'header.eyJ1c2VySWQiOiJ1MSJ9.sig'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  sessionStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('VerifyEmailView – arriving from the email', () => {
  it('verifies with the token in the link', async () => {
    vi.mocked(api.verifyEmail).mockResolvedValue({ token: SESSION_TOKEN } as never)
    const { wrapper } = await mountAt(`/verify-email?token=${TOKEN}`)

    expect(api.verifyEmail).toHaveBeenCalledWith(TOKEN)
    expect(wrapper.text()).toContain('Email verified')
    expect(wrapper.text()).toContain('Signing you in')
  })

  it('signs the user in and moves on to the dashboard', async () => {
    vi.mocked(api.verifyEmail).mockResolvedValue({ token: SESSION_TOKEN } as never)
    const { router, auth } = await mountAt(`/verify-email?token=${TOKEN}`)

    expect(auth.token).toBe(SESSION_TOKEN)
    expect(sessionStorage.getItem('token')).toBe(SESSION_TOKEN)

    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('says the link is unusable when it carries no token', async () => {
    const { wrapper } = await mountAt('/verify-email')
    expect(api.verifyEmail).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Invalid link')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('offers a fresh link when the token is expired or already used', async () => {
    vi.mocked(api.verifyEmail).mockRejectedValue(new Error('This verification link has expired'))
    const { wrapper, auth } = await mountAt(`/verify-email?token=${TOKEN}`)

    expect(wrapper.text()).toContain('Link expired')
    expect(wrapper.find('form').exists()).toBe(true)
    expect(auth.token).toBeNull()
  })
})

describe('VerifyEmailView – asking for another link', () => {
  async function mountExpired() {
    vi.mocked(api.verifyEmail).mockRejectedValue(new Error('This verification link has expired'))
    return mountAt(`/verify-email?token=${TOKEN}`)
  }

  it('normalises the address before resending', async () => {
    vi.mocked(api.resendVerification).mockResolvedValue(undefined as never)
    const { wrapper } = await mountExpired()

    await wrapper.find('#resend-email').setValue('  SOMEONE@Example.COM  ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.resendVerification).toHaveBeenCalledWith('someone@example.com')
  })

  it('stays disabled until an address is typed', async () => {
    const { wrapper } = await mountExpired()
    const button = () => wrapper.find('button[type="submit"]')
    expect(button().attributes('disabled')).toBeDefined()
    await wrapper.find('#resend-email').setValue('someone@example.com')
    expect(button().attributes('disabled')).toBeUndefined()
  })

  it('says the same thing whether or not the account exists', async () => {
    vi.mocked(api.resendVerification).mockRejectedValue(new Error('No such user'))
    const { wrapper } = await mountExpired()

    await wrapper.find('#resend-email').setValue('nobody@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.resend-sent').text()).toContain('If an account with that email exists')
    expect(wrapper.text()).not.toContain('No such user')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
