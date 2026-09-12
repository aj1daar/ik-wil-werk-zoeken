/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every colour lives in style.css as a light + dark token pair. A hex or
// rgb() literal in a component stylesheet skips dark mode (the original
// overdue card and follow-up badges did exactly that), so this guards it.
// Files are read from disk: Vitest doesn't process CSS, so a `?raw` import
// of a .css file comes back empty. Paths hang off the frontend root (where
// vitest runs) because import.meta.url isn't a file: URL under happy-dom.

const SRC = join(process.cwd(), 'src')
const TOKEN_FILE = 'style.css'
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full)
    return /\.(vue|css)$/.test(name) ? [full] : []
  })
}

const rel = (file: string) => relative(SRC, file).split(sep).join('/')

function styleOf(file: string): string {
  const text = readFileSync(file, 'utf8')
  if (file.endsWith('.css')) return text
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
}

// Strip comments so a hex value mentioned in an explanation doesn't count
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const tokenCss   = readFileSync(join(SRC, TOKEN_FILE), 'utf8')
const components = walk(SRC).filter(f => rel(f) !== TOKEN_FILE)

describe('design tokens', () => {
  it('finds the token file and component styles to check', () => {
    expect(tokenCss.length).toBeGreaterThan(0)
    expect(components.length).toBeGreaterThan(10)
  })

  it.each(components.map(f => [rel(f), f]))('%s uses colour tokens, not literals', (_name, file) => {
    const offending = withoutComments(styleOf(file))
      .split('\n')
      .filter(line => COLOUR_LITERAL.test(line))
      .map(line => line.trim())
    expect(offending).toEqual([])
  })

  it('style.css defines every --col token for both themes', () => {
    const css = withoutComments(tokenCss)
    const [light, rest] = css.split(':root[data-theme="dark"]')
    const dark = rest.split('/* ─── Base')[0]
    const names = (block: string) => new Set([...block.matchAll(/(--col-[a-z-]+)\s*:/g)].map(m => m[1]))
    const lightNames = names(light)
    const darkNames  = names(dark)
    expect(lightNames.size).toBeGreaterThan(20)
    expect([...lightNames].filter(n => !darkNames.has(n))).toEqual([])
  })

  it('every var(--col-…) used in a component is defined in style.css', () => {
    const defined = new Set([...tokenCss.matchAll(/(--col-[a-z-]+)\s*:/g)].map(m => m[1]))
    const used = new Set(components.flatMap(f => [...readFileSync(f, 'utf8').matchAll(/var\((--col-[a-z-]+)/g)].map(m => m[1])))
    expect([...used].filter(n => !defined.has(n))).toEqual([])
  })
})
