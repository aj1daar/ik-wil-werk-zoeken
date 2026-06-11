import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../stores/auth'

// Mirrors the guard logic from src/router/index.ts without importing the
// singleton router (which would share state across tests).
function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login',      component: { template: '<div/>' } },
      { path: '/register',   component: { template: '<div/>' } },
      { path: '/',           component: { template: '<div/>' }, meta: { requiresAuth: true } },
      { path: '/bookmarked', component: { template: '<div/>' }, meta: { requiresAuth: true } },
      { path: '/profile',    component: { template: '<div/>' }, meta: { requiresAuth: true } },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ]
  })
  router.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'
    if ((to.path === '/login' || to.path === '/register') && auth.isAuthenticated) return '/'
  })
  return router
}

describe('router navigation guards', () => {
  // Fresh Pinia (no initialized stores) before each test.
  // sessionStorage is set per-test BEFORE any navigation so the auth store
  // lazily initializes with the correct token state when the guard first fires.
  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  // ── unauthenticated ──────────────────────────────────────────────────────

  it('unauthenticated → / is redirected to /login', async () => {
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('unauthenticated → /bookmarked is redirected to /login', async () => {
    const router = makeRouter()
    await router.push('/bookmarked')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('unauthenticated → /profile is redirected to /login', async () => {
    const router = makeRouter()
    await router.push('/profile')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('unauthenticated → /login is allowed through', async () => {
    const router = makeRouter()
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('unauthenticated → /register is allowed through', async () => {
    const router = makeRouter()
    await router.push('/register')
    expect(router.currentRoute.value.path).toBe('/register')
  })

  // ── authenticated ────────────────────────────────────────────────────────

  it('authenticated → / is allowed through', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('authenticated → /bookmarked is allowed through', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/bookmarked')
    expect(router.currentRoute.value.path).toBe('/bookmarked')
  })

  it('authenticated → /profile is allowed through', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/profile')
    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('authenticated → /login is redirected to /', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('authenticated → /register is redirected to /', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/register')
    expect(router.currentRoute.value.path).toBe('/')
  })

  // ── unknown / wildcard routes ────────────────────────────────────────────

  it('unauthenticated → unknown path goes through wildcard→/ then redirects to /login', async () => {
    const router = makeRouter()
    await router.push('/totally/unknown/path')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('authenticated → unknown path goes through wildcard→/ and stays at /', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/totally/unknown/path')
    expect(router.currentRoute.value.path).toBe('/')
  })

  // ── guard does not fire on /login twice (no redirect loop) ──────────────

  it('unauthenticated → /login stays at /login (no redirect loop)', async () => {
    const router = makeRouter()
    await router.push('/login')
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('authenticated → / navigating to /profile is allowed', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/')
    await router.push('/profile')
    expect(router.currentRoute.value.path).toBe('/profile')
  })
})
