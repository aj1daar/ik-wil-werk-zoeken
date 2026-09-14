/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every transition and animation runs on the motion tokens in style.css
// (--dur-instant, --dur-base, --dur-emphasis, --dur-loop, --ease-standard,
// --ease-out). Before they existed the app used ten different durations and
// the browser's default `ease` almost everywhere, so nothing moved at quite
// the same speed. A literal duration or a named curve in a stylesheet fails
// here. The one allowed literal is the .01ms reduced-motion backstop.
// Files are read from disk: Vitest doesn't process CSS.

const SRC = join(process.cwd(), 'src')
const TOKEN_FILE = join(SRC, 'style.css')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full)
    return /\.(vue|css)$/.test(name) ? [full] : []
  })
}

function styleOf(file: string): string {
  const text = readFileSync(file, 'utf8')
  const css = file.endsWith('.css') ? text : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const DECLARATION = /\b(transition|animation)(-duration|-timing-function)?\s*:\s*([^;{}]+)/g
const LITERAL_DURATION = /(^|[\s,(])(\d*\.?\d+)m?s\b/
const NAMED_CURVE = /(^|[\s,])(ease|ease-in|ease-out|ease-in-out)(?=$|[\s,])/

function offences(css: string): string[] {
  const found: string[] = []
  for (const [, prop, suffix = '', value] of css.matchAll(DECLARATION)) {
    const v = value.trim()
    if (v === 'none' || v.startsWith('none ') || v.includes('.01ms')) continue
    if (LITERAL_DURATION.test(v)) found.push(`${prop}${suffix}: ${v} (literal duration)`)
    else if (NAMED_CURVE.test(v)) found.push(`${prop}${suffix}: ${v} (named curve)`)
  }
  return found
}

describe('motion tokens', () => {
  const tokens = readFileSync(TOKEN_FILE, 'utf8')

  it.each(['--dur-instant', '--dur-base', '--dur-sheet', '--dur-emphasis', '--dur-loop', '--ease-standard', '--ease-out'])(
    'style.css defines %s',
    token => {
      expect(tokens).toMatch(new RegExp(`${token}\\s*:`))
    },
  )

  it('flags a literal duration', () => {
    expect(offences('.a { transition: opacity .2s var(--ease-standard); }')).toHaveLength(1)
    expect(offences('.a { animation-duration: 250ms; }')).toHaveLength(1)
  })

  it('flags a named curve even with a token duration', () => {
    expect(offences('.a { transition: opacity var(--dur-base) ease; }')).toHaveLength(1)
  })

  it('accepts tokens, linear loops, none and the reduced-motion backstop', () => {
    expect(offences(`
      .a { transition: opacity var(--dur-base) var(--ease-standard); }
      .b { animation: spin var(--dur-loop) linear infinite; }
      .c { transition: none; }
      * { transition-duration: .01ms !important; }
    `)).toEqual([])
  })

  it('does not trip on a number that is not a duration', () => {
    expect(offences('.a { transition: transform var(--dur-base) var(--ease-standard); } .b { width: 12ms-wide; }')).toEqual([])
  })

  it.each(walk(SRC).map(f => [relative(SRC, f).split(sep).join('/'), f]))(
    '%s uses motion tokens only',
    (_name, file) => {
      expect(offences(styleOf(file))).toEqual([])
    },
  )
})
