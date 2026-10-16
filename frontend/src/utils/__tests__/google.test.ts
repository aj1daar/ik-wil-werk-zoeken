import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The module reads the client id once, at import, so every case here imports it
// again with the environment it wants.
async function load(clientId: string | undefined) {
  vi.resetModules()
  if (clientId === undefined) vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
  else vi.stubEnv('VITE_GOOGLE_CLIENT_ID', clientId)
  return await import('../google')
}

function fakeApi() {
  return { initialize: vi.fn(), renderButton: vi.fn(), disableAutoSelect: vi.fn() }
}

// The element is kept out of the document on purpose: a real <script src> in
// happy-dom tries to fetch, and settles itself before a test can say what the
// load should do. Held back, every case decides.
function captureScript() {
  const added: HTMLScriptElement[] = []
  vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
    added.push(node as HTMLScriptElement)
    return node
  }) as typeof document.head.appendChild)
  return added
}

beforeEach(() => {
  document.head.innerHTML = ''
  delete (globalThis as { google?: unknown }).google
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  delete (globalThis as { google?: unknown }).google
})

describe('googleSignInConfigured', () => {
  it('is false in a build with no client id', async () => {
    const { googleSignInConfigured } = await load(undefined)
    expect(googleSignInConfigured()).toBe(false)
  })

  it('is true once a client id is built in', async () => {
    const { googleSignInConfigured } = await load('123-abc.apps.googleusercontent.com')
    expect(googleSignInConfigured()).toBe(true)
  })
})

describe('loadGoogleIdentity', () => {
  it('loads nothing at all without a client id', async () => {
    const scripts = captureScript()
    const { loadGoogleIdentity } = await load(undefined)
    expect(await loadGoogleIdentity()).toBeNull()
    expect(scripts.length).toBe(0)
  })

  it('uses the script Google has already put on the page', async () => {
    const api = fakeApi()
    ;(globalThis as { google?: unknown }).google = { accounts: { id: api } }

    const scripts = captureScript()
    const { loadGoogleIdentity } = await load('123-abc.apps.googleusercontent.com')
    expect(await loadGoogleIdentity()).toBe(api)
    expect(scripts.length).toBe(0)
  })

  it('adds the script once, however many callers ask', async () => {
    const scripts = captureScript()
    const { loadGoogleIdentity } = await load('123-abc.apps.googleusercontent.com')

    const first  = loadGoogleIdentity()
    const second = loadGoogleIdentity()
    expect(first).toBe(second)
    expect(scripts.length).toBe(1)
    expect(scripts[0].getAttribute('src')).toBe('https://accounts.google.com/gsi/client')
    expect(scripts[0].async).toBe(true)

    const api = fakeApi()
    ;(globalThis as { google?: unknown }).google = { accounts: { id: api } }
    scripts[0].onload?.(new Event('load'))

    expect(await first).toBe(api)
    expect(await second).toBe(api)
    expect(scripts.length).toBe(1)
  })

  it('gives null when the script is blocked', async () => {
    const scripts = captureScript()
    const { loadGoogleIdentity } = await load('123-abc.apps.googleusercontent.com')
    const pending = loadGoogleIdentity()
    scripts[0].onerror?.(new Event('error'))
    expect(await pending).toBeNull()
  })

  it('gives null when the script loads but brings nothing with it', async () => {
    const scripts = captureScript()
    const { loadGoogleIdentity } = await load('123-abc.apps.googleusercontent.com')
    const pending = loadGoogleIdentity()
    scripts[0].onload?.(new Event('load'))
    expect(await pending).toBeNull()
  })

  it('asks for the script from Google and nowhere else', async () => {
    const scripts = captureScript()
    const { loadGoogleIdentity } = await load('123-abc.apps.googleusercontent.com')
    void loadGoogleIdentity()
    expect(new URL(scripts[0].getAttribute('src')!).origin).toBe('https://accounts.google.com')
  })
})
