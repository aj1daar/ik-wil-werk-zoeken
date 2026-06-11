import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PasswordField from '../PasswordField.vue'

function mountField(overrides: Record<string, unknown> = {}) {
  return mount(PasswordField, {
    props: {
      id:    'pw-field',
      label: 'Password',
      modelValue: '',
      'onUpdate:modelValue': vi.fn(),
      ...overrides,
    }
  })
}

describe('PasswordField', () => {
  // ── rendering ───────────────────────────────────────────────────────────

  it('renders a label with correct text', () => {
    const w = mountField({ label: 'Your Secret' })
    expect(w.find('label').text()).toBe('Your Secret')
  })

  it('label for attribute matches id prop', () => {
    const w = mountField({ id: 'my-pw', label: 'L' })
    expect(w.find('label').attributes('for')).toBe('my-pw')
  })

  it('input has the given id', () => {
    const w = mountField({ id: 'custom-id' })
    expect(w.find('#custom-id').exists()).toBe(true)
  })

  it('input starts as type password', () => {
    const w = mountField()
    expect(w.find('input').attributes('type')).toBe('password')
  })

  it('toggle button is type="button" (not submit)', () => {
    const w = mountField()
    expect(w.find('button').attributes('type')).toBe('button')
  })

  it('toggle button initially has aria-label "Show password"', () => {
    const w = mountField()
    expect(w.find('button').attributes('aria-label')).toBe('Show password')
  })

  // ── toggle visibility ───────────────────────────────────────────────────

  it('clicking toggle changes input to type text', async () => {
    const w = mountField()
    await w.find('button').trigger('click')
    expect(w.find('input').attributes('type')).toBe('text')
  })

  it('clicking toggle changes aria-label to "Hide password"', async () => {
    const w = mountField()
    await w.find('button').trigger('click')
    expect(w.find('button').attributes('aria-label')).toBe('Hide password')
  })

  it('clicking toggle twice restores type to password and original aria-label', async () => {
    const w = mountField()
    await w.find('button').trigger('click')
    await w.find('button').trigger('click')
    expect(w.find('input').attributes('type')).toBe('password')
    expect(w.find('button').attributes('aria-label')).toBe('Show password')
  })

  // ── v-model / two-way binding ───────────────────────────────────────────

  it('emits update:modelValue when user types', async () => {
    const handler = vi.fn()
    const w = mount(PasswordField, {
      props: { id: 'pw', label: 'L', modelValue: '', 'onUpdate:modelValue': handler }
    })
    await w.find('input').setValue('newpass')
    expect(handler).toHaveBeenCalledWith('newpass')
  })

  it('reflects modelValue in the input element value', () => {
    const w = mountField({ modelValue: 'preset' })
    expect((w.find('input').element as HTMLInputElement).value).toBe('preset')
  })

  it('emitting empty string on clear', async () => {
    const handler = vi.fn()
    const w = mount(PasswordField, {
      props: { id: 'pw', label: 'L', modelValue: 'old', 'onUpdate:modelValue': handler }
    })
    await w.find('input').setValue('')
    expect(handler).toHaveBeenCalledWith('')
  })

  // ── pass-through props ──────────────────────────────────────────────────

  it('inputClass prop is applied to the input element', () => {
    const w = mountField({ inputClass: 'my-custom-class' })
    expect(w.find('input').classes()).toContain('my-custom-class')
  })

  it('default inputClass is field-input', () => {
    const w = mountField()
    expect(w.find('input').classes()).toContain('field-input')
  })

  it('required prop is passed to the input', () => {
    const w = mountField({ required: true })
    expect(w.find('input').attributes('required')).toBeDefined()
  })

  it('minlength prop is passed to the input', () => {
    const w = mountField({ minlength: 8 })
    expect(w.find('input').attributes('minlength')).toBe('8')
  })

  it('placeholder prop is passed to the input', () => {
    const w = mountField({ placeholder: 'At least 8 chars' })
    expect(w.find('input').attributes('placeholder')).toBe('At least 8 chars')
  })

  it('autocomplete prop is passed to the input', () => {
    const w = mountField({ autocomplete: 'current-password' })
    expect(w.find('input').attributes('autocomplete')).toBe('current-password')
  })

  // ── security – typing while visible still emits ─────────────────────────

  it('typing while visible emits the typed value', async () => {
    const handler = vi.fn()
    const w = mount(PasswordField, {
      props: { id: 'pw', label: 'L', modelValue: '', 'onUpdate:modelValue': handler }
    })
    await w.find('button').trigger('click') // show password
    await w.find('input').setValue('visiblepass')
    expect(handler).toHaveBeenCalledWith('visiblepass')
  })
})
