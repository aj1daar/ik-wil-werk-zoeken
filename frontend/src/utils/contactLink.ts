export type ContactLinkKind = 'url' | 'email' | 'none'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function detectContactLinkKind(value: string): ContactLinkKind {
  const v = value.trim()
  if (!v) return 'none'
  if (EMAIL_RE.test(v)) return 'email'
  if (v.startsWith('http://') || v.startsWith('https://')) return 'url'
  return 'none'
}
