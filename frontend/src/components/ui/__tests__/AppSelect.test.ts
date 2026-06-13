import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppSelect from '../AppSelect.vue'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(AppSelect, {
    props: { modelValue: '', options: OPTIONS, ...props },
  })
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('AppSelect – rendering', () => {
  it('renders a <select> element', () => {
    const w = mountSelect()
    expect(w.find('select').exists()).toBe(true)
  })

  it('renders all option values', () => {
    const w = mountSelect()
    const values = w.findAll('option').map(o => (o.element as HTMLOptionElement).value)
    expect(values).toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })

  it('renders option labels', () => {
    const w = mountSelect()
    const labels = w.findAll('option').map(o => o.text())
    expect(labels).toEqual(expect.arrayContaining(['Alpha', 'Beta', 'Gamma']))
  })

  it('renders a placeholder option when placeholder prop is set', () => {
    const w = mountSelect({ placeholder: 'Pick one' })
    const placeholder = w.findAll('option').find(o => o.text() === 'Pick one')
    expect(placeholder).toBeTruthy()
  })

  it('placeholder option has empty value', () => {
    const w = mountSelect({ placeholder: 'Pick one' })
    const placeholder = w.findAll('option').find(o => o.text() === 'Pick one')
    expect((placeholder!.element as HTMLOptionElement).value).toBe('')
  })

  it('placeholder option is disabled', () => {
    const w = mountSelect({ placeholder: 'Pick one' })
    const placeholder = w.findAll('option').find(o => o.text() === 'Pick one')
    expect((placeholder!.element as HTMLOptionElement).disabled).toBe(true)
  })

  it('does not render a placeholder option when placeholder is not set', () => {
    const w = mountSelect({ placeholder: undefined })
    expect(w.findAll('option')).toHaveLength(OPTIONS.length)
  })

  it('renders the chevron SVG icon', () => {
    const w = mountSelect()
    expect(w.find('svg.app-select-chevron').exists()).toBe(true)
  })

  it('chevron SVG has aria-hidden', () => {
    const w = mountSelect()
    expect(w.find('svg.app-select-chevron').attributes('aria-hidden')).toBe('true')
  })

  it('select has class app-select', () => {
    const w = mountSelect()
    expect(w.find('select').classes()).toContain('app-select')
  })

  it('wrapper has class app-select-wrapper', () => {
    const w = mountSelect()
    expect(w.find('.app-select-wrapper').exists()).toBe(true)
  })
})

// ── modelValue binding ────────────────────────────────────────────────────────

describe('AppSelect – modelValue binding', () => {
  it('select value reflects modelValue prop', () => {
    const w = mountSelect({ modelValue: 'b' })
    expect((w.find('select').element as HTMLSelectElement).value).toBe('b')
  })

  it('select shows placeholder when modelValue is empty string and placeholder is set', () => {
    const w = mountSelect({ modelValue: '', placeholder: 'Choose…' })
    expect((w.find('select').element as HTMLSelectElement).value).toBe('')
  })

  it('emits update:modelValue when selection changes', async () => {
    const w = mountSelect({ modelValue: 'a' })
    await w.find('select').setValue('c')
    expect(w.emitted('update:modelValue')).toBeTruthy()
    expect(w.emitted('update:modelValue')![0]).toEqual(['c'])
  })

  it('emits the correct value when switching between options', async () => {
    const w = mountSelect({ modelValue: 'a' })
    await w.find('select').setValue('b')
    expect(w.emitted('update:modelValue')![0]).toEqual(['b'])
  })

  it('emits update:modelValue with string type', async () => {
    const w = mountSelect({ modelValue: 'a' })
    await w.find('select').setValue('c')
    const emitted = w.emitted('update:modelValue')![0][0]
    expect(typeof emitted).toBe('string')
  })
})

// ── accessibility ─────────────────────────────────────────────────────────────

describe('AppSelect – accessibility', () => {
  it('forwards id prop to the <select> element', () => {
    const w = mountSelect({ id: 'status-filter' })
    expect(w.find('select').attributes('id')).toBe('status-filter')
  })

  it('forwards aria-label prop to the <select> element', () => {
    const w = mountSelect({ ariaLabel: 'Filter by status' })
    expect(w.find('select').attributes('aria-label')).toBe('Filter by status')
  })

  it('does not set aria-label when prop is not provided', () => {
    const w = mountSelect()
    expect(w.find('select').attributes('aria-label')).toBeUndefined()
  })
})

// ── edge cases ────────────────────────────────────────────────────────────────

describe('AppSelect – edge cases', () => {
  it('renders correctly with an empty options array', () => {
    const w = mount(AppSelect, { props: { modelValue: '', options: [] } })
    expect(w.find('select').exists()).toBe(true)
    expect(w.findAll('option')).toHaveLength(0)
  })

  it('handles option labels with special characters', () => {
    const w = mount(AppSelect, {
      props: {
        modelValue: '',
        options: [{ value: 'x', label: '<script>alert(1)</script>' }],
      },
    })
    const opt = w.find('option')
    expect(opt.text()).toBe('<script>alert(1)</script>')
    expect(opt.html()).not.toContain('<script>')
  })

  it('handles a large number of options without throwing', () => {
    const big = Array.from({ length: 500 }, (_, i) => ({ value: `v${i}`, label: `Label ${i}` }))
    const w = mount(AppSelect, { props: { modelValue: '', options: big } })
    expect(w.findAll('option')).toHaveLength(500)
  })

  it('placeholder is selected when modelValue is empty string', () => {
    const w = mountSelect({ placeholder: 'Choose…', modelValue: '' })
    const sel = w.find('select').element as HTMLSelectElement
    expect(sel.value).toBe('')
  })

  it('does not emit on initial render', () => {
    const w = mountSelect({ modelValue: 'a' })
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })
})
