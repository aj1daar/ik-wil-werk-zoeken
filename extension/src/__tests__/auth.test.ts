import { describe, expect, it } from 'vitest'
import { clearToken, getLiveToken, getToken, isExpired, setToken } from '../lib/auth'
import { session } from './setup'

const NOW = 1_760_000_000_000

function makeToken(expSeconds: number): string {
  const part = (value: unknown) => btoa(JSON.stringify(value))
  return `${part({ alg: 'HS256' })}.${part({ sub: 'u1', exp: expSeconds })}.signature`
}

// ── where the token lives ────────────────────────────────────────────────────

describe('token storage', () => {
  it('has nothing before a sign-in', async () => {
    expect(await getToken()).toBeNull()
  })

  it('gives back what was stored', async () => {
    await setToken('a.b.c')
    expect(await getToken()).toBe('a.b.c')
  })

  it('uses the session area, so the token never reaches disk', async () => {
    await setToken('a.b.c')
    expect(session.set).toHaveBeenCalledWith({ iwwzToken: 'a.b.c' })
  })

  it('forgets it on sign-out', async () => {
    await setToken('a.b.c')
    await clearToken()
    expect(await getToken()).toBeNull()
  })

  it('treats an empty string as no token', async () => {
    await session.set({ iwwzToken: '' })
    expect(await getToken()).toBeNull()
  })

  it('treats a non-string left in storage as no token', async () => {
    await session.set({ iwwzToken: { nope: true } })
    expect(await getToken()).toBeNull()
  })
})

// ── reading the expiry ───────────────────────────────────────────────────────

describe('isExpired', () => {
  it('accepts a token with time left', () => {
    expect(isExpired(makeToken(NOW / 1000 + 3600), NOW)).toBe(false)
  })

  it('rejects one whose hour has passed', () => {
    expect(isExpired(makeToken(NOW / 1000 - 3600), NOW)).toBe(true)
  })

  it('rejects one expiring exactly now, rather than racing the server', () => {
    expect(isExpired(makeToken(NOW / 1000), NOW)).toBe(true)
  })

  it.each([
    ['no payload at all', 'justonepart'],
    ['a payload that is not base64', 'a.!!!!.c'],
    ['a payload that is not JSON', `a.${btoa('not json')}.c`],
    ['a payload with no exp', `a.${btoa(JSON.stringify({ sub: 'u1' }))}.c`],
    ['an exp that is text', `a.${btoa(JSON.stringify({ exp: 'soon' }))}.c`],
    ['an empty string', ''],
  ])('rejects %s', (_label, token) => {
    expect(isExpired(token, NOW)).toBe(true)
  })

  it('reads a base64url payload, which is what the API sends', () => {
    // Padding and the two swapped characters are what distinguishes base64url.
    const payload = btoa(JSON.stringify({ sub: 'u1', exp: NOW / 1000 + 60 }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(isExpired(`a.${payload}.c`, NOW)).toBe(false)
  })
})

// ── the token the panel is allowed to use ────────────────────────────────────

describe('getLiveToken', () => {
  it('returns a token that is still good', async () => {
    const token = makeToken(Date.now() / 1000 + 3600)
    await setToken(token)
    expect(await getLiveToken()).toBe(token)
  })

  it('returns nothing when there is none', async () => {
    expect(await getLiveToken()).toBeNull()
  })

  it('throws away an expired token instead of sending it', async () => {
    await setToken(makeToken(Date.now() / 1000 - 10))
    expect(await getLiveToken()).toBeNull()
    expect(await getToken()).toBeNull()
  })
})
