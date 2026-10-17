import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LegalPage from '../LegalPage.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/privacy', component: { template: '<div id="privacy"/>' } },
      { path: '/login',   component: { template: '<div id="login"/>' } },
    ],
  })
}

let router: ReturnType<typeof makeRouter>

beforeEach(async () => {
  router = makeRouter()
  await router.push('/privacy')
  await router.isReady()
})

const render = () => mount(LegalPage, {
  props: { title: 'Privacy notice', version: '2026-10-16' },
  slots: { default: '<h2 class="section-title">A section</h2><p>Body text.</p>' },
  global: { plugins: [router] },
})

describe('the frame both legal pages sit in', () => {
  it('shows the title as the one page heading', () => {
    const wrapper = render()
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('h1').text()).toBe('Privacy notice')
  })

  it('shows the version', () => {
    expect(render().text()).toContain('Version 2026-10-16')
  })

  it('renders what the page gives it', () => {
    const wrapper = render()
    expect(wrapper.find('h2.section-title').text()).toBe('A section')
    expect(wrapper.text()).toContain('Body text.')
  })

  it('goes back to where the reader came from', async () => {
    const back = vi.spyOn(router, 'back').mockImplementation(() => {})
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3)
    await render().find('button').trigger('click')
    expect(back).toHaveBeenCalled()
  })

  it('falls back to sign-in when the page was opened directly', async () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1)
    const push = vi.spyOn(router, 'push')
    await render().find('button').trigger('click')
    expect(push).toHaveBeenCalledWith('/login')
  })
})
