import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GoogleSignIn from '../GoogleSignIn.vue'
import { useAuthStore } from '../../../stores/auth'

vi.mock('../../../utils/google', () => ({
  GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com',
  googleSignInConfigured: vi.fn(() => true),
  loadGoogleIdentity: vi.fn(),
}))

import { googleSignInConfigured, loadGoogleIdentity } from '../../../utils/google'

// Stands in for Google's script: it remembers how it was set up and hands the
// test the callback, which is the only way a credential ever arrives.
function fakeGoogle() {
  const api = {
    initialize: vi.fn(),
    renderButton: vi.fn(),
    disableAutoSelect: vi.fn(),
    // Filled in by initialize
    fire: (credential?: string) => {
      const config = api.initialize.mock.calls[0][0]
      config.callback({ credential })
    },
  }
  return api
}

async function render(props: Record<string, unknown> = {}) {
  const wrapper = mount(GoogleSignIn, { props })
  await flushPromises()
  return wrapper
}

// v-show leaves the element in place with display:none, which is what "hidden"
// means here.
const hidden = (element: { attributes: (name: string) => string | undefined }) =>
  (element.attributes('style') ?? '').includes('display: none')

let google: ReturnType<typeof fakeGoogle>

beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
  vi.clearAllMocks()
  google = fakeGoogle()
  vi.mocked(googleSignInConfigured).mockReturnValue(true)
  vi.mocked(loadGoogleIdentity).mockResolvedValue(google)
})

// ── when the button can be shown at all ──────────────────────────────────────

describe('the button', () => {
  it('is set up with the client id this build carries', async () => {
    await render()
    expect(google.initialize).toHaveBeenCalledTimes(1)
    expect(google.initialize.mock.calls[0][0].client_id).toBe('123-abc.apps.googleusercontent.com')
  })

  it('never selects an account by itself', async () => {
    await render()
    expect(google.initialize.mock.calls[0][0].auto_select).toBe(false)
  })

  it('is drawn by Google, not by us', async () => {
    await render()
    expect(google.renderButton).toHaveBeenCalledTimes(1)
  })

  it('says "sign up" on the register page', async () => {
    await render({ text: 'signup_with' })
    expect(google.renderButton.mock.calls[0][1].text).toBe('signup_with')
  })

  it('says "sign in" by default', async () => {
    await render()
    expect(google.renderButton.mock.calls[0][1].text).toBe('signin_with')
  })

  it('is never asked for in a build with no client id', async () => {
    vi.mocked(googleSignInConfigured).mockReturnValue(false)
    const wrapper = await render()
    expect(loadGoogleIdentity).not.toHaveBeenCalled()
    expect(hidden(wrapper.find('.google-signin'))).toBe(true)
  })

  it('stays hidden when the script does not load', async () => {
    vi.mocked(loadGoogleIdentity).mockResolvedValue(null)
    const wrapper = await render()
    expect(hidden(wrapper.find('.google-signin'))).toBe(true)
    expect(google.initialize).not.toHaveBeenCalled()
  })

  it('shows itself once the script is there', async () => {
    const wrapper = await render()
    expect(hidden(wrapper.find('.google-signin'))).toBe(false)
    expect(wrapper.text()).toContain('or')
  })
})

// ── signing in ───────────────────────────────────────────────────────────────

describe('a credential coming back', () => {
  it('is sent to the server, and the session kept', async () => {
    const auth = useAuthStore()
    const signIn = vi.spyOn(auth, 'signInWithGoogle').mockResolvedValue({ kind: 'signed-in' })

    const wrapper = await render()
    google.fire('the-credential')
    await flushPromises()

    expect(signIn).toHaveBeenCalledWith('the-credential')
    expect(wrapper.emitted('signed-in')).toHaveLength(1)
  })

  it('is ignored when Google sends nothing', async () => {
    const auth = useAuthStore()
    const signIn = vi.spyOn(auth, 'signInWithGoogle')

    await render()
    google.fire(undefined)
    await flushPromises()

    expect(signIn).not.toHaveBeenCalled()
  })

  it('shows what went wrong when the server refuses it', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'signInWithGoogle').mockResolvedValue({
      kind: 'error', message: 'That Google sign-in could not be verified. Please try again.',
    })

    const wrapper = await render()
    google.fire('the-credential')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('could not be verified')
    expect(wrapper.emitted('signed-in')).toBeUndefined()
  })
})

// ── an address with no account here yet ──────────────────────────────────────

describe('a new account', () => {
  async function toConsent() {
    const auth = useAuthStore()
    const signIn = vi.spyOn(auth, 'signInWithGoogle').mockResolvedValue({
      kind: 'needs-consent', email: 'new@example.com', firstName: 'Jan', lastName: 'de Vries',
    })
    const wrapper = await render()
    google.fire('the-credential')
    await flushPromises()
    return { wrapper, signIn }
  }

  it('is not made until the terms are agreed to', async () => {
    const { wrapper, signIn } = await toConsent()
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signIn.mock.calls[0][1]).toBeUndefined()
    expect(wrapper.text()).toContain('new@example.com')
    expect(wrapper.emitted('signed-in')).toBeUndefined()
  })

  it('hides the button while the question is on screen', async () => {
    const { wrapper } = await toConsent()
    expect(hidden(wrapper.find('.google-host'))).toBe(true)
  })

  it('is made, with the moment of agreement recorded, when they agree', async () => {
    const { wrapper, signIn } = await toConsent()
    signIn.mockResolvedValue({ kind: 'signed-in' })

    await wrapper.find('.btn-primary').trigger('click')
    await flushPromises()

    expect(signIn).toHaveBeenCalledTimes(2)
    const consent = signIn.mock.calls[1][1]
    expect(typeof consent).toBe('string')
    expect(Number.isNaN(Date.parse(consent as string))).toBe(false)
    expect(signIn.mock.calls[1][0]).toBe('the-credential')
    expect(wrapper.emitted('signed-in')).toHaveLength(1)
  })

  it('is dropped when they decide against it', async () => {
    const { wrapper, signIn } = await toConsent()
    await wrapper.find('.btn-secondary').trigger('click')
    await flushPromises()

    expect(signIn).toHaveBeenCalledTimes(1)
    expect(hidden(wrapper.find('.google-host'))).toBe(false)
    expect(wrapper.text()).not.toContain('new@example.com')
  })

  it('reports a refusal from the second step too', async () => {
    const { wrapper, signIn } = await toConsent()
    signIn.mockResolvedValue({ kind: 'error', message: 'Could not create the account.' })

    await wrapper.find('.btn-primary').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Could not create the account.')
    expect(wrapper.emitted('signed-in')).toBeUndefined()
  })

  it('cannot be created twice by a double click', async () => {
    const { wrapper, signIn } = await toConsent()
    let finish: (value: { kind: 'signed-in' }) => void = () => {}
    signIn.mockReturnValue(new Promise(resolve => { finish = resolve }))

    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined()

    finish({ kind: 'signed-in' })
    await flushPromises()
    expect(signIn).toHaveBeenCalledTimes(2)
  })
})
