/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppIcon from '../AppIcon.vue'
import { ICONS, type IconName } from '../icons'

const NAMES = Object.keys(ICONS) as IconName[]

describe('AppIcon – rendering', () => {
  it.each(NAMES)('draws "%s"', name => {
    const paths = mount(AppIcon, { props: { name } }).findAll('path')
    expect(paths.length).toBe(ICONS[name].length)
    expect(paths.map(p => p.attributes('d'))).toEqual([...ICONS[name]])
  })

  it('is hidden from assistive technology and never takes focus', () => {
    const svg = mount(AppIcon, { props: { name: 'close' } }).find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('focusable')).toBe('false')
  })

  it('draws every icon with the same 1.5px stroke, whatever its size', () => {
    const w = mount(AppIcon, { props: { name: 'search' } })
    expect(w.find('svg').attributes('stroke-width')).toBe('1.5')
    for (const p of w.findAll('path')) expect(p.attributes('vector-effect')).toBe('non-scaling-stroke')
  })

  it('takes its colour from the text around it', () => {
    const svg = mount(AppIcon, { props: { name: 'check' } }).find('svg')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.attributes('fill')).toBe('none')
  })

  it('passes a sizing class through to the svg', () => {
    const svg = mount(AppIcon, { props: { name: 'plus' }, attrs: { class: 'btn-icon-sm' } }).find('svg')
    expect(svg.classes()).toContain('btn-icon-sm')
  })
})

describe('AppIcon – the registry', () => {
  it('holds 24x24 outline paths that start with a move', () => {
    for (const name of NAMES) {
      expect(ICONS[name].length).toBeGreaterThan(0)
      for (const d of ICONS[name]) expect(d).toMatch(/^M/)
    }
  })

  it('has no two names for the same drawing', () => {
    const drawings = NAMES.map(n => ICONS[n].join('|'))
    expect(new Set(drawings).size).toBe(drawings.length)
  })
})

// Icons used to be pasted as inline <svg>s: 37 of them, 24 shapes, drawn at
// four stroke widths, the close icon copied four times. This keeps them in
// one place. The logo, the journey tree and the select caret are drawings,
// not icons, and are allowed their own markup.
describe('AppIcon – no inline icons elsewhere', () => {
  const SRC = join(process.cwd(), 'src')
  const ALLOWED = ['components/AppLogo/', 'components/StatusTree/', 'components/ui/AppSelect.vue', 'components/ui/AppIcon.vue']
  const files = (function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name: string) => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full)
      return name.endsWith('.vue') ? [full] : []
    })
  })(SRC)
    .map(f => relative(SRC, f).split(sep).join('/'))
    .filter(f => !ALLOWED.some(a => f.startsWith(a)))

  it.each(files)('%s draws icons through AppIcon', file => {
    const template = readFileSync(join(SRC, file), 'utf8').replace(/<style[\s\S]*?<\/style>/g, '')
    expect(template).not.toMatch(/<svg\b/)
  })
})
