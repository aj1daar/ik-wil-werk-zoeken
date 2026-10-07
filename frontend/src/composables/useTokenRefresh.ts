import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { api } from '../api'

// The session lasts twelve hours (TokenService.TokenLifetimeHours) and this
// slides that window forward while the app is being used: once an hour, if there
// was activity in the last check interval, the token is swapped for a fresh one.
// Stop using the app and the window stops moving, so the session ends twelve
// hours after the last thing you did rather than twelve hours after signing in.
//
// SLIDE_BELOW_S is one hour less than the lifetime, which is what makes the
// refresh hourly: any lower and an idle-then-active user could be bounced; any
// higher and we would refresh on every tick, into the 10-per-hour rate limit on
// /api/auth/refresh.
const SESSION_LIFETIME_S = 12 * 60 * 60
const SLIDE_BELOW_S      = SESSION_LIFETIME_S - 60 * 60
const CHECK_INTERVAL_MS  = 5 * 60 * 1000   // 5 minutes
// Deliberately longer than the interval. At exactly one interval, activity
// recorded a tick ago reads as idle, and someone working steadily would be
// treated as away on every other check.
const ACTIVITY_WINDOW_S  = 6 * 60

export function useTokenRefresh() {
  const auth            = useAuthStore()
  const lastActivityAt  = ref(Math.floor(Date.now() / 1000))
  const refreshing      = ref(false)
  const refreshError    = ref<string | null>(null)

  function recordActivity() {
    lastActivityAt.value = Math.floor(Date.now() / 1000)
  }

  function jwtExp(token: string): number | null {
    try {
      const part = token.split('.')[1]
      if (!part) return null
      const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
      const payload = JSON.parse(atob(padded))
      return typeof payload.exp === 'number' ? payload.exp : null
    } catch {
      return null
    }
  }

  async function doRefresh() {
    if (refreshing.value || !auth.token) return
    refreshing.value  = true
    refreshError.value = null
    try {
      const { token } = await api.refreshToken()
      sessionStorage.setItem('token', token)
      auth.token = token
    } catch (e) {
      refreshError.value = e instanceof Error ? e.message : 'Could not refresh session.'
    } finally {
      refreshing.value = false
    }
  }

  async function checkAndRefresh() {
    if (!auth.token) return
    const now = Math.floor(Date.now() / 1000)
    const exp = jwtExp(auth.token)
    if (exp === null) return

    const secsRemaining = exp - now
    const recentlyActive = now - lastActivityAt.value < ACTIVITY_WINDOW_S

    if (secsRemaining > 0 && secsRemaining < SLIDE_BELOW_S && recentlyActive) {
      await doRefresh()
    }
  }

  let interval: ReturnType<typeof setInterval> | null = null

  // A phone has no mousemove, so touching and scrolling have to count as
  // activity too, or the session would quietly expire under someone reading.
  const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'scroll'] as const

  onMounted(() => {
    for (const name of ACTIVITY_EVENTS)
      window.addEventListener(name, recordActivity, { passive: true })
    interval = setInterval(checkAndRefresh, CHECK_INTERVAL_MS)
  })

  onUnmounted(() => {
    for (const name of ACTIVITY_EVENTS)
      window.removeEventListener(name, recordActivity)
    if (interval !== null) clearInterval(interval)
  })

  return { refreshing, refreshError, extendSession: doRefresh }
}
