import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { Transition } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App.vue'

const Stub = { template: '<div/>' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/',             component: { template: '<div class="home-stub"/>' } },
      { path: '/login',        component: { template: '<div class="login-stub"/>' } },
      { path: '/register',     component: Stub },
      { path: '/applications', component: { template: '<div class="apps-stub"/>' } },
      { path: '/companies',    component: Stub },
      { path: '/profile',      component: Stub },
      { path: '/admin',        component: Stub },
    ],
  })
}

function makeJwt(expOffset: number, role = 'user'): string {
  const exp = Math.floor(Date.now() / 1000) + expOffset
  const payload = { sub: 'u1', email: 'user@example.com', role, exp }
  const b64 = (o: unknown) => btoa(JSON.stringify(o))
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

// Far-future token: exp ~year 2286, isExpiringSoon = false
const FAR_TOKEN       = makeJwt(86400 * 365 * 260)
// Near-expiry token: exp in 1 hour (< 24 h), isExpiringSoon = true
const NEAR_EXP_TOKEN  = makeJwt(3600)

async function mountApp(token?: string, path = '/login') {
  if (token) sessionStorage.setItem('token', token)
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  return mount(App, { global: { plugins: [pinia, router] } })
}

// ── page transition ───────────────────────────────────────────────────────────

describe('App – page transition', () => {
  beforeEach(() => { sessionStorage.clear() })

  it('renders a <Transition name="page"> wrapping the route outlet', async () => {
    const wrapper = await mountApp()
    await flushPromises()
    const pageTransitions = (wrapper.findAllComponents(Transition) as unknown as VueWrapper<any>[]).filter(t => t.props('name') === 'page')
    expect(pageTransitions.length).toBe(1)
  })

  it('page transition uses out-in mode', async () => {
    const wrapper = await mountApp()
    await flushPromises()
    const t = (wrapper.findAllComponents(Transition) as unknown as VueWrapper<any>[]).find(t => t.props('name') === 'page')
    expect(t?.props('mode')).toBe('out-in')
  })

  it('renders the login route component inside the transition', async () => {
    const wrapper = await mountApp(undefined, '/login')
    await flushPromises()
    expect(wrapper.find('.login-stub').exists()).toBe(true)
  })

  it('renders the home route component when navigating to /', async () => {
    const wrapper = await mountApp(FAR_TOKEN, '/')
    await flushPromises()
    expect(wrapper.find('.home-stub').exists()).toBe(true)
  })

  it('swaps route component after navigation', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = makeRouter()
    await router.push('/login')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(wrapper.find('.login-stub').exists()).toBe(true)

    await router.push('/applications')
    await flushPromises()
    expect(wrapper.find('.apps-stub').exists()).toBe(true)
    expect(wrapper.find('.login-stub').exists()).toBe(false)
  })
})

// ── navbar visibility ─────────────────────────────────────────────────────────

describe('App – navbar visibility', () => {
  beforeEach(() => { sessionStorage.clear() })

  it('hides navbar when unauthenticated', async () => {
    const wrapper = await mountApp(undefined, '/login')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'AppNavbar' }).exists()).toBe(false)
  })

  it('shows navbar when authenticated and not on an auth page', async () => {
    const wrapper = await mountApp(FAR_TOKEN, '/')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'AppNavbar' }).exists()).toBe(true)
  })

  it('hides navbar on /login even when a token is present', async () => {
    const wrapper = await mountApp(FAR_TOKEN, '/login')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'AppNavbar' }).exists()).toBe(false)
  })

  it('hides navbar on /register even when a token is present', async () => {
    const wrapper = await mountApp(FAR_TOKEN, '/register')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'AppNavbar' }).exists()).toBe(false)
  })
})

// ── session expiry banner ─────────────────────────────────────────────────────

describe('App – session expiry banner', () => {
  beforeEach(() => { sessionStorage.clear() })

  it('does not render the banner when token is far from expiry', async () => {
    const wrapper = await mountApp(FAR_TOKEN, '/')
    await flushPromises()
    expect(wrapper.find('.session-expiry-banner').exists()).toBe(false)
  })

  it('does not render the banner when unauthenticated', async () => {
    const wrapper = await mountApp(undefined, '/login')
    await flushPromises()
    expect(wrapper.find('.session-expiry-banner').exists()).toBe(false)
  })

  it('renders the banner when token expires within 24 hours', async () => {
    const wrapper = await mountApp(NEAR_EXP_TOKEN, '/')
    await flushPromises()
    expect(wrapper.find('.session-expiry-banner').exists()).toBe(true)
  })

  it('banner contains a dismiss button', async () => {
    const wrapper = await mountApp(NEAR_EXP_TOKEN, '/')
    await flushPromises()
    const banner = wrapper.find('.session-expiry-banner')
    expect(banner.find('button[aria-label="Dismiss"]').exists()).toBe(true)
  })

  it('dismissing the banner removes it from the DOM', async () => {
    const wrapper = await mountApp(NEAR_EXP_TOKEN, '/')
    await flushPromises()
    await wrapper.find('.session-expiry-banner button[aria-label="Dismiss"]').trigger('click')
    expect(wrapper.find('.session-expiry-banner').exists()).toBe(false)
  })

  it('banner does not reappear after dismiss on the same mount', async () => {
    const wrapper = await mountApp(NEAR_EXP_TOKEN, '/')
    await flushPromises()
    await wrapper.find('.session-expiry-banner button[aria-label="Dismiss"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.session-expiry-banner').exists()).toBe(false)
  })

  it('banner includes a sign-in link', async () => {
    const wrapper = await mountApp(NEAR_EXP_TOKEN, '/')
    await flushPromises()
    const link = wrapper.find('.session-expiry-banner a')
    expect(link.exists()).toBe(true)
  })
})
