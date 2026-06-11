import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FormMessage from '../FormMessage.vue'

describe('FormMessage', () => {
  // ── null / hidden ───────────────────────────────────────────────────────

  it('renders nothing when message prop is null', () => {
    const w = mount(FormMessage, { props: { message: null } })
    expect(w.find('.form-msg').exists()).toBe(false)
  })

  it('is empty (no text) when message is null', () => {
    const w = mount(FormMessage, { props: { message: null } })
    expect(w.text()).toBe('')
  })

  // ── visible ─────────────────────────────────────────────────────────────

  it('renders the message text when provided', () => {
    const w = mount(FormMessage, { props: { message: { text: 'Something went wrong', ok: false } } })
    expect(w.text()).toBe('Something went wrong')
  })

  it('always has base class form-msg', () => {
    const w = mount(FormMessage, { props: { message: { text: 'X', ok: true } } })
    expect(w.find('.form-msg').classes()).toContain('form-msg')
  })

  // ── error variant ───────────────────────────────────────────────────────

  it('has form-msg--err class when ok is false', () => {
    const w = mount(FormMessage, { props: { message: { text: 'Error!', ok: false } } })
    expect(w.find('.form-msg').classes()).toContain('form-msg--err')
  })

  it('does NOT have form-msg--ok class when ok is false', () => {
    const w = mount(FormMessage, { props: { message: { text: 'Error!', ok: false } } })
    expect(w.find('.form-msg').classes()).not.toContain('form-msg--ok')
  })

  // ── success variant ─────────────────────────────────────────────────────

  it('has form-msg--ok class when ok is true', () => {
    const w = mount(FormMessage, { props: { message: { text: 'Saved!', ok: true } } })
    expect(w.find('.form-msg').classes()).toContain('form-msg--ok')
  })

  it('does NOT have form-msg--err class when ok is true', () => {
    const w = mount(FormMessage, { props: { message: { text: 'Saved!', ok: true } } })
    expect(w.find('.form-msg').classes()).not.toContain('form-msg--err')
  })

  // ── edge cases ──────────────────────────────────────────────────────────

  it('renders empty string text without error', () => {
    const w = mount(FormMessage, { props: { message: { text: '', ok: false } } })
    expect(w.find('.form-msg').exists()).toBe(true)
  })

  it('renders long text without truncation', () => {
    const long = 'This is a very long error message that should still be fully rendered in the DOM without truncation'
    const w = mount(FormMessage, { props: { message: { text: long, ok: false } } })
    expect(w.text()).toContain(long)
  })
})
