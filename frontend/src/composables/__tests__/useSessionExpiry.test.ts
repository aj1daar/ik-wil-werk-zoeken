import { setActivePinia, createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionExpiry } from '../useSessionExpiry'
import { useAuthStore } from '../../stores/auth'

// Builds a JWT-shaped token with a given exp (Unix timestamp).
// Uses standard btoa so the payload is predictable.
function makeJwtWithExp(exp: number, role = 'user'): string {
  const payload = { sub: 'u1', email: 'test@example.com', role, exp }
  const b64 = (o: unknown) => btoa(JSON.stringify(o))
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

// Pin the clock so exact-boundary assertions ("exactly 1 s", "exactly 24 h")
// can't flip when Date.now() drifts a second between here and the composable.
const FIXED_MS = Date.UTC(2026, 0, 15, 12, 0, 0)
const NOW = Math.floor(FIXED_MS / 1000)

describe('useSessionExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_MS)
    setActivePinia(createPinia())
    sessionStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  // ── isExpiringSoon ────────────────────────────────────────────────────────

  it('isExpiringSoon is false when there is no token', () => {
    const { isExpiringSoon } = useSessionExpiry()
    expect(isExpiringSoon.value).toBe(false)
  })

  it('isExpiringSoon is false when session has > 24 h remaining', () => {
    sessionStorage.setItem('token', makeJwtWithExp(NOW + 7 * 86400)) // 7 days
    setActivePinia(createPinia())
    const store = useAuthStore()
    // token must be set on the store too (the composable reads from auth store)
    store.$patch({ token: sessionStorage.getItem('token') })
    const { isExpiringSoon } = useSessionExpiry()
    expect(isExpiringSoon.value).toBe(false)
  })

  it('isExpiringSoon is true when session expires in < 24 h', () => {
    const token = makeJwtWithExp(NOW + 3600) // 1 hour remaining
    const store = useAuthStore()
    store.$patch({ token })
    const { isExpiringSoon } = useSessionExpiry()
    expect(isExpiringSoon.value).toBe(true)
  })

  it('isExpiringSoon is true when session expires in exactly 1 second', () => {
    const token = makeJwtWithExp(NOW + 1)
    const store = useAuthStore()
    store.$patch({ token })
    const { isExpiringSoon } = useSessionExpiry()
    expect(isExpiringSoon.value).toBe(true)
  })

  it('isExpiringSoon is false when session has exactly 24 h remaining', () => {
    const token = makeJwtWithExp(NOW + 86400)
    const store = useAuthStore()
    store.$patch({ token })
    const { isExpiringSoon } = useSessionExpiry()
    // exactly 86400 is NOT < ONE_DAY_S (86400), so false
    expect(isExpiringSoon.value).toBe(false)
  })

  it('isExpiringSoon is false when session is already expired', () => {
    const token = makeJwtWithExp(NOW - 3600) // expired 1 hour ago
    const store = useAuthStore()
    store.$patch({ token })
    const { isExpiringSoon } = useSessionExpiry()
    // secondsRemaining is negative — not > 0, so isExpiringSoon is false
    expect(isExpiringSoon.value).toBe(false)
  })

  it('isExpiringSoon is false when token is malformed', () => {
    const store = useAuthStore()
    store.$patch({ token: 'not-a-jwt' })
    const { isExpiringSoon } = useSessionExpiry()
    expect(isExpiringSoon.value).toBe(false)
  })

  it('isExpiringSoon is false when token has no exp field', () => {
    const b64 = (o: unknown) => btoa(JSON.stringify(o))
    const noExp = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1' })}.sig`
    const store = useAuthStore()
    store.$patch({ token: noExp })
    const { isExpiringSoon } = useSessionExpiry()
    expect(isExpiringSoon.value).toBe(false)
  })

  // ── secondsRemaining ──────────────────────────────────────────────────────

  it('secondsRemaining is null when there is no token', () => {
    const { secondsRemaining } = useSessionExpiry()
    expect(secondsRemaining.value).toBeNull()
  })

  it('secondsRemaining is approximately correct for a future token', () => {
    const token = makeJwtWithExp(NOW + 7200) // 2 hours
    const store = useAuthStore()
    store.$patch({ token })
    const { secondsRemaining } = useSessionExpiry()
    // Allow ±5 s for test execution time
    expect(secondsRemaining.value).toBeGreaterThan(7200 - 5)
    expect(secondsRemaining.value).toBeLessThanOrEqual(7200)
  })

  it('secondsRemaining is negative for an expired token', () => {
    const token = makeJwtWithExp(NOW - 60)
    const store = useAuthStore()
    store.$patch({ token })
    const { secondsRemaining } = useSessionExpiry()
    expect(secondsRemaining.value!).toBeLessThan(0)
  })

  it('secondsRemaining is null when token payload is invalid base64', () => {
    const store = useAuthStore()
    store.$patch({ token: 'hdr.!!!badbase64!!!.sig' })
    const { secondsRemaining } = useSessionExpiry()
    expect(secondsRemaining.value).toBeNull()
  })

  // ── security edge cases ────────────────────────────────────────────────────

  it('crafting a JWT with very far-future exp does not trigger expiry warning', () => {
    // A hacker could modify sessionStorage with a far-future exp, but the
    // composable would simply show no warning. The backend validates the real JWT.
    const token = makeJwtWithExp(NOW + 365 * 86400)
    const store = useAuthStore()
    store.$patch({ token })
    const { isExpiringSoon } = useSessionExpiry()
    expect(isExpiringSoon.value).toBe(false)
  })

  it('crafting a JWT with exp as a string does not crash', () => {
    const b64 = (o: unknown) => btoa(JSON.stringify(o))
    const badExp = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: 'notanumber' })}.sig`
    const store = useAuthStore()
    store.$patch({ token: badExp })
    const { isExpiringSoon, secondsRemaining } = useSessionExpiry()
    // exp is a string, not a number — jwtExp returns null
    expect(secondsRemaining.value).toBeNull()
    expect(isExpiringSoon.value).toBe(false)
  })
})
