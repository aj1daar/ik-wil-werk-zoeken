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

  it('isAuthenticated is false when no token', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
  })

  it('login sets token and persists to sessionStorage on success', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: 'test-jwt' })
    const store = useAuthStore()
    const err = await store.login('password')
    expect(err).toBeNull()
    expect(store.token).toBe('test-jwt')
    expect(sessionStorage.getItem('token')).toBe('test-jwt')
    expect(store.isAuthenticated).toBe(true)
  })

  it('login returns error message on failure', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('401 Unauthorized'))
    const store = useAuthStore()
    const err = await store.login('wrongpassword')
    expect(err).toBe('401 Unauthorized')
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('login returns generic message when non-Error thrown', async () => {
    vi.mocked(api.login).mockRejectedValue('string error')
    const store = useAuthStore()
    const err = await store.login('x')
    expect(err).toBe('Login failed')
  })

  it('logout clears token and sessionStorage', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: 'test-jwt' })
    const store = useAuthStore()
    await store.login('password')
    store.logout()
    expect(store.token).toBeNull()
    expect(sessionStorage.getItem('token')).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })
})
