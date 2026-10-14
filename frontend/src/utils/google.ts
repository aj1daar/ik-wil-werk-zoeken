// Loading Google Identity Services, and nothing else about it.
//
// The script comes from Google, so it is the one thing in the app that is not
// served from our own origin (fonts are self-hosted for exactly that reason).
// It is loaded only on the two pages that offer the button, and One Tap is never
// called, so nothing from Google runs for someone who is already signed in.

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

const SCRIPT_URL = 'https://accounts.google.com/gsi/client'

export interface GoogleButtonOptions {
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'small' | 'medium' | 'large'
  text?: 'signin_with' | 'signup_with' | 'continue_with'
  width?: number
  shape?: 'rectangular' | 'pill'
  logo_alignment?: 'left' | 'center'
}

export interface GoogleIdentityApi {
  initialize(config: {
    client_id: string
    callback: (response: { credential?: string }) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    itp_support?: boolean
    use_fedcm_for_prompt?: boolean
  }): void
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void
  disableAutoSelect(): void
}

export function googleSignInConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0
}

let loading: Promise<GoogleIdentityApi | null> | null = null

// null means the script could not be loaded or this build has no client id. The
// caller shows nothing rather than a button that cannot work.
export function loadGoogleIdentity(): Promise<GoogleIdentityApi | null> {
  if (!googleSignInConfigured()) return Promise.resolve(null)
  if (loading) return loading

  loading = new Promise<GoogleIdentityApi | null>(resolve => {
    const existing = (globalThis as { google?: { accounts?: { id?: GoogleIdentityApi } } }).google
    if (existing?.accounts?.id) return resolve(existing.accounts.id)

    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => {
      const api = (globalThis as { google?: { accounts?: { id?: GoogleIdentityApi } } }).google
      resolve(api?.accounts?.id ?? null)
    }
    // A blocked script, an offline browser or a content blocker all land here,
    // and all mean the same thing: the password form is the way in today.
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })

  return loading
}

// Tests reach in here; nothing else should.
export function resetGoogleIdentityForTests(): void {
  loading = null
}
