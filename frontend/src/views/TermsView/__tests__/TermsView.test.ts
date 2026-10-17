import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import TermsView from '../TermsView.vue'
import { PRIVACY_CONTACT } from '../../../utils/privacy'
import { TERMS_VERSION } from '../../../utils/terms'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/terms',   component: TermsView },
      { path: '/privacy', component: { template: '<div id="privacy"/>' } },
      { path: '/login',   component: { template: '<div id="login"/>' } },
    ],
  })
}

let router: ReturnType<typeof makeRouter>

beforeEach(async () => {
  setActivePinia(createPinia())
  router = makeRouter()
  await router.push('/terms')
  await router.isReady()
})

const render = () => mount(TermsView, { global: { plugins: [router] } })

describe('the terms of service', () => {
  it('names the version it is', () => {
    expect(render().text()).toContain(TERMS_VERSION)
  })

  it('names who the agreement is with and how to reach them', () => {
    const wrapper = render()
    expect(wrapper.text()).toContain('Atai Nogoibaev')
    expect(wrapper.find(`a[href="mailto:${PRIVACY_CONTACT}"]`).exists()).toBe(true)
  })

  it('says the service is free', () => {
    expect(render().text()).toContain('It is free')
  })

  it('says what is not allowed', () => {
    const text = render().text().toLowerCase()
    expect(text).toContain("another person's account")
    expect(text).toContain('rate limits')
  })

  it('warns that the sponsor register can be out of date', () => {
    const text = render().text()
    expect(text).toContain('IND')
    expect(text).toContain('out of date')
    expect(text).toContain('Nothing here is immigration advice')
  })

  it('promises no uptime', () => {
    expect(render().text()).toContain('No uptime is promised')
  })

  it('points at the privacy notice for the data side', () => {
    expect(render().find('a[href="/privacy"]').exists()).toBe(true)
  })

  it('says how the agreement ends', () => {
    const text = render().text()
    expect(text).toContain('delete your account')
    expect(text).toContain('suspended or closed')
  })

  it('keeps the liability that law does not let it limit', () => {
    expect(render().text()).toContain('cannot be limited by law')
  })

  it('names the law that applies', () => {
    expect(render().text()).toContain('Dutch law')
  })

  it('can be read without an account', () => {
    expect(render().find('h1').text()).toBe('Terms of service')
  })

  it('has one heading per section, under one page title', () => {
    const wrapper = render()
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.findAll('h2').length).toBeGreaterThanOrEqual(8)
  })
})
