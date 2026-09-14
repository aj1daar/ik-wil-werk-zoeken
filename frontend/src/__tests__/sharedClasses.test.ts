/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Buttons, chips and inputs are defined once, in style.css. A page that
// restyles one in its own scoped <style> starts a second copy that drifts:
// Admin's buttons grew to 40px with 14.4px text, the company popup's danger
// button turned solid red while every other one was an outline, and the only
// .btn-secondary lived inside the new-application form, so Profile's Cancel
// button rendered with no styling at all. Pages may position these (width,
// flex, margin) through their own class names, but not redefine them.

const SRC = join(process.cwd(), 'src')
const SHARED = ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'btn-submit', 'btn-icon', 'chip', 'chip--sm', 'field-input', 'filter-input', 'auth-input']

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : vueFiles(full)
    return name.endsWith('.vue') ? [full] : []
  })
}

// Every scoped stylesheet a component uses: inline <style scoped> blocks and
// <style src="…" scoped> files
function scopedCss(file: string): string {
  const text = readFileSync(file, 'utf8')
  const parts: string[] = []
  for (const m of text.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
    const attrs = m[1]
    if (!/\bscoped\b/.test(attrs)) continue
    const src = attrs.match(/src="([^"]+)"/)?.[1]
    parts.push(src ? readFileSync(resolve(dirname(file), src), 'utf8') : m[2])
  }
  return parts.join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
}

// Rule selectors that are a shared class on its own, optionally with a state
// (`.btn-primary`, `.btn-danger:disabled`), as opposed to a page's own class
// that happens to sit on the same element (`.nav-signout`, `.btn-new`)
function redefinitions(css: string): string[] {
  const found: string[] = []
  for (const [, selectorList] of css.matchAll(/([^{}@;]+)\{/g)) {
    for (const selector of selectorList.split(',').map(s => s.trim())) {
      const m = selector.match(/^\.([\w-]+)(:[\w\-():.]+)?$/)
      if (m && SHARED.includes(m[1])) found.push(selector)
    }
  }
  return found
}

describe('shared classes are defined once', () => {
  it('spots a scoped copy of a shared class, with or without a state', () => {
    expect(redefinitions('.btn-primary { padding: 1rem } .btn-danger:disabled { opacity: .5 }'))
      .toEqual(['.btn-primary', '.btn-danger:disabled'])
  })

  it("leaves a page's own classes alone, even on a shared element", () => {
    expect(redefinitions('.btn-new { flex: 1 } .nav-signout { min-height: 2rem } .modal-footer .btn-primary { flex: 1 }')).toEqual([])
  })

  it('reads media queries and comma lists', () => {
    expect(redefinitions('@media (max-width: 767px) { .row, .chip { font-size: 1px } }')).toEqual(['.chip'])
  })

  it.each(vueFiles(SRC).map(f => [relative(SRC, f).split(sep).join('/'), f]))(
    '%s does not redefine a shared class',
    (_name, file) => {
      expect(redefinitions(scopedCss(file))).toEqual([])
    },
  )
})
