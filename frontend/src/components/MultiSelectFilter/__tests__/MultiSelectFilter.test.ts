import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MultiSelectFilter from '../MultiSelectFilter.vue'

const CITIES = ['Amsterdam', 'Rotterdam', 'Utrecht']

function mountFilter(props: Partial<InstanceType<typeof MultiSelectFilter>['$props']> = {}) {
  return mount(MultiSelectFilter, {
    props: {
      modelValue: [],
      options: CITIES,
      allLabel: 'All cities',
      label: 'Filter by city',
      ...props,
    },
    attachTo: document.body,
  })
}

type Wrapper = ReturnType<typeof mountFilter>

const trigger = (w: Wrapper) => w.find('.multi-filter-trigger')
const options = (w: Wrapper) => w.findAll('.multi-filter-option input')
const emitted = (w: Wrapper) => w.emitted('update:modelValue') as string[][][] | undefined

async function open(w: Wrapper) {
  await trigger(w).trigger('click')
  return w
}

// ── the trigger ──────────────────────────────────────────────────────────────

describe('MultiSelectFilter – what the trigger says', () => {
  it('shows the all-label while nothing is chosen', () => {
    const w = mountFilter()
    expect(trigger(w).text()).toContain('All cities')
  })

  it('names the single chosen value rather than counting it', () => {
    const w = mountFilter({ modelValue: ['Utrecht'] })
    expect(trigger(w).text()).toContain('Utrecht')
    expect(trigger(w).text()).not.toContain('1 selected')
  })

  it('counts once there is more than one', () => {
    const w = mountFilter({ modelValue: ['Utrecht', 'Amsterdam'] })
    expect(trigger(w).text()).toContain('2 selected')
    expect(w.find('.filter-count').text()).toBe('2')
  })

  it('carries the accessible name and its open state', async () => {
    const w = mountFilter()
    expect(trigger(w).attributes('aria-label')).toBe('Filter by city')
    expect(trigger(w).attributes('aria-expanded')).toBe('false')
    await open(w)
    expect(trigger(w).attributes('aria-expanded')).toBe('true')
  })
})

// ── choosing several ─────────────────────────────────────────────────────────

describe('MultiSelectFilter – choosing', () => {
  it('opens on click and lists every option', async () => {
    const w = await open(mountFilter())
    expect(options(w)).toHaveLength(3)
  })

  it('adds a value without dropping the one already chosen', async () => {
    const w = await open(mountFilter({ modelValue: ['Amsterdam'] }))
    await options(w)[2].trigger('change')
    expect(emitted(w)![0][0]).toEqual(['Amsterdam', 'Utrecht'])
  })

  it('removes a value when it is unticked', async () => {
    const w = await open(mountFilter({ modelValue: ['Amsterdam', 'Utrecht'] }))
    await options(w)[0].trigger('change')
    expect(emitted(w)![0][0]).toEqual(['Utrecht'])
  })

  it('ticks the boxes that are already chosen', async () => {
    const w = await open(mountFilter({ modelValue: ['Rotterdam'] }))
    expect(options(w).map(o => (o.element as HTMLInputElement).checked)).toEqual([false, true, false])
  })

  it('stays open while choosing, so several can be picked in one go', async () => {
    const w = await open(mountFilter())
    await options(w)[0].trigger('change')
    expect(w.find('.multi-filter-panel').exists()).toBe(true)
  })

  it('clears everything from the all-label row', async () => {
    const w = await open(mountFilter({ modelValue: ['Amsterdam', 'Utrecht'] }))
    await w.find('.multi-filter-clear').trigger('click')
    expect(emitted(w)![0][0]).toEqual([])
  })

  it('offers no clear row when nothing is chosen', async () => {
    const w = await open(mountFilter())
    expect(w.find('.multi-filter-clear').exists()).toBe(false)
  })
})

// ── searching a long list ────────────────────────────────────────────────────

describe('MultiSelectFilter – searching', () => {
  const MANY = Array.from({ length: 20 }, (_, i) => `City ${i + 1}`)

  it('leaves a short list without a search box', async () => {
    const w = await open(mountFilter())
    expect(w.find('.multi-filter-search-input').exists()).toBe(false)
  })

  it('gives a long list one', async () => {
    const w = await open(mountFilter({ options: MANY }))
    expect(w.find('.multi-filter-search-input').exists()).toBe(true)
  })

  it('narrows the list as you type, ignoring case', async () => {
    const w = await open(mountFilter({ options: ['Amsterdam', 'Rotterdam', 'Utrecht'], searchThreshold: 1 }))
    await w.find('.multi-filter-search-input').setValue('DAM')
    expect(w.findAll('.multi-filter-option')).toHaveLength(2)
  })

  it('says so when nothing matches', async () => {
    const w = await open(mountFilter({ searchThreshold: 1 }))
    await w.find('.multi-filter-search-input').setValue('zzz')
    expect(w.find('.multi-filter-empty').text()).toContain('No match')
  })

  it('keeps a value chosen even when the search hides it', async () => {
    const w = await open(mountFilter({ modelValue: ['Amsterdam'], searchThreshold: 1 }))
    await w.find('.multi-filter-search-input').setValue('Utrecht')
    expect(trigger(w).text()).toContain('Amsterdam')
    expect(emitted(w)).toBeUndefined()
  })
})

// ── closing ──────────────────────────────────────────────────────────────────

describe('MultiSelectFilter – closing', () => {
  it('closes on Escape', async () => {
    const w = await open(mountFilter())
    await w.find('.multi-filter').trigger('keydown', { key: 'Escape' })
    expect(w.find('.multi-filter-panel').exists()).toBe(false)
  })

  it('closes when the pointer goes down outside it', async () => {
    const w = await open(mountFilter())
    document.dispatchEvent(new Event('pointerdown'))
    await w.vm.$nextTick()
    expect(w.find('.multi-filter-panel').exists()).toBe(false)
  })

  it('stays open when the pointer goes down inside it', async () => {
    const w = await open(mountFilter())
    const event = new Event('pointerdown')
    Object.defineProperty(event, 'target', { value: w.find('.multi-filter-panel').element })
    document.dispatchEvent(event)
    await w.vm.$nextTick()
    expect(w.find('.multi-filter-panel').exists()).toBe(true)
  })

  it('stops listening once it is gone', async () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    mountFilter().unmount()
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function))
  })
})

// ── options changing underneath ──────────────────────────────────────────────

describe('MultiSelectFilter – when the options change', () => {
  it('drops a chosen value that is no longer offered', async () => {
    const w = mountFilter({ modelValue: ['Amsterdam', 'Utrecht'] })
    await w.setProps({ options: ['Utrecht'] })
    expect(emitted(w)![0][0]).toEqual(['Utrecht'])
  })

  it('says nothing when every chosen value survives', async () => {
    const w = mountFilter({ modelValue: ['Utrecht'] })
    await w.setProps({ options: ['Utrecht', 'Delft'] })
    expect(emitted(w)).toBeUndefined()
  })
})
