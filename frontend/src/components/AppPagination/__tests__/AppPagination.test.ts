import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppPagination from '../AppPagination.vue'

type Wrapper = ReturnType<typeof mount>

function mountAt(page: number, total: number, pageSize = 10) {
  return mount(AppPagination, { props: { page, total, pageSize } })
}

// What each row shows, in order: page numbers, "…" for a gap
function row(w: Wrapper, which: 'desktop' | 'phone'): string[] {
  const hiddenOn = which === 'desktop' ? 'phone-only' : 'desktop-only'
  return w.findAll('.pagination-buttons > .page-btn, .pagination-buttons > .page-ellipsis')
    .filter(el => !el.classes().includes(hiddenOn))
    .filter(el => el.attributes('aria-label') === undefined)
    .map(el => el.text())
}

describe('AppPagination – the count', () => {
  it('says which items are showing out of how many', () => {
    expect(mountAt(1, 96).find('.pagination-info').text()).toBe('1–10 of 96')
    expect(mountAt(10, 96).find('.pagination-info').text()).toBe('91–96 of 96')
  })

  it('writes large totals with thousands separators', () => {
    expect(mountAt(800, 12790, 16).find('.pagination-info').text()).toBe('12,785–12,790 of 12,790')
  })

  it('reads 0–0 of 0 rather than 1–0 of 0 for an empty list', () => {
    expect(mountAt(1, 0).find('.pagination-info').text()).toBe('0–0 of 0')
  })
})

describe('AppPagination – which pages are offered', () => {
  it('lists every page when there are seven or fewer', () => {
    expect(row(mountAt(1, 70), 'desktop')).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })

  it('on desktop, shows the ends and two either side of the current page', () => {
    expect(row(mountAt(5, 96), 'desktop')).toEqual(['1', '…', '3', '4', '5', '6', '7', '…', '10'])
  })

  it('on a phone, trims to first, current and last, marking every gap', () => {
    expect(row(mountAt(5, 96), 'phone')).toEqual(['1', '…', '5', '…', '10'])
  })

  it('never shows a trimmed phone row without a gap marker', () => {
    // The trap: desktop "1 2 3 4 5 … 10" minus the near pages is "1 3 10"
    expect(row(mountAt(3, 96), 'phone')).toEqual(['1', '…', '3', '…', '10'])
  })

  it('does not put a gap between neighbouring pages', () => {
    expect(row(mountAt(2, 96), 'phone')).toEqual(['1', '2', '…', '10'])
    expect(row(mountAt(1, 96), 'phone')).toEqual(['1', '…', '10'])
    expect(row(mountAt(10, 96), 'phone')).toEqual(['1', '…', '10'])
  })

  it('keeps the phone row to five buttons at most, arrows included', () => {
    for (let page = 1; page <= 800; page += 37) {
      const numbers = row(mountAt(page, 12790, 16), 'phone').filter(t => t !== '…')
      expect(numbers.length + 2).toBeLessThanOrEqual(5)
    }
  })

  it('handles a single page', () => {
    const w = mountAt(1, 4)
    expect(row(w, 'desktop')).toEqual(['1'])
    expect(row(w, 'phone')).toEqual(['1'])
  })
})

describe('AppPagination – moving between pages', () => {
  it('asks for the page that was clicked', async () => {
    const w = mountAt(1, 96)
    await w.findAll('.page-btn').find(b => b.text() === '3')!.trigger('click')
    expect(w.emitted('update:page')).toEqual([[3]])
  })

  it('steps with the arrows', async () => {
    const w = mountAt(5, 96)
    await w.find('[aria-label="Next page"]').trigger('click')
    await w.find('[aria-label="Previous page"]').trigger('click')
    expect(w.emitted('update:page')).toEqual([[6], [4]])
  })

  it('disables the arrows at either end', () => {
    expect(mountAt(1, 96).find('[aria-label="Previous page"]').attributes('disabled')).toBeDefined()
    expect(mountAt(10, 96).find('[aria-label="Next page"]').attributes('disabled')).toBeDefined()
  })

  it('does not ask for the page it is already on', async () => {
    const w = mountAt(4, 96)
    await w.find('.page-btn--active').trigger('click')
    expect(w.emitted('update:page')).toBeUndefined()
  })

  it('marks the current page for assistive technology', () => {
    const current = mountAt(4, 96).findAll('[aria-current="page"]')
    expect(current.map(b => b.text())).toEqual(['4'])
  })

  it('draws the arrows as icons, not ‹ › characters', () => {
    const w = mountAt(2, 96)
    for (const label of ['Previous page', 'Next page']) {
      const btn = w.find(`[aria-label="${label}"]`)
      expect(btn.find('svg').exists()).toBe(true)
      expect(btn.text()).toBe('')
    }
  })

  it('is a navigation landmark', () => {
    const nav = mountAt(1, 96).find('nav')
    expect(nav.attributes('aria-label')).toBe('Pages')
  })
})
