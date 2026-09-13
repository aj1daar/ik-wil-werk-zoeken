import { nextTick } from 'vue'
import type { Router } from 'vue-router'

// Route changes through the View Transitions API: the browser snapshots the old
// page, the router swaps in the new one, and the browser cross-fades the two in
// one step. The old <Transition mode="out-in"> faded the page out and then in,
// which left a blank frame on every navigation; this doesn't. Elements with a
// view-transition-name (the nav, the you-are-here strip) are animated on their
// own, so the nav stays put and the strip slides to the new link.
//
// Everything here is progressive: without the API, or when the reader asks for
// less motion, navigation happens exactly as it did before.

interface ViewTransitionLike { finished: Promise<unknown> }
type StartViewTransition = (update: () => Promise<void>) => ViewTransitionLike

export function supportsViewTransitions(doc: Document = document): boolean {
  return typeof (doc as Document & { startViewTransition?: unknown }).startViewTransition === 'function'
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// A view transition moves nothing but pixels, so focus stays wherever it was.
// When the element that had it (a link inside the old page) is gone, send
// focus to the new page's heading so keyboard and screen-reader users land
// somewhere with context instead of on <body>.
function restoreFocus(doc: Document) {
  const active = doc.activeElement
  if (active && active !== doc.body && active.isConnected) return
  const heading = doc.querySelector<HTMLElement>('main h1, h1')
  if (!heading) return
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
  heading.focus({ preventScroll: true })
}

export function installViewTransitions(router: Router, doc: Document = document) {
  let finishUpdate: (() => void) | null = null

  const release = () => {
    finishUpdate?.()
    finishUpdate = null
  }

  router.beforeResolve((to, from) => {
    if (!supportsViewTransitions(doc) || prefersReducedMotion()) return
    // The first load has nothing to fade from, and a query change on the same
    // page (?open=<id>) isn't a page change.
    if (!from.matched.length || to.path === from.path) return

    const start = (doc as Document & { startViewTransition: StartViewTransition }).startViewTransition.bind(doc)
    return new Promise<void>(resolve => {
      const transition = start(() => new Promise<void>(done => {
        // The old page is captured by now; let the router carry on and hold
        // the transition open until the new page has rendered.
        finishUpdate = done
        resolve()
      }))
      transition.finished.finally(() => restoreFocus(doc))
    })
  })

  // afterEach runs for failed and cancelled navigations too, so a transition
  // can never be left waiting on a page that isn't coming.
  router.afterEach(async () => {
    if (!finishUpdate) return
    await nextTick()
    release()
  })
  router.onError(release)
}
