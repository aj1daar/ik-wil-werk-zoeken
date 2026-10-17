/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRIVACY_VERSION } from '../utils/privacy'

// The page shows one version and the API accepts exactly one, so a build where
// they differ cannot register anybody at all: every attempt is refused with
// "the privacy notice has changed". Cheaper to fail here.
const NOTICE = join(process.cwd(), '..', 'backend', 'Services', 'PrivacyNotice.cs')

describe('the privacy notice version', () => {
  it('is the one the API accepts', () => {
    const source = readFileSync(NOTICE, 'utf8')
    const match  = source.match(/public const string Version = "([^"]+)"/)
    expect(match, 'PrivacyNotice.cs no longer declares a Version constant').not.toBeNull()
    expect(PRIVACY_VERSION).toBe(match![1])
  })

  it('is a date, so a later notice sorts after an earlier one', () => {
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(PRIVACY_VERSION))).toBe(false)
  })
})
