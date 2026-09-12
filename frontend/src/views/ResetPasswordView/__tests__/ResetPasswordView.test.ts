import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import ResetPasswordView from '../ResetPasswordView.vue'

vi.mock('../../../api', () => ({ api: { resetPassword: vi.fn() } }))

import { api } from '../../../api'

type Wrapper = ReturnType<typeof mount>

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reset-password', component: { template: '<div/>' } },
      { path: '/login', component: { template: '<div/>' } },
    ],
  })
}

async function mountAt(url: string) {
  const router = makeRouter()
  await router.push(url)
  await router.isReady()
  const wrapper = mount(ResetPasswordView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

async function submit(wrapper: Wrapper, next: string, confirm: string) {
  await wrapper.find('#new-password').setValue(next)
  await wrapper.find('#confirm-password').setValue(confirm)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

const TOKEN = 'user-1.1789000000.abc123'

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('ResetPasswordView – the link itself', () => {
  it('sends anyone arriving without a token back to sign in', async () => {
    const { router } = await mountAt('/reset-password')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('stays put when the link carries a token', async () => {
    const { router } = await mountAt(`/reset-password?token=${TOKEN}`)
    expect(router.currentRoute.value.path).toBe('/reset-password')
  })

  it('passes the token through exactly as it arrived', async () => {
    vi.mocked(api.resetPassword).mockResolvedValue(undefined as never)
    const { wrapper } = await mountAt(`/reset-password?token=${TOKEN}`)
    await submit(wrapper, 'new-password', 'new-password')
    expect(api.resetPassword).toHaveBeenCalledWith(TOKEN, 'new-password')
  })
})

describe('ResetPasswordView – setting the password', () => {
  it('refuses a mismatch without calling the API', async () => {
    const { wrapper } = await mountAt(`/reset-password?token=${TOKEN}`)
    await submit(wrapper, 'new-password-1', 'new-password-2')

    expect(api.resetPassword).not.toHaveBeenCalled()
    expect(wrapper.find('.auth-error').text()).toBe('Passwords do not match')
    expect(wrapper.find('#confirm-password').attributes('aria-invalid')).toBe('true')
  })

  it('stays disabled until both fields are filled', async () => {
    const { wrapper } = await mountAt(`/reset-password?token=${TOKEN}`)
    const button = () => wrapper.find('button[type="submit"]')
    expect(button().attributes('disabled')).toBeDefined()

    await wrapper.find('#new-password').setValue('new-password')
    expect(button().attributes('disabled')).toBeDefined()

    await wrapper.find('#confirm-password').setValue('new-password')
    expect(button().attributes('disabled')).toBeUndefined()
  })

  it('sends the user to sign in and leaves a note that the reset worked', async () => {
    vi.mocked(api.resetPassword).mockResolvedValue(undefined as never)
    const { wrapper, router } = await mountAt(`/reset-password?token=${TOKEN}`)
    await submit(wrapper, 'new-password', 'new-password')

    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionStorage.getItem('passwordReset')).toBe('1')
  })

  it('reports an expired or reused link and stays on the page', async () => {
    vi.mocked(api.resetPassword).mockRejectedValue(new Error('This reset link has expired'))
    const { wrapper, router } = await mountAt(`/reset-password?token=${TOKEN}`)
    await submit(wrapper, 'new-password', 'new-password')

    expect(wrapper.find('.auth-error').text()).toBe('This reset link has expired')
    expect(wrapper.find('.auth-error').attributes('role')).toBe('alert')
    expect(router.currentRoute.value.path).toBe('/reset-password')
    expect(sessionStorage.getItem('passwordReset')).toBeNull()
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    vi.mocked(api.resetPassword).mockRejectedValue('nope')
    const { wrapper } = await mountAt(`/reset-password?token=${TOKEN}`)
    await submit(wrapper, 'new-password', 'new-password')
    expect(wrapper.find('.auth-error').text()).toBe('Could not reset password. The link may have expired.')
  })

  it('does not write the new password into the markup', async () => {
    vi.mocked(api.resetPassword).mockResolvedValue(undefined as never)
    const { wrapper } = await mountAt(`/reset-password?token=${TOKEN}`)
    await submit(wrapper, 'hunter2-hunter2', 'hunter2-hunter2')
    expect(wrapper.html()).not.toContain('hunter2-hunter2')
  })
})
