import { describe, expect, it } from 'vitest'
import { detectContactLinkKind } from '../contactLink'

describe('detectContactLinkKind', () => {
  it('returns "none" for an empty string', () => {
    expect(detectContactLinkKind('')).toBe('none')
  })

  it('returns "none" for whitespace only', () => {
    expect(detectContactLinkKind('   ')).toBe('none')
  })

  it.each([
    'https://example.com/jobs/123',
    'http://example.com',
    'https://sub.example.co.uk/path?query=1#frag',
  ])('returns "url" for %s', (value) => {
    expect(detectContactLinkKind(value)).toBe('url')
  })

  it('trims surrounding whitespace before detecting a url', () => {
    expect(detectContactLinkKind('  https://example.com  ')).toBe('url')
  })

  it.each([
    'name@company.com',
    'first.last+tag@sub.company.co.uk',
    'HR@Company.COM',
  ])('returns "email" for %s', (value) => {
    expect(detectContactLinkKind(value)).toBe('email')
  })

  it('trims surrounding whitespace before detecting an email', () => {
    expect(detectContactLinkKind('  hr@company.com  ')).toBe('email')
  })

  it.each([
    'just some notes',
    'ftp://example.com',
    'www.example.com',
    '@company.com',
    'name@',
    'name@company',
  ])('returns "none" for text that is neither a url nor an email: %s', (value) => {
    expect(detectContactLinkKind(value)).toBe('none')
  })

  it('does not misclassify an email as a url or vice versa', () => {
    expect(detectContactLinkKind('hr@company.com')).not.toBe('url')
    expect(detectContactLinkKind('https://company.com')).not.toBe('email')
  })
})
