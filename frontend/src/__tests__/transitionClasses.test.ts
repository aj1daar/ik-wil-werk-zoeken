/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Tailwind removes rules inside `@layer` whose class name never appears
// literally in a template. Vue's transition classes (modal-enter-from,
// toast-leave-active, …) are only ever added at runtime, so a rule for them
// inside @layer components is silently stripped from the build. That is how
// the modal backdrop fade, every toast animation and the application list
// fade shipped without ever running. Scoped <style> blocks aren't processed
// by Tailwind's layers, so only plain stylesheets are checked.

const SRC = join(process.cwd(), 'src')
const TRANSITION_CLASS = /\.[\w-]+-(enter|leave)-(from|active|to)\b/

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : cssFiles(full)
    return name.endsWith('.css') ? [full] : []
  })
}

function layeredTransitionSelectors(css: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const found: string[] = []
  const stack: string[] = []
  let buffer = ''
  for (const ch of src) {
    if (ch === '{') {
      const prelude = buffer.trim()
      stack.push(prelude)
      if (!prelude.startsWith('@') && stack.some(p => p.startsWith('@layer')) && TRANSITION_CLASS.test(prelude)) {
        found.push(prelude.replace(/\s+/g, ' '))
      }
      buffer = ''
    } else if (ch === '}') {
      stack.pop()
      buffer = ''
    } else if (ch === ';') {
      buffer = ''
    } else {
      buffer += ch
    }
  }
  return found
}

describe('Vue transition classes stay out of Tailwind layers', () => {
  it('spots a transition rule inside a layer', () => {
    expect(layeredTransitionSelectors('@layer components { .toast-enter-from { opacity: 0 } }'))
      .toEqual(['.toast-enter-from'])
  })

  it('spots one nested in a media query inside a layer', () => {
    expect(layeredTransitionSelectors('@layer components { @media (prefers-reduced-motion: reduce) { .modal-leave-active { transition: none } } }'))
      .toEqual(['.modal-leave-active'])
  })

  it('accepts the same rule outside any layer', () => {
    expect(layeredTransitionSelectors('.toast-enter-from { opacity: 0 } @layer components { .tag { color: red } }')).toEqual([])
  })

  it.each(cssFiles(SRC).map(f => [relative(SRC, f).split(sep).join('/'), f]))(
    '%s keeps its transition classes unlayered',
    (_name, file) => {
      expect(layeredTransitionSelectors(readFileSync(file, 'utf8'))).toEqual([])
    },
  )
})
