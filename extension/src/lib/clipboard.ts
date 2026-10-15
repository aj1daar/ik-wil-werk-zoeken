// Reading the copied link.
//
// navigator.clipboard.readText() works in an extension page that holds the
// `clipboardRead` permission, but only while that page has focus. A panel that
// opens behind a focused page, a Chrome build that disagrees, or a user who said
// no all surface the same way: it throws, or it returns something that is not a
// link. Every one of those falls back to the paste field, which is why nothing
// here reports an error of its own.

/** Mirrors JobLinkParser.TryNormalizeUrl: absolute http(s), with a host. */
export function asJobUrl(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim()
  if (trimmed.length === 0 || trimmed.length > 2000) return null
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    return url.hostname.includes('.') ? trimmed : null
  } catch {
    return null
  }
}

/** The copied link, or null when there is nothing usable to read. */
export async function readClipboardUrl(): Promise<string | null> {
  try {
    return asJobUrl(await navigator.clipboard.readText())
  } catch {
    return null
  }
}
