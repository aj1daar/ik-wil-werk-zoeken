import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DatePicker from '../DatePicker.vue'

function setViewport(width: number) {
  ;(window as any).happyDOM.setViewport({ width })
}

let mounted: ReturnType<typeof mount>[] = []

function mountPicker(props: Record<string, unknown> = {}) {
  const w = mount(DatePicker, { props: { modelValue: '', ...props } })
  mounted.push(w)
  return w
}

afterEach(() => {
  // Unmount before clearing the DOM and resetting the viewport — the
  // component's matchMedia 'change' listener outlives the test otherwise
  // and fires into a body that's already been wiped out from under it.
  mounted.forEach(w => w.unmount())
  mounted = []
  setViewport(1024)
  document.body.innerHTML = ''
})

// ── desktop: custom calendar dropdown ───────────────────────────────────────

describe('DatePicker – desktop (width > 767px)', () => {
  beforeEach(() => setViewport(1024))

  it('renders the trigger as a button, not a native date input', () => {
    const w = mountPicker()
    const trigger = w.find('.dp-trigger')
    expect(trigger.element.tagName).toBe('BUTTON')
    expect(w.find('.dp-native').exists()).toBe(false)
  })

  it('no calendar panel is present before the trigger is clicked', () => {
    mountPicker()
    expect(document.querySelector('.dp-panel')).toBeNull()
  })

  it('clicking the trigger opens the teleported calendar panel', async () => {
    const w = mountPicker()
    await w.find('.dp-trigger').trigger('click')
    expect(document.querySelector('.dp-panel')).not.toBeNull()
  })

  it('selecting a day emits update:modelValue with YYYY-MM-DD and closes the panel', async () => {
    const w = mountPicker({ modelValue: '2026-03-15' })
    await w.find('.dp-trigger').trigger('click')
    const day15 = Array.from(document.querySelectorAll<HTMLElement>('.dp-day'))
      .find(el => el.textContent?.trim() === '15' && !el.classList.contains('dp-day--dim'))!
    day15.click()
    await flushPromises()
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['2026-03-15'])
    expect(document.querySelector('.dp-panel')).toBeNull()
  })

  it('Escape closes the panel without emitting a change', async () => {
    const w = mountPicker()
    await w.find('.dp-trigger').trigger('click')
    document.querySelector<HTMLElement>('.dp-panel')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.dp-panel')).toBeNull()
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })

  it('applies the id prop to the button trigger', () => {
    const w = mountPicker({ id: 'my-date' })
    expect(w.find('#my-date').element.tagName).toBe('BUTTON')
  })
})

// ── mobile: native OS date picker ───────────────────────────────────────────

describe('DatePicker – mobile (width <= 767px)', () => {
  beforeEach(() => setViewport(375))

  it('renders a native <input type="date"> instead of the custom trigger button', () => {
    const w = mountPicker()
    const el = w.find('.dp-native').element as HTMLInputElement
    expect(el.tagName).toBe('INPUT')
    expect(el.type).toBe('date')
  })

  it('never renders the custom calendar panel, even after interaction', async () => {
    const w = mountPicker()
    await w.find('.dp-native').trigger('click')
    expect(document.querySelector('.dp-panel')).toBeNull()
  })

  it('is not teleported outside the component — no detached panel in body', () => {
    mountPicker()
    expect(document.body.querySelector('.dp-panel')).toBeNull()
  })

  it('pre-fills the native input value from modelValue', () => {
    const w = mountPicker({ modelValue: '2026-06-01' })
    expect((w.find('.dp-native').element as HTMLInputElement).value).toBe('2026-06-01')
  })

  it('emits update:modelValue when the native input changes', async () => {
    const w = mountPicker()
    await w.find('.dp-native').setValue('2026-07-04')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['2026-07-04'])
  })

  it('applies the id prop to the native input', () => {
    const w = mountPicker({ id: 'my-date' })
    const el = w.find('#my-date').element
    expect(el.tagName).toBe('INPUT')
    expect((el as HTMLInputElement).type).toBe('date')
  })

  it('exactly at the 767px boundary still renders the native input', () => {
    setViewport(767)
    const w = mountPicker()
    expect(w.find('.dp-native').exists()).toBe(true)
  })
})

// ── boundary ─────────────────────────────────────────────────────────────────

describe('DatePicker – breakpoint boundary', () => {
  it('768px (one above the mobile cutoff) uses the desktop custom picker', () => {
    setViewport(768)
    const w = mountPicker()
    expect(w.find('.dp-native').exists()).toBe(false)
    expect(w.find('.dp-trigger').element.tagName).toBe('BUTTON')
  })
})
