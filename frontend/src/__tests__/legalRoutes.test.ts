/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Google's OAuth branding page holds a link to the privacy notice and one to
// the terms, and an account cannot sign in with Google if either link stops
// working. Both pages have to stay public, and both have to stay reachable from
// the pages a person sees before they have an account.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8')

const ROUTER   = read('router', 'index.ts')
const LOGIN    = read('views', 'LoginView', 'LoginView.vue')
const REGISTER = read('views', 'RegisterView', 'RegisterView.vue')

describe('the legal pages', () => {
  it.each(['/privacy', '/terms'])('%s is a route', (path) => {
    expect(ROUTER).toContain(`path: '${path}'`)
  })

  it.each(['/privacy', '/terms'])('%s needs no account', (path) => {
    const line = ROUTER.split('\n').find(l => l.includes(`path: '${path}'`)) ?? ''
    expect(line).not.toContain('requiresAuth')
  })

  it.each(['/privacy', '/terms'])('sign-in links to %s', (path) => {
    expect(LOGIN).toContain(`to="${path}"`)
  })

  it.each(['/privacy', '/terms'])('register links to %s', (path) => {
    expect(REGISTER).toContain(`to="${path}"`)
  })
})
