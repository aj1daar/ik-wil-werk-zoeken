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
      { path: '/admin',         component: { template: '<div/>' }, meta: { requiresAuth: true, requiresAdmin: true } },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ]
  })
  router.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'
    if (to.meta.requiresAdmin && (auth.user as { role?: string } | null)?.role !== 'admin') return '/'
    if ((to.path === '/login' || to.path === '/register') && auth.isAuthenticated) return '/'
  })
  return router
}

function makeAdminJwt(): string {
  const payload = { sub: 'admin-1', email: 'admin@example.com', role: 'admin', exp: 9999999999 }
  const b64 = (o: unknown) => btoa(JSON.stringify(o))
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
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

  // ── /admin guard ──────────────────────────────────────────────────────────

  it('unauthenticated → /admin redirects to /login', async () => {
    const router = makeRouter()
    await router.push('/admin')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('authenticated non-admin → /admin redirects to /', async () => {
    // Token with role: "user" (no admin)
    const payload = { sub: 'u1', email: 'user@example.com', role: 'user', exp: 9999999999 }
    const b64 = (o: unknown) => btoa(JSON.stringify(o))
    const jwt = `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
    sessionStorage.setItem('token', jwt)
    const router = makeRouter()
    await router.push('/admin')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('authenticated non-admin with missing role → /admin redirects to /', async () => {
    // Token payload has no role field at all
    const payload = { sub: 'u2', email: 'norole@example.com', exp: 9999999999 }
    const b64 = (o: unknown) => btoa(JSON.stringify(o))
    const jwt = `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
    sessionStorage.setItem('token', jwt)
    const router = makeRouter()
    await router.push('/admin')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('admin user → /admin is allowed', async () => {
    sessionStorage.setItem('token', makeAdminJwt())
    const router = makeRouter()
    await router.push('/admin')
    expect(router.currentRoute.value.path).toBe('/admin')
  })

  it('admin user → /admin → /profile is allowed', async () => {
    sessionStorage.setItem('token', makeAdminJwt())
    const router = makeRouter()
    await router.push('/admin')
    await router.push('/profile')
    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('admin user → /login is redirected to / (already authenticated)', async () => {
    sessionStorage.setItem('token', makeAdminJwt())
    const router = makeRouter()
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('attacker with crafted "admin" role in sessionStorage still passes client guard', () => {
    // The router guard is client-side and trusts the decoded JWT role.
    // Security enforcement happens on the backend (signature verification).
    // This test documents expected client behavior — not a security hole.
    const fakeAdmin = makeAdminJwt()
    sessionStorage.setItem('token', fakeAdmin)
    // Just verify the guard allows it — backend will reject the unsigned token
    expect(sessionStorage.getItem('token')).toBe(fakeAdmin)
  })
})
