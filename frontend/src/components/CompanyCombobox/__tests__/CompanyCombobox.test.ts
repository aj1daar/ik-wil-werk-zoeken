import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CompanyCombobox, { type CompanyOption } from '../CompanyCombobox.vue'

const OPTIONS: CompanyOption[] = [
  { id: 'c1', name: 'Acme B.V.', city: 'Amsterdam', coreIndustry: 'Fintech' },
  { id: 'c2', name: 'Acme Holding', city: null, coreIndustry: null },
  { id: 'c3', name: 'Acme Labs', city: 'Utrecht' },
]

function mountBox(props: Partial<InstanceType<typeof CompanyCombobox>['$props']> = {}) {
  return mount(CompanyCombobox, {
    props: { modelValue: '', suggestions: [], ...props },
    attachTo: document.body,
  })
}

type Wrapper = ReturnType<typeof mountBox>

const input    = (w: Wrapper) => w.find('input')
const list     = (w: Wrapper) => w.find('.combobox-dropdown')
const rows     = (w: Wrapper) => w.findAll('.combobox-option')
const typed    = (w: Wrapper) => w.emitted('update:modelValue') as string[][] | undefined
const picked   = (w: Wrapper) => w.emitted('select') as CompanyOption[][] | undefined

// ── typing ───────────────────────────────────────────────────────────────────

describe('CompanyCombobox – typing', () => {
  it('shows the value it was given', () => {
    expect(input(mountBox({ modelValue: 'Acme' })).element.value).toBe('Acme')
  })

  it('reports what was typed', async () => {
    const w = mountBox()
    await input(w).setValue('Acm')
    expect(typed(w)![0][0]).toBe('Acm')
  })

  it('uses the id it was given, so a label can point at it', () => {
    const w = mountBox({ inputId: 'panel-company' })
    expect(input(w).attributes('id')).toBe('panel-company')
  })

  it('carries the combobox roles and collapsed state', () => {
    const w = mountBox()
    expect(input(w).attributes('role')).toBe('combobox')
    expect(input(w).attributes('aria-expanded')).toBe('false')
    expect(input(w).attributes('aria-haspopup')).toBe('listbox')
  })
})

// ── the list ─────────────────────────────────────────────────────────────────

describe('CompanyCombobox – suggestions', () => {
  it('stays closed while there are none', () => {
    expect(list(mountBox()).exists()).toBe(false)
  })

  it('opens as soon as there are some', () => {
    const w = mountBox({ suggestions: OPTIONS })
    expect(list(w).exists()).toBe(true)
    expect(rows(w)).toHaveLength(3)
    expect(input(w).attributes('aria-expanded')).toBe('true')
  })

  it('shows the city and industry when a company has them', () => {
    const w = mountBox({ suggestions: OPTIONS })
    expect(rows(w)[0].text()).toContain('Amsterdam')
    expect(rows(w)[0].text()).toContain('Fintech')
  })

  it('leaves out the city and industry when a company has neither', () => {
    const w = mountBox({ suggestions: [OPTIONS[1]] })
    expect(rows(w)[0].findAll('span')).toHaveLength(1)
  })

  it('reports the company that was clicked', async () => {
    const w = mountBox({ suggestions: OPTIONS })
    await rows(w)[2].trigger('mousedown')
    expect(picked(w)![0][0].id).toBe('c3')
  })

  it('closes once a company is chosen, without waiting for new suggestions', async () => {
    const w = mountBox({ suggestions: OPTIONS })
    await rows(w)[0].trigger('mousedown')
    expect(list(w).exists()).toBe(false)
  })

  it('opens again on the next keystroke', async () => {
    const w = mountBox({ suggestions: OPTIONS })
    await rows(w)[0].trigger('mousedown')
    await input(w).setValue('Acme L')
    expect(list(w).exists()).toBe(true)
  })
})

// ── keyboard ─────────────────────────────────────────────────────────────────

describe('CompanyCombobox – keyboard', () => {
  it('highlights the first company on arrow down', async () => {
    const w = mountBox({ suggestions: OPTIONS })
    await input(w).trigger('keydown', { key: 'ArrowDown' })
    expect(rows(w)[0].classes()).toContain('combobox-option--active')
    expect(input(w).attributes('aria-activedescendant')).toBe('suggestion-0')
  })

  it('walks down the list and stops at the end', async () => {
    const w = mountBox({ suggestions: OPTIONS })
    for (let i = 0; i < 5; i++) await input(w).trigger('keydown', { key: 'ArrowDown' })
    expect(rows(w)[2].classes()).toContain('combobox-option--active')
  })

  it('walks back up and stops at the first', async () => {
    const w = mountBox({ suggestions: OPTIONS })
    await input(w).trigger('keydown', { key: 'ArrowDown' })
    await input(w).trigger('keydown', { key: 'ArrowDown' })
    await input(w).trigger('keydown', { key: 'ArrowUp' })
    await input(w).trigger('keydown', { key: 'ArrowUp' })
    expect(rows(w)[0].classes()).toContain('combobox-option--active')
  })

  it('chooses the highlighted company on Enter', async () => {
    const w = mountBox({ suggestions: OPTIONS })
    await input(w).trigger('keydown', { key: 'ArrowDown' })
    await input(w).trigger('keydown', { key: 'ArrowDown' })
    await input(w).trigger('keydown', { key: 'Enter' })
    expect(picked(w)![0][0].id).toBe('c2')
  })

  it('leaves Enter alone while nothing is highlighted, so the form can submit', async () => {
    const w = mountBox({ suggestions: OPTIONS })
    await input(w).trigger('keydown', { key: 'Enter' })
    expect(picked(w)).toBeUndefined()
  })

  it('closes on Escape without choosing anything', async () => {
    const w = mountBox({ suggestions: OPTIONS })
    await input(w).trigger('keydown', { key: 'Escape' })
    expect(list(w).exists()).toBe(false)
    expect(picked(w)).toBeUndefined()
  })

  it('ignores the arrows while the list is closed', async () => {
    const w = mountBox()
    await input(w).trigger('keydown', { key: 'ArrowDown' })
    expect(input(w).attributes('aria-activedescendant')).toBeUndefined()
  })
})

// ── leaving the field ────────────────────────────────────────────────────────

describe('CompanyCombobox – blur', () => {
  it('closes shortly after the field loses focus', async () => {
    vi.useFakeTimers()
    const w = mountBox({ suggestions: OPTIONS })
    await input(w).trigger('blur')
    expect(list(w).exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(list(w).exists()).toBe(false)
    vi.useRealTimers()
  })

  it('still reports a company clicked as the field loses focus', async () => {
    vi.useFakeTimers()
    const w = mountBox({ suggestions: OPTIONS })
    await input(w).trigger('blur')
    await rows(w)[0].trigger('mousedown')
    expect(picked(w)![0][0].id).toBe('c1')
    vi.useRealTimers()
  })
})
