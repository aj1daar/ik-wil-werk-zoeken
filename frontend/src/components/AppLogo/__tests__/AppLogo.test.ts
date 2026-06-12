import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppLogo from '../AppLogo.vue'

describe('AppLogo', () => {
  // ── rendering ───────────────────────────────────────────────────────────

  it('renders an svg element', () => {
    expect(mount(AppLogo).find('svg').exists()).toBe(true)
  })

  it('renders "ik wil werk" light text', () => {
    expect(mount(AppLogo).text()).toContain('ik wil werk')
  })

  it('renders "zoeken" bold text', () => {
    expect(mount(AppLogo).text()).toContain('zoeken')
  })

  it('full text is "ik wil werk zoeken"', () => {
    expect(mount(AppLogo).text()).toContain('ik wil werk zoeken')
  })

  // ── size prop ───────────────────────────────────────────────────────────

  it('svg defaults to width 34', () => {
    expect(mount(AppLogo).find('svg').attributes('width')).toBe('34')
  })

  it('svg defaults to height 34', () => {
    expect(mount(AppLogo).find('svg').attributes('height')).toBe('34')
  })

  it('size prop changes svg width', () => {
    expect(mount(AppLogo, { props: { size: 44 } }).find('svg').attributes('width')).toBe('44')
  })

  it('size prop changes svg height', () => {
    expect(mount(AppLogo, { props: { size: 44 } }).find('svg').attributes('height')).toBe('44')
  })

  it('size prop of 16 sets correct svg dimensions', () => {
    const w = mount(AppLogo, { props: { size: 16 } })
    expect(w.find('svg').attributes('width')).toBe('16')
    expect(w.find('svg').attributes('height')).toBe('16')
  })

  // ── dark prop ───────────────────────────────────────────────────────────

  it('does NOT have app-logo--dark class by default', () => {
    expect(mount(AppLogo).find('.app-logo').classes()).not.toContain('app-logo--dark')
  })

  it('does NOT have app-logo--dark when dark=false', () => {
    expect(mount(AppLogo, { props: { dark: false } }).find('.app-logo').classes()).not.toContain('app-logo--dark')
  })

  it('has app-logo--dark class when dark=true', () => {
    expect(mount(AppLogo, { props: { dark: true } }).find('.app-logo').classes()).toContain('app-logo--dark')
  })

  // ── accessibility ───────────────────────────────────────────────────────

  it('svg has aria-hidden=true so screen readers skip the decorative graphic', () => {
    expect(mount(AppLogo).find('svg').attributes('aria-hidden')).toBe('true')
  })

  // ── combined props ──────────────────────────────────────────────────────

  it('size and dark props can be combined', () => {
    const w = mount(AppLogo, { props: { size: 60, dark: true } })
    expect(w.find('svg').attributes('width')).toBe('60')
    expect(w.find('.app-logo').classes()).toContain('app-logo--dark')
  })
})
