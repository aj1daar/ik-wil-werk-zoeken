import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'

vi.mock('../../api', () => ({
  api: {
    login: vi.fn()
  }
}))

import { api } from '../../api'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  // ── initial state ────────────────────────────────────────────────────────

  it('isAuthenticated is false when no token in sessionStorage', () => {
    expect(useAuthStore().isAuthenticated).toBe(false)
  })

  it('isAuthenticated is false when sessionStorage token is empty string', () => {
    sessionStorage.setItem('token', '')
    // empty string is falsy — store should not consider it authenticated
    setActivePinia(createPinia())
    expect(useAuthStore().isAuthenticated).toBe(false)
  })

  it('isAuthenticated is true when a non-empty token exists in sessionStorage', () => {
    sessionStorage.setItem('token', 'some.jwt.token')
    setActivePinia(createPinia())
    expect(useAuthStore().isAuthenticated).toBe(true)
  })

  // ── login – success paths ────────────────────────────────────────────────

  it('login sets token and persists to sessionStorage on success', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: 'test-jwt' })
    const store = useAuthStore()
    const err = await store.login('password')
    expect(err).toBeNull()
    expect(store.token).toBe('test-jwt')
    expect(sessionStorage.getItem('token')).toBe('test-jwt')
    expect(store.isAuthenticated).toBe(true)
  })

  it('second login replaces the existing token', async () => {
    vi.mocked(api.login).mockResolvedValueOnce({ token: 'first-jwt' })
    vi.mocked(api.login).mockResolvedValueOnce({ token: 'second-jwt' })
    const store = useAuthStore()
    await store.login('pass')
    await store.login('pass')
    expect(store.token).toBe('second-jwt')
    expect(sessionStorage.getItem('token')).toBe('second-jwt')
  })

  // ── login – failure paths ─────────────────────────────────────────────────

  it('login returns error message on network / server failure', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('401 Unauthorized'))
    const store = useAuthStore()
    const err = await store.login('wrongpassword')
    expect(err).toBe('401 Unauthorized')
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('login returns generic message when non-Error is thrown', async () => {
    vi.mocked(api.login).mockRejectedValue('string error')
    expect(await useAuthStore().login('x')).toBe('Login failed')
  })

  it('login failure does not touch sessionStorage', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('Network error'))
    await useAuthStore().login('bad')
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('login failure after a successful login keeps previous token intact in sessionStorage', async () => {
    vi.mocked(api.login).mockResolvedValueOnce({ token: 'good-jwt' })
    vi.mocked(api.login).mockRejectedValueOnce(new Error('Bad'))
    const store = useAuthStore()
    await store.login('correct')
    await store.login('wrong')
    // The store token is still the one from the first login
    expect(store.token).toBe('good-jwt')
    expect(sessionStorage.getItem('token')).toBe('good-jwt')
  })

  // ── login – malformed server response ───────────────────────────────────

  it('login with empty-string token from API sets isAuthenticated to false', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: '' })
    const store = useAuthStore()
    await store.login('pass')
    // empty string is falsy — should not be authenticated
    expect(store.isAuthenticated).toBe(false)
  })

  // ── logout ────────────────────────────────────────────────────────────────

  it('logout clears token and sessionStorage', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: 'test-jwt' })
    const store = useAuthStore()
    await store.login('password')
    store.logout()
    expect(store.token).toBeNull()
    expect(sessionStorage.getItem('token')).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('logout when already logged out is a no-op', () => {
    const store = useAuthStore()
    expect(() => store.logout()).not.toThrow()
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('logout called twice does not throw', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: 'test-jwt' })
    const store = useAuthStore()
    await store.login('pass')
    store.logout()
    expect(() => store.logout()).not.toThrow()
    expect(store.isAuthenticated).toBe(false)
  })
})
