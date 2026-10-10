import { describe, expect, it, vi } from 'vitest'
import { asJobUrl, readClipboardUrl } from '../lib/clipboard'

// ── what counts as a job link ────────────────────────────────────────────────

describe('asJobUrl', () => {
  it('takes an https link', () => {
    expect(asJobUrl('https://jobs.lever.co/acme/1234')).toBe('https://jobs.lever.co/acme/1234')
  })

  it('takes a plain http link, since some boards still are', () => {
    expect(asJobUrl('http://careers.acme.nl/vacature/42')).toBe('http://careers.acme.nl/vacature/42')
  })

  it('trims surrounding whitespace a copy often brings along', () => {
    expect(asJobUrl('  https://acme.nl/job \n')).toBe('https://acme.nl/job')
  })

  it('keeps the query string, which is where the posting id often lives', () => {
    const url = 'https://www.linkedin.com/jobs/view/?currentJobId=4211'
    expect(asJobUrl(url)).toBe(url)
  })

  it.each([
    ['nothing', ''],
    ['whitespace', '   '],
    ['a sentence', 'Senior Backend Engineer at Acme'],
    ['a bare domain with no scheme', 'acme.nl/jobs/1'],
    ['a company name', 'Acme B.V.'],
    ['an email address', 'jobs@acme.nl'],
  ])('rejects %s', (_label, value) => {
    expect(asJobUrl(value)).toBeNull()
  })

  it.each([
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<h1>hi</h1>'],
    ['a file: URL', 'file:///C:/Users/secret.txt'],
    ['a chrome: URL', 'chrome://settings'],
    ['an extension URL', 'chrome-extension://abc/page.html'],
  ])('rejects %s, so only web pages are ever sent to the server', (_label, value) => {
    expect(asJobUrl(value)).toBeNull()
  })

  it('rejects a host with no dot in it, which is never a job board', () => {
    expect(asJobUrl('http://localhost/jobs')).toBeNull()
  })

  it('rejects anything past the length the server accepts', () => {
    expect(asJobUrl('https://acme.nl/' + 'x'.repeat(2000))).toBeNull()
  })

  it('accepts a link right at the limit', () => {
    const url = 'https://acme.nl/' + 'x'.repeat(2000 - 'https://acme.nl/'.length)
    expect(url).toHaveLength(2000)
    expect(asJobUrl(url)).toBe(url)
  })

  it.each([null, undefined])('treats %s as nothing copied', value => {
    expect(asJobUrl(value)).toBeNull()
  })
})

// ── reading the clipboard ────────────────────────────────────────────────────

describe('readClipboardUrl', () => {
  function withClipboard(impl: () => Promise<string>) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn(impl) },
      configurable: true,
    })
  }

  it('returns the copied link', async () => {
    withClipboard(async () => 'https://acme.nl/job/1')
    expect(await readClipboardUrl()).toBe('https://acme.nl/job/1')
  })

  it('returns nothing when what was copied is not a link', async () => {
    withClipboard(async () => 'some notes about the interview')
    expect(await readClipboardUrl()).toBeNull()
  })

  // Denied permission, an unfocused panel and a Chrome build that disagrees all
  // arrive as a rejection, and all of them mean the same thing: fall back to the
  // paste field.
  it('returns nothing when the read is refused', async () => {
    withClipboard(async () => { throw new DOMException('Denied', 'NotAllowedError') })
    expect(await readClipboardUrl()).toBeNull()
  })

  it('returns nothing when there is no clipboard API at all', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    expect(await readClipboardUrl()).toBeNull()
  })
})
