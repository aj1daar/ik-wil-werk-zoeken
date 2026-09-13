/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// A media query adds no specificity. A phone rule written ABOVE the plain rule
// it means to override is dead: the later rule wins and the phone layout
// silently never happens. That shipped twice — pagination tap targets in
// CompaniesView and the custom date fields in HomeView — and both times the
// file looked right on review.
//
// This walks every stylesheet and fails when a declaration inside an @media
// block is followed, later in the same file, by a plain rule with the same
// selector setting the same property. Files are read from disk: Vitest doesn't
// process CSS.

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full)
    return /\.(vue|css)$/.test(name) ? [full] : []
  })
}

function styleOf(file: string): string {
  const text = readFileSync(file, 'utf8')
  if (file.endsWith('.css')) return text
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
}

interface Rule { selector: string; props: Set<string>; media: string | null; layer: string | null; order: number }

// Enough of a CSS reader for this repo's stylesheets: nested @media, @layer and
// @supports blocks, comma-separated selectors, one declaration per `prop:`.
function rulesOf(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: Rule[] = []
  const stack: string[] = []          // open at-rule preludes
  let buffer = ''
  let order = 0

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') {
      const prelude = buffer.trim()
      buffer = ''
      if (prelude.startsWith('@')) { stack.push(prelude); continue }
      const close = src.indexOf('}', i)
      const body = src.slice(i + 1, close)
      const props = new Set(
        body.split(';').map(d => d.split(':')[0].trim().toLowerCase()).filter(p => /^[a-z-]+$/.test(p)),
      )
      const media = stack.filter(p => p.startsWith('@media')).join(' ') || null
      const layer = stack.filter(p => p.startsWith('@layer')).join(' ') || null
      for (const selector of prelude.split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
        rules.push({ selector, props, media, layer, order: order++ })
      }
      i = close
    } else if (ch === '}') {
      stack.pop()
      buffer = ''
    } else {
      buffer += ch
    }
  }
  return rules
}

function deadOverrides(css: string): string[] {
  const rules = rulesOf(css)
  const found: string[] = []
  for (const r of rules) {
    if (!r.media) continue
    for (const later of rules) {
      if (later.media || later.order <= r.order || later.selector !== r.selector) continue
      // Cascade layers outrank source order: an unlayered rule beats any
      // layered one wherever it sits, so a later rule only wins from the same
      // layer, or from outside every layer.
      if (later.layer !== r.layer && later.layer !== null) continue
      const clash = [...r.props].filter(p => later.props.has(p))
      if (clash.length) found.push(`${r.selector} { ${clash.join(', ')} } in ${r.media} is overridden by a later plain rule`)
    }
  }
  return [...new Set(found)]
}

describe('CSS override order', () => {
  it('catches a phone rule placed above the rule it overrides', () => {
    const css = `
      @media (max-width: 767px) { .a { width: 100%; } }
      .a { width: 2rem; color: red; }
    `
    expect(deadOverrides(css)).toEqual(['.a { width } in @media (max-width: 767px) is overridden by a later plain rule'])
  })

  it('accepts the same rule once it comes after', () => {
    const css = `
      .a { width: 2rem; }
      @media (max-width: 767px) { .a { width: 100%; } }
    `
    expect(deadOverrides(css)).toEqual([])
  })

  it('ignores a later rule that sets different properties', () => {
    const css = `
      @media (max-width: 767px) { .a { width: 100%; } }
      .a { color: red; }
    `
    expect(deadOverrides(css)).toEqual([])
  })

  it('knows an unlayered media rule beats a later rule inside @layer', () => {
    const css = `
      @media (max-width: 767px) { .a { font-size: 16px; } }
      @layer components { .a { font-size: .875rem; } }
    `
    expect(deadOverrides(css)).toEqual([])
  })

  it('still catches the trap inside one layer', () => {
    const css = `
      @layer components {
        @media (max-width: 767px) { .a { width: 100%; } }
        .a { width: 2rem; }
      }
    `
    expect(deadOverrides(css)).toHaveLength(1)
  })

  it('reads comma-separated selectors and comments', () => {
    const css = `
      @media (pointer: coarse) { .a, .b { min-height: 44px; } }
      /* .b { min-height: 0 } is only a comment */
      .b { min-height: 2rem; }
    `
    expect(deadOverrides(css)).toEqual(['.b { min-height } in @media (pointer: coarse) is overridden by a later plain rule'])
  })

  const files = walk(SRC)

  it.each(files.map(f => [relative(SRC, f).split(sep).join('/'), f]))(
    '%s has no media rule undone by a later plain rule',
    (_name, file) => {
      expect(deadOverrides(styleOf(file))).toEqual([])
    },
  )
})
