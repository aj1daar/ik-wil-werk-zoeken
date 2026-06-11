import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'

vi.mock('../../api', () => ({
  api: {
    login:          vi.fn(),
    register:       vi.fn(),
    updateProfile:  vi.fn(),
    changePassword: vi.fn(),
    deleteAccount:  vi.fn(),
  }
}))

import { api } from '../../api'

// Build a decodable JWT. parseUser now handles both URL-safe and standard base64, but tests
// use standard btoa so the payload values are predictable and stable.
function makeJwt(overrides: Record<string, unknown> = {}): string {
  const payload = {
    sub:         'user-123',
    email:       'test@example.com',
    firstName:   'Jan',
    lastName:    'de Vries',
    preferences: { targetRole: null, location: null, workType: 'any' },
    exp:         Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  }
  const b64 = (obj: unknown) => btoa(JSON.stringify(obj))
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.fakesig`
}

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

  it('user is null when no token in sessionStorage', () => {
    expect(useAuthStore().user).toBeNull()
  })

  it('isAuthenticated is false when sessionStorage token is empty string', () => {
    sessionStorage.setItem('token', '')
    setActivePinia(createPinia())
    expect(useAuthStore().isAuthenticated).toBe(false)
  })

  it('isAuthenticated is true when a non-empty token exists in sessionStorage', () => {
    sessionStorage.setItem('token', 'some.jwt.token')
    setActivePinia(createPinia())
    expect(useAuthStore().isAuthenticated).toBe(true)
  })

  it('user is populated from JWT in sessionStorage on store init', () => {
    sessionStorage.setItem('token', makeJwt({ email: 'stored@example.com', sub: 'stored-id' }))
    setActivePinia(createPinia())
    const store = useAuthStore()
    expect(store.user?.email).toBe('stored@example.com')
    expect(store.user?.userId).toBe('stored-id')
  })

  it('user is null when sessionStorage token is not a valid JWT', () => {
    sessionStorage.setItem('token', 'not-a-jwt-at-all')
    setActivePinia(createPinia())
    const store = useAuthStore()
    // token is truthy so isAuthenticated is true, but user decoding fails
    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toBeNull()
  })

  // ── login – success paths ────────────────────────────────────────────────

  it('login sets token and persists to sessionStorage on success', async () => {
    const jwt = makeJwt()
    vi.mocked(api.login).mockResolvedValue({ token: jwt })
    const store = useAuthStore()
    const err = await store.login('test@example.com', 'password')
    expect(err).toBeNull()
    expect(store.token).toBe(jwt)
    expect(sessionStorage.getItem('token')).toBe(jwt)
    expect(store.isAuthenticated).toBe(true)
  })

  it('login populates user fields from the returned JWT', async () => {
    const jwt = makeJwt({ email: 'jan@example.nl', sub: 'jan-id', firstName: 'Jan', lastName: 'Bakker' })
    vi.mocked(api.login).mockResolvedValue({ token: jwt })
    const store = useAuthStore()
    await store.login('jan@example.nl', 'pass')
    expect(store.user?.email).toBe('jan@example.nl')
    expect(store.user?.userId).toBe('jan-id')
    expect(store.user?.firstName).toBe('Jan')
    expect(store.user?.lastName).toBe('Bakker')
  })

  it('second login replaces the existing token and user', async () => {
    const jwt1 = makeJwt({ email: 'first@example.com', sub: 'id-1' })
    const jwt2 = makeJwt({ email: 'second@example.com', sub: 'id-2' })
    vi.mocked(api.login)
      .mockResolvedValueOnce({ token: jwt1 })
      .mockResolvedValueOnce({ token: jwt2 })
    const store = useAuthStore()
    await store.login('first@example.com', 'pass')
    await store.login('second@example.com', 'pass')
    expect(store.token).toBe(jwt2)
    expect(store.user?.email).toBe('second@example.com')
    expect(sessionStorage.getItem('token')).toBe(jwt2)
  })

  // ── login – failure paths ─────────────────────────────────────────────────

  it('login returns error message on network / server failure', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('401 Unauthorized'))
    const store = useAuthStore()
    const err = await store.login('user@example.com', 'wrongpassword')
    expect(err).toBe('401 Unauthorized')
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('login returns generic message when non-Error is thrown', async () => {
    vi.mocked(api.login).mockRejectedValue('string error')
    expect(await useAuthStore().login('a@b.com', 'x')).toBe('Login failed')
  })

  it('login failure does not touch sessionStorage', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('Network error'))
    await useAuthStore().login('a@b.com', 'bad')
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('login failure after a successful login keeps the previous token intact', async () => {
    const jwt = makeJwt()
    vi.mocked(api.login)
      .mockResolvedValueOnce({ token: jwt })
      .mockRejectedValueOnce(new Error('Bad credentials'))
    const store = useAuthStore()
    await store.login('a@b.com', 'correct')
    await store.login('a@b.com', 'wrong')
    expect(store.token).toBe(jwt)
    expect(sessionStorage.getItem('token')).toBe(jwt)
  })

  // ── login – malformed server response ───────────────────────────────────

  it('login with empty-string token from API does not set isAuthenticated', async () => {
    vi.mocked(api.login).mockResolvedValue({ token: '' })
    const store = useAuthStore()
    await store.login('a@b.com', 'pass')
    expect(store.isAuthenticated).toBe(false)
  })

  // ── register ──────────────────────────────────────────────────────────────

  it('register sets token and user on success', async () => {
    const jwt = makeJwt({ email: 'new@example.com', sub: 'new-id' })
    vi.mocked(api.register).mockResolvedValue({ token: jwt })
    const store = useAuthStore()
    const err = await store.register({
      firstName: 'New', lastName: 'User',
      email: 'new@example.com', password: 'password123',
      gdprConsentAt: new Date().toISOString(),
    })
    expect(err).toBeNull()
    expect(store.token).toBe(jwt)
    expect(store.user?.email).toBe('new@example.com')
    expect(store.user?.userId).toBe('new-id')
    expect(sessionStorage.getItem('token')).toBe(jwt)
  })

  it('register returns error message on failure', async () => {
    vi.mocked(api.register).mockRejectedValue(new Error('409 Email already in use'))
    const err = await useAuthStore().register({
      firstName: 'A', lastName: 'B',
      email: 'dup@example.com', password: 'pass',
      gdprConsentAt: new Date().toISOString(),
    })
    expect(err).toBe('409 Email already in use')
  })

  it('register returns generic message for non-Error throws', async () => {
    vi.mocked(api.register).mockRejectedValue(42)
    const err = await useAuthStore().register({
      firstName: 'A', lastName: 'B',
      email: 'x@x.com', password: 'pass',
      gdprConsentAt: '',
    })
    expect(err).toBe('Registration failed')
  })

  it('register failure does not touch token or user', async () => {
    vi.mocked(api.register).mockRejectedValue(new Error('Bad'))
    const store = useAuthStore()
    await store.register({ firstName: 'A', lastName: 'B', email: 'x@x.com', password: 'pass', gdprConsentAt: '' })
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  // ── updateProfile ─────────────────────────────────────────────────────────

  it('updateProfile replaces token and user on success', async () => {
    const initial = makeJwt({ email: 'jan@example.com', firstName: 'Jan' })
    vi.mocked(api.login).mockResolvedValue({ token: initial })
    const store = useAuthStore()
    await store.login('jan@example.com', 'pass')

    const updated = makeJwt({ email: 'jan@example.com', firstName: 'Jannes' })
    vi.mocked(api.updateProfile).mockResolvedValue({ token: updated })
    const err = await store.updateProfile({ firstName: 'Jannes', lastName: 'de Vries', preferences: { workType: 'remote' } })
    expect(err).toBeNull()
    expect(store.token).toBe(updated)
    expect(store.user?.firstName).toBe('Jannes')
    expect(sessionStorage.getItem('token')).toBe(updated)
  })

  it('updateProfile returns error message on failure', async () => {
    const jwt = makeJwt()
    vi.mocked(api.login).mockResolvedValue({ token: jwt })
    vi.mocked(api.updateProfile).mockRejectedValue(new Error('422 Validation failed'))
    const store = useAuthStore()
    await store.login('a@b.com', 'pass')
    const err = await store.updateProfile({ firstName: '', lastName: '', preferences: { workType: 'any' } })
    expect(err).toBe('422 Validation failed')
  })

  it('updateProfile when not logged in does not set token', async () => {
    const newJwt = makeJwt()
    vi.mocked(api.updateProfile).mockResolvedValue({ token: newJwt })
    const store = useAuthStore()
    // token is null; API is still called but result is discarded
    await store.updateProfile({ firstName: 'X', lastName: 'Y', preferences: { workType: 'any' } })
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
  })

  it('updateProfile generic message on non-Error throw', async () => {
    vi.mocked(api.updateProfile).mockRejectedValue('boom')
    const err = await useAuthStore().updateProfile({ firstName: 'A', lastName: 'B', preferences: { workType: 'any' } })
    expect(err).toBe('Update failed')
  })

  // ── changePassword ────────────────────────────────────────────────────────

  it('changePassword returns null on success', async () => {
    vi.mocked(api.changePassword).mockResolvedValue(undefined)
    const err = await useAuthStore().changePassword('old', 'new123')
    expect(err).toBeNull()
    expect(api.changePassword).toHaveBeenCalledWith('old', 'new123')
  })

  it('changePassword returns error message on failure', async () => {
    vi.mocked(api.changePassword).mockRejectedValue(new Error('400 Wrong current password'))
    const err = await useAuthStore().changePassword('wrong', 'new123')
    expect(err).toBe('400 Wrong current password')
  })

  it('changePassword returns generic message for non-Error throws', async () => {
    vi.mocked(api.changePassword).mockRejectedValue(null)
    const err = await useAuthStore().changePassword('x', 'y')
    expect(err).toBe('Password change failed')
  })

  it('changePassword does not modify token or user', async () => {
    const jwt = makeJwt()
    vi.mocked(api.login).mockResolvedValue({ token: jwt })
    vi.mocked(api.changePassword).mockResolvedValue(undefined)
    const store = useAuthStore()
    await store.login('a@b.com', 'pass')
    await store.changePassword('pass', 'newpass')
    expect(store.token).toBe(jwt)
    expect(store.user?.email).toBe('test@example.com')
  })

  // ── logout ────────────────────────────────────────────────────────────────

  it('logout clears token, user, and sessionStorage', async () => {
    const jwt = makeJwt()
    vi.mocked(api.login).mockResolvedValue({ token: jwt })
    const store = useAuthStore()
    await store.login('a@b.com', 'password')
    store.logout()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(sessionStorage.getItem('token')).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('logout when already logged out is a no-op', () => {
    const store = useAuthStore()
    expect(() => store.logout()).not.toThrow()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('logout called twice does not throw', async () => {
    const jwt = makeJwt()
    vi.mocked(api.login).mockResolvedValue({ token: jwt })
    const store = useAuthStore()
    await store.login('a@b.com', 'pass')
    store.logout()
    expect(() => store.logout()).not.toThrow()
    expect(store.isAuthenticated).toBe(false)
  })

  // ── deleteAccount ─────────────────────────────────────────────────────────

  it('deleteAccount calls api.deleteAccount and then logs out', async () => {
    const jwt = makeJwt()
    vi.mocked(api.login).mockResolvedValue({ token: jwt })
    vi.mocked(api.deleteAccount).mockResolvedValue(undefined)
    const store = useAuthStore()
    await store.login('a@b.com', 'pass')
    const err = await store.deleteAccount()
    expect(err).toBeNull()
    expect(api.deleteAccount).toHaveBeenCalledOnce()
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('deleteAccount returns error message on failure without logging out', async () => {
    const jwt = makeJwt()
    vi.mocked(api.login).mockResolvedValue({ token: jwt })
    vi.mocked(api.deleteAccount).mockRejectedValue(new Error('500 Server error'))
    const store = useAuthStore()
    await store.login('a@b.com', 'pass')
    const err = await store.deleteAccount()
    expect(err).toBe('500 Server error')
    expect(store.token).toBe(jwt)
    expect(store.isAuthenticated).toBe(true)
  })

  it('deleteAccount returns generic message for non-Error throws', async () => {
    vi.mocked(api.deleteAccount).mockRejectedValue(null)
    const err = await useAuthStore().deleteAccount()
    expect(err).toBe('Account deletion failed')
  })

  // ── parseUser URL-safe base64 ────────────────────────────────────────────

  it('parseUser correctly decodes URL-safe base64 JWT payload (real backend format)', () => {
    // Build a URL-safe base64 JWT like the real backend produces
    const toB64url = (s: string) =>
      btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const header  = toB64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = toB64url(JSON.stringify({
      sub: 'url-safe-id', email: 'url@test.com',
      firstName: 'Url', lastName: 'Safe', exp: 9999999999,
    }))
    const token = `${header}.${payload}.fakesig`

    sessionStorage.setItem('token', token)
    setActivePinia(createPinia())
    const store = useAuthStore()
    expect(store.user?.userId).toBe('url-safe-id')
    expect(store.user?.email).toBe('url@test.com')
  })
})
