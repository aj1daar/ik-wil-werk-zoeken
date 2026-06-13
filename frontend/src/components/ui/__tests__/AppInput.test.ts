import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppInput from '../AppInput.vue'

function mountInput(props: Record<string, unknown> = {}) {
  return mount(AppInput, { props: { modelValue: '', ...props } })
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('AppInput – rendering', () => {
  it('renders an <input> element', () => {
    const w = mountInput()
    expect(w.find('input').exists()).toBe(true)
  })

  it('defaults to type="text" when type prop is omitted', () => {
    const w = mountInput()
    expect(w.find('input').attributes('type')).toBe('text')
  })

  it('forwards type prop to the input', () => {
    const w = mountInput({ type: 'email' })
    expect(w.find('input').attributes('type')).toBe('email')
  })

  it('forwards type="date" to the input', () => {
    const w = mountInput({ type: 'date' })
    expect(w.find('input').attributes('type')).toBe('date')
  })

  it('forwards type="password" to the input', () => {
    const w = mountInput({ type: 'password' })
    expect(w.find('input').attributes('type')).toBe('password')
  })

  it('forwards placeholder prop', () => {
    const w = mountInput({ placeholder: 'Enter your name' })
    expect(w.find('input').attributes('placeholder')).toBe('Enter your name')
  })

  it('forwards id prop to the input', () => {
    const w = mountInput({ id: 'first-name' })
    expect(w.find('input').attributes('id')).toBe('first-name')
  })

  it('forwards autocomplete prop to the input', () => {
    const w = mountInput({ autocomplete: 'email' })
    expect(w.find('input').attributes('autocomplete')).toBe('email')
  })

  it('has class app-input on the native input', () => {
    const w = mountInput()
    expect(w.find('input').classes()).toContain('app-input')
  })

  it('wrapper has class app-input-wrapper', () => {
    const w = mountInput()
    expect(w.find('.app-input-wrapper').exists()).toBe(true)
  })
})

// ── modelValue binding ────────────────────────────────────────────────────────

describe('AppInput – modelValue binding', () => {
  it('sets the input value from modelValue prop', () => {
    const w = mountInput({ modelValue: 'hello' })
    expect((w.find('input').element as HTMLInputElement).value).toBe('hello')
  })

  it('emits update:modelValue on user input', async () => {
    const w = mountInput({ modelValue: '' })
    await w.find('input').setValue('typed text')
    expect(w.emitted('update:modelValue')).toBeTruthy()
    expect(w.emitted('update:modelValue')![0]).toEqual(['typed text'])
  })

  it('emits the correct string value', async () => {
    const w = mountInput({ modelValue: '' })
    await w.find('input').setValue('abc')
    const emitted = w.emitted('update:modelValue')![0][0]
    expect(typeof emitted).toBe('string')
    expect(emitted).toBe('abc')
  })

  it('does not emit on initial render', () => {
    const w = mountInput({ modelValue: 'existing' })
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })

  it('emits an empty string when the input is cleared', async () => {
    const w = mountInput({ modelValue: 'hello' })
    await w.find('input').setValue('')
    expect(w.emitted('update:modelValue')![0]).toEqual([''])
  })
})

// ── error state ───────────────────────────────────────────────────────────────

describe('AppInput – error state', () => {
  it('does not render an error message when error prop is absent', () => {
    const w = mountInput()
    expect(w.find('.app-input-error').exists()).toBe(false)
  })

  it('renders the error message when error prop is set', () => {
    const w = mountInput({ error: 'This field is required' })
    expect(w.find('.app-input-error').exists()).toBe(true)
    expect(w.find('.app-input-error').text()).toBe('This field is required')
  })

  it('sets aria-invalid="true" when error prop is set', () => {
    const w = mountInput({ error: 'Required' })
    expect(w.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('does not set aria-invalid when there is no error', () => {
    const w = mountInput()
    expect(w.find('input').attributes('aria-invalid')).toBeUndefined()
  })

  it('sets aria-describedby linking input to error element when both id and error are set', () => {
    const w = mountInput({ id: 'my-field', error: 'Invalid input' })
    expect(w.find('input').attributes('aria-describedby')).toBe('my-field-error')
    expect(w.find('#my-field-error').exists()).toBe(true)
  })

  it('does not set aria-describedby when id is absent (even with error)', () => {
    const w = mountInput({ error: 'Invalid input' })
    expect(w.find('input').attributes('aria-describedby')).toBeUndefined()
  })

  it('error element id matches aria-describedby value', () => {
    const w = mountInput({ id: 'email', error: 'Invalid email' })
    const errorEl = w.find('.app-input-error')
    expect(errorEl.attributes('id')).toBe('email-error')
    expect(w.find('input').attributes('aria-describedby')).toBe('email-error')
  })

  it('removing error prop hides the error message', async () => {
    const w = mountInput({ error: 'Bad input' })
    expect(w.find('.app-input-error').exists()).toBe(true)
    await w.setProps({ error: '' })
    expect(w.find('.app-input-error').exists()).toBe(false)
  })
})

// ── edge cases & security ────────────────────────────────────────────────────

describe('AppInput – edge cases', () => {
  it('renders correctly with an empty string modelValue', () => {
    const w = mountInput({ modelValue: '' })
    expect((w.find('input').element as HTMLInputElement).value).toBe('')
  })

  it('handles special characters in modelValue without throwing', () => {
    const xss = '<script>alert(1)</script>'
    const w = mountInput({ modelValue: xss })
    expect((w.find('input').element as HTMLInputElement).value).toBe(xss)
    // Value is stored in the input's value property, not injected as HTML
    expect(w.find('script').exists()).toBe(false)
  })

  it('error message text is escaped (XSS protection)', () => {
    const xss = '<img src=x onerror=alert(1)>'
    const w = mountInput({ error: xss })
    expect(w.find('.app-input-error').text()).toBe(xss)
    expect(w.find('.app-input-error').html()).not.toContain('<img')
  })

  it('emits multiple times as user keeps typing', async () => {
    const w = mountInput({ modelValue: '' })
    await w.find('input').setValue('a')
    await w.find('input').setValue('ab')
    await w.find('input').setValue('abc')
    expect(w.emitted('update:modelValue')).toHaveLength(3)
  })
})
