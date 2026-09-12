import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import ConfirmEmailChangeView from '../ConfirmEmailChangeView.vue'
import { useAuthStore } from '../../../stores/auth'

vi.mock('../../../api', () => ({ api: { confirmEmailChange: vi.fn() } }))

import { api } from '../../../api'

// A JWT the store can actually parse: only the payload segment matters.
function tokenFor(email: string) {
  const payload = btoa(JSON.stringify({ sub: 'u1', email, role: 'user' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `header.${payload}.signature`
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/confirm-email-change', component: { template: '<div/>' } },
      { path: '/profile', component: { template: '<div/>' } },
    ],
  })
}

async function mountAt(url: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = makeRouter()
  await router.push(url)
  await router.isReady()
  const wrapper = mount(ConfirmEmailChangeView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, auth: useAuthStore() }
}

const TOKEN = 'user-1.1789000000.abc123'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  sessionStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('ConfirmEmailChangeView – confirming', () => {
  it('confirms with the token from the link and names the new address', async () => {
    vi.mocked(api.confirmEmailChange).mockResolvedValue({ token: tokenFor('new@example.com') } as never)
    const { wrapper } = await mountAt(`/confirm-email-change?token=${TOKEN}`)

    expect(api.confirmEmailChange).toHaveBeenCalledWith(TOKEN)
    expect(wrapper.find('.state-msg--ok').text()).toContain('updated to new@example.com')
  })

  it('swaps in the session that carries the new address', async () => {
    const token = tokenFor('new@example.com')
    vi.mocked(api.confirmEmailChange).mockResolvedValue({ token } as never)
    const { auth } = await mountAt(`/confirm-email-change?token=${TOKEN}`)

    expect(auth.token).toBe(token)
    expect(auth.user?.email).toBe('new@example.com')
    expect(sessionStorage.getItem('token')).toBe(token)
  })

  it('returns the user to their profile afterwards', async () => {
    vi.mocked(api.confirmEmailChange).mockResolvedValue({ token: tokenFor('new@example.com') } as never)
    const { router } = await mountAt(`/confirm-email-change?token=${TOKEN}`)

    expect(router.currentRoute.value.path).toBe('/confirm-email-change')
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/profile')
  })
})

describe('ConfirmEmailChangeView – links that do not work', () => {
  it('explains a link with no token and asks for a new one', async () => {
    const { wrapper } = await mountAt('/confirm-email-change')

    expect(api.confirmEmailChange).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('No confirmation token found in the link')
  })

  it('shows why the server refused and stays put', async () => {
    vi.mocked(api.confirmEmailChange).mockRejectedValue(new Error('This confirmation link has expired'))
    const { wrapper, router, auth } = await mountAt(`/confirm-email-change?token=${TOKEN}`)

    expect(wrapper.text()).toContain('This confirmation link has expired')
    expect(auth.token).toBeNull()

    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/confirm-email-change')
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    vi.mocked(api.confirmEmailChange).mockRejectedValue('nope')
    const { wrapper } = await mountAt(`/confirm-email-change?token=${TOKEN}`)
    expect(wrapper.text()).toContain('Email confirmation failed')
  })
})
