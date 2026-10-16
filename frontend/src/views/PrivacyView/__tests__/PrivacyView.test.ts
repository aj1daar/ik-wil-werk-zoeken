import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import PrivacyView from '../PrivacyView.vue'
import { PRIVACY_CONTACT, PRIVACY_VERSION } from '../../../utils/privacy'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/privacy', component: PrivacyView },
      { path: '/login',   component: { template: '<div id="login"/>' } },
    ],
  })
}

let router: ReturnType<typeof makeRouter>

beforeEach(async () => {
  setActivePinia(createPinia())
  router = makeRouter()
  await router.push('/privacy')
  await router.isReady()
})

const render = () => mount(PrivacyView, { global: { plugins: [router] } })

describe('the privacy notice', () => {
  it('names the version it is', () => {
    expect(render().text()).toContain(PRIVACY_VERSION)
  })

  it('names who is responsible and how to reach them', () => {
    const wrapper = render()
    expect(wrapper.text()).toContain('Atai Nogoibaev')
    expect(wrapper.find(`a[href="mailto:${PRIVACY_CONTACT}"]`).exists()).toBe(true)
  })

  it('says what is collected and on what basis', () => {
    const text = render().text()
    expect(text).toContain('email address')
    expect(text).toContain('password')
    expect(text.toLowerCase()).toContain('legitimate interest')
  })

  it('names every party that sees any of it', () => {
    const text = render().text()
    for (const processor of ['Hetzner', 'Cloudflare', 'Resend', 'Google']) {
      expect(text).toContain(processor)
    }
  })

  it('says how long it is kept and how to get rid of it', () => {
    const text = render().text()
    expect(text).toContain('Until you delete your account')
    expect(text).toContain('Download my data')
  })

  it('says where to complain', () => {
    expect(render().text()).toContain('Autoriteit Persoonsgegevens')
  })

  it('says what is stored in the browser', () => {
    const text = render().text()
    expect(text).toContain('session token')
    expect(text.toLowerCase()).toContain('no advertising or analytics cookies')
  })

  it('can be read without an account', () => {
    // No guard on the route, and nothing in the page asks the store for a user.
    expect(render().find('h1').text()).toBe('Privacy notice')
  })

  it('has one heading per section, under one page title', () => {
    const wrapper = render()
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.findAll('h2').length).toBeGreaterThanOrEqual(6)
  })
})
