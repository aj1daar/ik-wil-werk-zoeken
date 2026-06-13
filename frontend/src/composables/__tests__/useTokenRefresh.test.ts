import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { useTokenRefresh } from '../useTokenRefresh'
import { useAuthStore } from '../../stores/auth'

vi.mock('../../api', () => ({
  api: {
    refreshToken: vi.fn(),
    getApplications: vi.fn(),
  },
}))

import { api } from '../../api'

const NOW = Math.floor(Date.now() / 1000)

function makeJwt(exp: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o))
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', email: 'a@b.com', exp })}.sig`
}

function mountComposable() {
  const pinia = createPinia()
  setActivePinia(pinia)
  let composable!: ReturnType<typeof useTokenRefresh>
  const Wrapper = defineComponent({
    setup() { composable = useTokenRefresh(); return {} },
    template: '<div />',
  })
  const wrapper = mount(Wrapper, { global: { plugins: [pinia] } })
  const store = useAuthStore()
  return { wrapper, store, get composable() { return composable } }
}

// ── extendSession (doRefresh) ─────────────────────────────────────────────────

describe('useTokenRefresh – extendSession', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('calls api.refreshToken when invoked', async () => {
    vi.mocked(api.refreshToken).mockResolvedValue({ token: makeJwt(NOW + 7200) })
    const { composable, store } = mountComposable()
    store.$patch({ token: makeJwt(NOW + 3600) })
    await composable.extendSession()
    await flushPromises()
    expect(api.refreshToken).toHaveBeenCalledOnce()
  })

  it('updates sessionStorage with the new token', async () => {
    const newToken = makeJwt(NOW + 7 * 86400)
    vi.mocked(api.refreshToken).mockResolvedValue({ token: newToken })
    const { composable, store } = mountComposable()
    store.$patch({ token: makeJwt(NOW + 3600) })
    await composable.extendSession()
    await flushPromises()
    expect(sessionStorage.getItem('token')).toBe(newToken)
  })

  it('updates auth.token with the new token', async () => {
    const newToken = makeJwt(NOW + 7 * 86400)
    vi.mocked(api.refreshToken).mockResolvedValue({ token: newToken })
    const { composable, store } = mountComposable()
    store.$patch({ token: makeJwt(NOW + 3600) })
    await composable.extendSession()
    await flushPromises()
    expect(store.token).toBe(newToken)
  })

  it('sets refreshError when api.refreshToken throws', async () => {
    vi.mocked(api.refreshToken).mockRejectedValue(new Error('Token is invalid or has expired.'))
    const { composable, store } = mountComposable()
    store.$patch({ token: makeJwt(NOW + 3600) })
    await composable.extendSession()
    await flushPromises()
    expect(composable.refreshError.value).toBe('Token is invalid or has expired.')
  })

  it('clears refreshError on a subsequent successful refresh', async () => {
    vi.mocked(api.refreshToken)
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValueOnce({ token: makeJwt(NOW + 7200) })
    const { composable, store } = mountComposable()
    store.$patch({ token: makeJwt(NOW + 3600) })
    await composable.extendSession()
    await flushPromises()
    expect(composable.refreshError.value).toBeTruthy()
    await composable.extendSession()
    await flushPromises()
    expect(composable.refreshError.value).toBeNull()
  })

  it('does not call api.refreshToken when auth.token is null', async () => {
    const { composable, store } = mountComposable()
    store.$patch({ token: null })
    await composable.extendSession()
    await flushPromises()
    expect(api.refreshToken).not.toHaveBeenCalled()
  })

  it('does not make a second concurrent request while one is in flight', async () => {
    let resolve!: (v: { token: string }) => void
    vi.mocked(api.refreshToken).mockReturnValue(new Promise(r => { resolve = r }))
    const { composable, store } = mountComposable()
    store.$patch({ token: makeJwt(NOW + 3600) })
    composable.extendSession()
    composable.extendSession()
    expect(composable.refreshing.value).toBe(true)
    resolve({ token: makeJwt(NOW + 7200) })
    await flushPromises()
    expect(api.refreshToken).toHaveBeenCalledTimes(1)
  })
})

// ── refreshing state ──────────────────────────────────────────────────────────

describe('useTokenRefresh – refreshing state', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshing is false initially', () => {
    const { composable } = mountComposable()
    expect(composable.refreshing.value).toBe(false)
  })

  it('refreshing is true while the request is in flight', async () => {
    let resolve!: (v: { token: string }) => void
    vi.mocked(api.refreshToken).mockReturnValue(new Promise(r => { resolve = r }))
    const { composable, store } = mountComposable()
    store.$patch({ token: makeJwt(NOW + 3600) })
    composable.extendSession()
    expect(composable.refreshing.value).toBe(true)
    resolve({ token: makeJwt(NOW + 7200) })
    await flushPromises()
    expect(composable.refreshing.value).toBe(false)
  })

  it('refreshing returns to false after a failed request', async () => {
    vi.mocked(api.refreshToken).mockRejectedValue(new Error('oops'))
    const { composable, store } = mountComposable()
    store.$patch({ token: makeJwt(NOW + 3600) })
    await composable.extendSession()
    await flushPromises()
    expect(composable.refreshing.value).toBe(false)
  })
})

// ── initial state ─────────────────────────────────────────────────────────────

describe('useTokenRefresh – initial state', () => {
  it('refreshError is null initially', () => {
    const { composable } = mountComposable()
    expect(composable.refreshError.value).toBeNull()
  })

  it('exposes extendSession as a function', () => {
    const { composable } = mountComposable()
    expect(typeof composable.extendSession).toBe('function')
  })
})

// ── activity listeners ────────────────────────────────────────────────────────

describe('useTokenRefresh – activity listeners', () => {
  it('adds mousemove and keydown listeners on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    mountComposable()
    const events = addSpy.mock.calls.map(c => c[0])
    expect(events).toContain('mousemove')
    expect(events).toContain('keydown')
  })

  it('removes mousemove and keydown listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { wrapper } = mountComposable()
    wrapper.unmount()
    const events = removeSpy.mock.calls.map(c => c[0])
    expect(events).toContain('mousemove')
    expect(events).toContain('keydown')
  })
})

// ── interval ──────────────────────────────────────────────────────────────────

describe('useTokenRefresh – interval', () => {
  it('clears the interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { wrapper } = mountComposable()
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})
