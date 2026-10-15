<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useTheme } from '../../composables/useTheme'
import { useAuthStore } from '../../stores/auth'
import {
  GOOGLE_CLIENT_ID, googleSignInConfigured, loadGoogleIdentity,
  type GoogleIdentityApi,
} from '../../utils/google'

// Signing in with Google, from the button to the session.
//
// The button itself is Google's, because Google requires their mark and wording
// on it. Everything around it is ours, including the step an address we have
// never seen has to pass through: no account is made until the person says the
// terms are fine by them.
//
// Nothing renders at all when this build has no client id or the script does not
// load, so the password form stays the only way in instead of a button that
// cannot work.
const props = withDefaults(defineProps<{ text?: 'signin_with' | 'signup_with' }>(), {
  text: 'signin_with',
})

const emit = defineEmits<{ 'signed-in': [] }>()

const auth      = useAuthStore()
const { theme } = useTheme()

const host      = ref<HTMLElement | null>(null)
const available = ref(false)
const working   = ref(false)
const error     = ref('')
const pending   = ref<{ credential: string; email: string; firstName: string } | null>(null)

let api: GoogleIdentityApi | null = null
let observer: ResizeObserver | null = null

function render() {
  if (!api || !host.value) return
  host.value.innerHTML = ''
  api.renderButton(host.value, {
    // Google offers no "follow the page" option, so the dark button is chosen
    // the same way everything else here is: from the app's own theme.
    theme: theme.value === 'dark' ? 'filled_black' : 'outline',
    size: 'large',
    text: props.text,
    shape: 'rectangular',
    logo_alignment: 'center',
    // Google picks the browser's language unless told otherwise, which put
    // "Inloggen met Google" under an English form on a Dutch machine.
    locale: 'en',
    // The button takes a number of pixels and nothing else, so it is measured
    // from the column it sits in rather than guessed.
    width: Math.round(Math.min(400, Math.max(200, host.value.clientWidth || 320))),
  })
}

async function onCredential(credential: string) {
  error.value   = ''
  working.value = true
  const result = await auth.signInWithGoogle(credential)
  working.value = false

  if (result.kind === 'signed-in') { emit('signed-in'); return }
  if (result.kind === 'needs-consent') {
    pending.value = { credential, email: result.email, firstName: result.firstName }
    return
  }
  error.value = result.message
}

async function createAccount() {
  if (!pending.value) return
  error.value   = ''
  working.value = true
  // The moment of agreement is this click, which is what gets recorded.
  const result = await auth.signInWithGoogle(pending.value.credential, new Date().toISOString())
  working.value = false

  if (result.kind === 'signed-in') { pending.value = null; emit('signed-in'); return }
  error.value = result.kind === 'error' ? result.message : 'Google sign-in failed'
}

function cancel() {
  pending.value = null
  error.value   = ''
}

onMounted(async () => {
  if (!googleSignInConfigured()) return

  api = await loadGoogleIdentity()
  if (!api || !host.value) return

  api.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: response => { if (response.credential) void onCredential(response.credential) },
    // One Tap is never shown, so this only affects the button.
    auto_select: false,
    itp_support: true,
  })

  available.value = true
  render()

  // The card is narrower on a phone and wider once rotated, and the button has
  // to be rendered again to change width.
  if (typeof ResizeObserver !== 'undefined') {
    let last = host.value.clientWidth
    observer = new ResizeObserver(() => {
      const width = host.value?.clientWidth ?? 0
      if (Math.abs(width - last) < 8) return
      last = width
      render()
    })
    observer.observe(host.value)
  }
})

onBeforeUnmount(() => observer?.disconnect())

watch(theme, () => render())
</script>

<template>
  <div v-show="available" class="google-signin">
    <div class="google-divider"><span>or</span></div>

    <div v-show="!pending" ref="host" class="google-host" />

    <div v-if="pending" class="google-consent">
      <p class="google-consent-line">
        No account here uses <strong>{{ pending.email }}</strong> yet.
        Creating one stores your applications and the companies you track, and you can delete it
        from your profile at any time.
      </p>
      <div class="google-consent-actions">
        <button type="button" class="btn-primary" :disabled="working" @click="createAccount">
          {{ working ? 'Creating…' : 'Create my account' }}
        </button>
        <button type="button" class="btn-secondary" :disabled="working" @click="cancel">Cancel</button>
      </div>
    </div>

    <p v-if="working && !pending" class="google-note" role="status">Signing you in…</p>
    <p v-if="error" class="google-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.google-signin { margin-top: 1rem; }

.google-divider {
  display: flex; align-items: center; gap: .75rem;
  font-size: .75rem; color: var(--col-subtle);
  margin-bottom: 1rem;
}
.google-divider::before,
.google-divider::after {
  content: ''; flex: 1 1 auto; height: 1px; background: var(--col-border);
}

/* Google draws an iframe in here and sizes it itself; this only says where it
   sits. */
.google-host { display: flex; justify-content: center; min-height: 44px; }

.google-consent { display: flex; flex-direction: column; gap: .75rem; }
.google-consent-line { font-size: .8125rem; color: var(--col-muted); margin: 0; line-height: 1.5; }
.google-consent-actions { display: flex; gap: .5rem; }
.google-consent-actions > * { flex: 1 1 0; justify-content: center; }

.google-note  { font-size: .8125rem; color: var(--col-subtle); margin: .75rem 0 0; text-align: center; }
.google-error { font-size: .8125rem; color: var(--col-error); margin: .75rem 0 0; }
</style>
