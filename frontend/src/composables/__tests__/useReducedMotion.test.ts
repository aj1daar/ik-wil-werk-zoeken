import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from '../useReducedMotion'

function stubQuery(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: initial && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
  }))
  return { listeners, change: (matches: boolean) => listeners.forEach(cb => cb({ matches })) }
}

afterEach(() => vi.unstubAllGlobals())

describe('useReducedMotion', () => {
  it('starts from the current setting', () => {
    stubQuery(true)
    const scope = effectScope()
    expect(scope.run(() => useReducedMotion())!.value).toBe(true)
    scope.stop()
  })

  it('follows a change made while the page is open', () => {
    const { change } = stubQuery(false)
    const scope = effectScope()
    const reduced = scope.run(() => useReducedMotion())!
    change(true)
    expect(reduced.value).toBe(true)
    change(false)
    expect(reduced.value).toBe(false)
    scope.stop()
  })

  it('stops listening once its owner is gone', () => {
    const { listeners } = stubQuery(false)
    const scope = effectScope()
    scope.run(() => useReducedMotion())
    expect(listeners.size).toBe(1)
    scope.stop()
    expect(listeners.size).toBe(0)
  })

  it('assumes full motion where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined)
    const scope = effectScope()
    expect(scope.run(() => useReducedMotion())!.value).toBe(false)
    scope.stop()
  })
})
