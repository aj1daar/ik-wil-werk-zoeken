import { beforeEach, vi } from 'vitest'

// A stand-in for the one storage area the panel uses. Behaves like the real
// thing in the ways that matter here: keys come back as a map, a missing key is
// simply absent, and nothing survives a reset.
class SessionStore {
  private data = new Map<string, unknown>()

  get = vi.fn(async (keys?: string | string[] | null) => {
    if (keys === undefined || keys === null) return Object.fromEntries(this.data)
    const wanted = typeof keys === 'string' ? [keys] : keys
    const out: Record<string, unknown> = {}
    for (const key of wanted) if (this.data.has(key)) out[key] = this.data.get(key)
    return out
  })

  set = vi.fn(async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) this.data.set(key, value)
  })

  remove = vi.fn(async (keys: string | string[]) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) this.data.delete(key)
  })

  reset() {
    this.data.clear()
    this.get.mockClear()
    this.set.mockClear()
    this.remove.mockClear()
  }
}

export const session = new SessionStore()

Object.assign(globalThis, {
  chrome: {
    storage: { session },
    sidePanel: { setPanelBehavior: vi.fn(async () => undefined) },
    runtime: { id: 'test-extension-id' },
  },
})

beforeEach(() => {
  session.reset()
  vi.restoreAllMocks()
})
