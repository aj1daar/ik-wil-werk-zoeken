import { describe, expect, it } from 'vitest'
import { APP_NAME, pageTitle } from '../title'

describe('pageTitle', () => {
  it('puts the page name first, then the app name', () => {
    expect(pageTitle('My applications')).toBe('My applications | ik wil werk zoeken')
  })

  it('falls back to just the app name when a route has no title', () => {
    expect(pageTitle()).toBe(APP_NAME)
    expect(pageTitle(undefined)).toBe(APP_NAME)
  })

  it('treats an empty or whitespace-only title as missing', () => {
    expect(pageTitle('')).toBe(APP_NAME)
    expect(pageTitle('   ')).toBe(APP_NAME)
  })

  it('trims stray whitespace around the page name', () => {
    expect(pageTitle('  Companies ')).toBe('Companies | ik wil werk zoeken')
  })

  it('no longer uses the IWWZ abbreviation', () => {
    expect(pageTitle('Home')).not.toContain('IWWZ')
    expect(APP_NAME).toBe('ik wil werk zoeken')
  })
})
