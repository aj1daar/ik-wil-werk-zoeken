import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../stores/auth'

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login',      component: { template: '<div/>' } },
      { path: '/register',   component: { template: '<div/>' } },
      { path: '/',              component: { template: '<div/>' }, meta: { requiresAuth: true } },
      { path: '/applications',  component: { template: '<div/>' }, meta: { requiresAuth: true } },
      { path: '/companies',     component: { template: '<div/>' }, meta: { requiresAuth: true } },
      { path: '/profile',       component: { template: '<div/>' }, meta: { requiresAuth: true } },
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

  it('unauthenticated → /applications is redirected to /login', async () => {
    const router = makeRouter()
    await router.push('/applications')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('unauthenticated → /companies is redirected to /login', async () => {
    const router = makeRouter()
    await router.push('/companies')
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

  it('authenticated → /applications is allowed through', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/applications')
    expect(router.currentRoute.value.path).toBe('/applications')
  })

  it('authenticated → /companies is allowed through', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/companies')
    expect(router.currentRoute.value.path).toBe('/companies')
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

  // ── wildcard ──────────────────────────────────────────────────────────────

  it('unauthenticated → unknown path → wildcard → / → /login', async () => {
    const router = makeRouter()
    await router.push('/totally/unknown/path')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('authenticated → unknown path → wildcard → / stays at /', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/totally/unknown/path')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('unauthenticated → /login stays at /login (no redirect loop)', async () => {
    const router = makeRouter()
    await router.push('/login')
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('authenticated → navigating from / to /profile is allowed', async () => {
    sessionStorage.setItem('token', 'valid.jwt.token')
    const router = makeRouter()
    await router.push('/')
    await router.push('/profile')
    expect(router.currentRoute.value.path).toBe('/profile')
  })
})
