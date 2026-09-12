/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Tap targets can only be measured in a real browser (`pnpm screenshots` drives
// one), so this guards the rules that produce them: the coarse-pointer block in
// style.css, and the ordering trap that silently killed the phone rule for
// pagination once already. Files are read from disk — Vitest doesn't process CSS.
const SRC = join(process.cwd(), 'src')

const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8')

function coarseBlock(css: string): string {
  const start = css.indexOf('@media (pointer: coarse)')
  if (start === -1) return ''
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  return ''
}

describe('touch targets – the coarse-pointer block', () => {
  const block = coarseBlock(read('style.css'))

  it('exists at all', () => {
    expect(block).not.toBe('')
  })

  it('clears 44px for every control a finger presses', () => {
    for (const selector of [
      '.btn-primary', '.btn-secondary', '.btn-ghost', '.btn-danger', '.btn-submit',
      '.btn-filter-toggle', '.btn-new', '.status-tab', '.range-btn',
      '.field-input', '.filter-input', '.btn-icon', '.page-btn', '.banner-close',
    ]) {
      expect(block).toContain(selector)
    }
    expect(block).toContain('min-height: 44px')
    expect(block).toContain('min-width: 44px')
  })

  it('keys off the pointer, not the screen width, so touch laptops count', () => {
    expect(block).toContain('(pointer: coarse)')
    expect(block).not.toContain('max-width')
  })

  it('gives checkboxes at least the 24px WCAG floor', () => {
    const applications = coarseBlock(read('views', 'ApplicationsView', 'ApplicationsView.vue'))
    expect(applications).toContain('.row-checkbox')
    expect(applications).toContain('24px')
  })
})

describe('touch targets – phone rules that a later rule could undo', () => {
  // A media query adds no specificity, so a phone rule placed above the plain
  // rule it means to override does nothing. CompaniesView shipped like that.
  it('CompaniesView sizes .page-btn for phones after the base rule', () => {
    const css = read('views', 'CompaniesView', 'CompaniesView.vue')
    const base = css.indexOf('.page-btn {')
    const phone = css.indexOf('.page-btn { min-width: 2.75rem')
    expect(base).toBeGreaterThan(-1)
    expect(phone).toBeGreaterThan(base)
  })
})
