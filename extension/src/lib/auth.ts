// Where the session token lives.
//
// chrome.storage.session, not .local: it is held in memory and cleared when
// Chrome closes, so the token never reaches disk. The cost is signing in again
// after a browser restart, which the app's own twelve-hour sliding window would
// not have saved us from much anyway.
const TOKEN_KEY = 'iwwzToken'

export async function getToken(): Promise<string | null> {
  const stored = await chrome.storage.session.get(TOKEN_KEY)
  const token = stored[TOKEN_KEY]
  return typeof token === 'string' && token.length > 0 ? token : null
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.session.set({ [TOKEN_KEY]: token })
}

export async function clearToken(): Promise<void> {
  await chrome.storage.session.remove(TOKEN_KEY)
}

// Reads the expiry out of the token without verifying it. The server is the only
// thing that decides whether a token is good; this just avoids showing a form
// that is certain to fail, and avoids holding a token that cannot work.
export function isExpired(token: string, now = Date.now()): boolean {
  const payload = token.split('.')[1]
  if (!payload) return true
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof json.exp !== 'number') return true
    return json.exp * 1000 <= now
  } catch {
    return true
  }
}

// The token that is both present and still inside its own lifetime, or null.
export async function getLiveToken(): Promise<string | null> {
  const token = await getToken()
  if (!token) return null
  if (isExpired(token)) {
    await clearToken()
    return null
  }
  return token
}
