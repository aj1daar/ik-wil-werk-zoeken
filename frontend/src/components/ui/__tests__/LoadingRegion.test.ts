import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LoadingRegion from '../LoadingRegion.vue'

describe('LoadingRegion', () => {
  const mountRegion = (label = 'Loading your applications') =>
    mount(LoadingRegion, {
      props: { label },
      slots: { default: '<ul aria-hidden="true"><li class="skeleton" /></ul>' },
    })

  it('announces what is loading to screen readers', () => {
    const w = mountRegion()
    expect(w.attributes('role')).toBe('status')
    expect(w.find('.sr-only').text()).toBe('Loading your applications')
  })

  it('shows the placeholder shapes it is given, hidden from assistive technology', () => {
    const w = mountRegion()
    expect(w.find('.skeleton').exists()).toBe(true)
    expect(w.find('ul').attributes('aria-hidden')).toBe('true')
  })

  it('carries the class the delayed fade-in hangs on', () => {
    expect(mountRegion().classes()).toContain('loading-region')
  })

  it('does not print a "Loading…" line of its own', () => {
    expect(mountRegion().text()).toBe('Loading your applications')
  })

  it('renders a label with markup in it as text', () => {
    const w = mountRegion('<b>Loading</b>')
    expect(w.find('b').exists()).toBe(false)
    expect(w.find('.sr-only').text()).toBe('<b>Loading</b>')
  })
})
