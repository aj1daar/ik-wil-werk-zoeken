import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { installViewTransitions, supportsViewTransitions } from '../viewTransition'

// Loose on purpose: the DOM lib types the real API, and these tests need to
// remove it, replace it with a stub, or set it to junk.
type DocWithVT = { startViewTransition?: unknown }

// happy-dom has no View Transitions API, so the browser's side is played by a
// stub that does what the browser does: run the update, and settle `finished`
// once the update's promise has resolved.
function stubViewTransitions() {
  const updates: Promise<void>[] = []
  const start = vi.fn((update: () => Promise<void>) => {
    const done = update()
    updates.push(done)
    return { finished: done.then(() => undefined) }
  })
  ;(document as unknown as DocWithVT).startViewTransition = start
  return { start, updates }
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query, addEventListener() {}, removeEventListener() {},
  }))
}

function makeRouter() {
  const page = (title: string) => ({ template: `<h1>${title}</h1>` })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: page('Home') },
      { path: '/applications', component: page('My applications') },
      { path: '/companies', component: page('Companies') },
    ],
  })
  installViewTransitions(router)
  return router
}

// Whether the update callback has been released yet
async function settled(p: Promise<void>) {
  let done = false
  p.then(() => { done = true })
  await new Promise(r => setTimeout(r, 0))
  return done
}

beforeEach(() => stubReducedMotion(false))
afterEach(() => {
  delete (document as unknown as DocWithVT).startViewTransition
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('view transitions – feature detection', () => {
  it('reports no support when the browser has no API', () => {
    expect(supportsViewTransitions()).toBe(false)
  })

  it('reports support once the API exists', () => {
    stubViewTransitions()
    expect(supportsViewTransitions()).toBe(true)
  })

  it('does not mistake a non-function for the API', () => {
    ;(document as unknown as DocWithVT).startViewTransition = true
    expect(supportsViewTransitions()).toBe(false)
  })
})

describe('view transitions – when they run', () => {
  it('navigates normally in a browser without the API', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.push('/applications')
    expect(router.currentRoute.value.path).toBe('/applications')
  })

  it('does not animate the first page load', async () => {
    const { start } = stubViewTransitions()
    const router = makeRouter()
    await router.push('/')
    expect(start).not.toHaveBeenCalled()
  })

  it('cross-fades a change from one page to another', async () => {
    const { start } = stubViewTransitions()
    const router = makeRouter()
    await router.push('/')
    await router.push('/applications')
    expect(start).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/applications')
  })

  it('leaves a query change on the same page alone', async () => {
    const { start } = stubViewTransitions()
    const router = makeRouter()
    await router.push('/applications')
    await router.push('/applications?open=abc')
    expect(start).not.toHaveBeenCalled()
  })

  it('skips the animation for a reader who asked for less motion', async () => {
    stubReducedMotion(true)
    const { start } = stubViewTransitions()
    const router = makeRouter()
    await router.push('/')
    await router.push('/companies')
    expect(start).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/companies')
  })
})

describe('view transitions – never left hanging', () => {
  it('releases the transition once the new page is in place', async () => {
    const { updates } = stubViewTransitions()
    const router = makeRouter()
    await router.push('/')
    await router.push('/applications')
    expect(await settled(updates[0])).toBe(true)
  })

  it('releases it when a later guard cancels the navigation', async () => {
    const { updates } = stubViewTransitions()
    const router = makeRouter()
    await router.push('/')
    router.beforeResolve(to => (to.path === '/companies' ? false : undefined))

    await router.push('/companies')

    expect(router.currentRoute.value.path).toBe('/')
    expect(await settled(updates[0])).toBe(true)
  })

  it('handles back-to-back navigations, each with its own transition', async () => {
    const { start, updates } = stubViewTransitions()
    const router = makeRouter()
    await router.push('/')
    await router.push('/applications')
    await router.push('/companies')
    expect(start).toHaveBeenCalledTimes(2)
    expect(await settled(updates[0])).toBe(true)
    expect(await settled(updates[1])).toBe(true)
  })
})

describe('view transitions – focus', () => {
  it('moves focus to the new heading when the focused element went away with the old page', async () => {
    stubViewTransitions()
    const router = makeRouter()
    await router.push('/')
    document.body.innerHTML = '<main><h1>My applications</h1></main>'
    ;(document.activeElement as HTMLElement | null)?.blur()

    await router.push('/applications')
    await new Promise(r => setTimeout(r, 0))

    const heading = document.querySelector('h1')!
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })

  it('leaves focus where it is when that element is still on the page', async () => {
    stubViewTransitions()
    const router = makeRouter()
    await router.push('/')
    document.body.innerHTML = '<nav><a href="/applications" id="nav-link">My applications</a></nav><h1>My applications</h1>'
    const link = document.getElementById('nav-link')!
    link.focus()

    await router.push('/applications')
    await new Promise(r => setTimeout(r, 0))

    expect(document.activeElement).toBe(link)
  })
})
