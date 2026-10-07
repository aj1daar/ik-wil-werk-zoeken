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

// ── the sliding twelve-hour window ───────────────────────────────────────────

describe('useTokenRefresh – sliding the session window', () => {
  const HOUR = 3600
  const CHECK_INTERVAL_MS = 5 * 60 * 1000

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(api.refreshToken).mockResolvedValue({ token: makeJwt(NOW + 12 * HOUR) } as never)
  })
  afterEach(() => vi.useRealTimers())

  // The composable only acts on its own interval, so a test has to let one tick.
  async function tick(times = 1) {
    for (let i = 0; i < times; i++) {
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
      await flushPromises()
    }
  }

  function withToken(secondsRemaining: number) {
    const mounted = mountComposable()
    mounted.store.$patch({ token: makeJwt(Math.floor(Date.now() / 1000) + secondsRemaining) })
    return mounted
  }

  it('leaves a session alone while more than eleven hours are left', async () => {
    const { wrapper } = withToken(12 * HOUR)
    window.dispatchEvent(new Event('keydown'))
    await tick()

    expect(api.refreshToken).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('slides the window once the session drops below eleven hours', async () => {
    // An hour of use, so the token is renewed and the twelve hours start again
    // from now rather than from signing in.
    const { wrapper } = withToken(10 * HOUR)
    window.dispatchEvent(new Event('keydown'))
    await tick()

    expect(api.refreshToken).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('stops sliding the window once someone walks away', async () => {
    const { wrapper } = withToken(2 * HOUR)

    // Mounting counts as activity, so the first tick still renews. After that
    // nothing happens on the page and the window stops moving, which is what
    // ends the session twelve hours after the last thing the user did.
    await tick()
    const afterFirst = vi.mocked(api.refreshToken).mock.calls.length
    await tick(4)

    expect(vi.mocked(api.refreshToken).mock.calls.length).toBe(afterFirst)
    wrapper.unmount()
  })

  it('counts a touch as activity, so a phone session does not expire while reading', async () => {
    const { wrapper } = withToken(10 * HOUR)
    window.dispatchEvent(new Event('touchstart'))
    await tick()

    expect(api.refreshToken).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('counts scrolling as activity too', async () => {
    const { wrapper } = withToken(10 * HOUR)
    window.dispatchEvent(new Event('scroll'))
    await tick()

    expect(api.refreshToken).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('leaves an expired session to the API rather than refreshing it', async () => {
    const { wrapper } = withToken(-60)
    window.dispatchEvent(new Event('keydown'))
    await tick()

    expect(api.refreshToken).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps sliding for as long as someone keeps working', async () => {
    const { wrapper } = withToken(10 * HOUR)

    for (let i = 0; i < 3; i++) {
      // Each refreshed token comes back with less time left than the threshold,
      // so a further tick with activity renews it again.
      vi.mocked(api.refreshToken).mockResolvedValue({ token: makeJwt(Math.floor(Date.now() / 1000) + 10 * HOUR) } as never)
      window.dispatchEvent(new Event('mousemove'))
      await tick()
    }

    expect(api.refreshToken).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })
})

describe('useTokenRefresh – interval', () => {
  it('clears the interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { wrapper } = mountComposable()
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})
