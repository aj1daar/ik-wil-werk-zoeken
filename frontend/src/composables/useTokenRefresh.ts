import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { api } from '../api'

const TWO_HOURS_S       = 7200
const CHECK_INTERVAL_MS = 5 * 60 * 1000   // 5 minutes
const ACTIVITY_WINDOW_S = 10 * 60          // 10 minutes

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

    if (secsRemaining > 0 && secsRemaining < TWO_HOURS_S && recentlyActive) {
      await doRefresh()
    }
  }

  let interval: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    window.addEventListener('mousemove', recordActivity, { passive: true })
    window.addEventListener('keydown',   recordActivity, { passive: true })
    interval = setInterval(checkAndRefresh, CHECK_INTERVAL_MS)
  })

  onUnmounted(() => {
    window.removeEventListener('mousemove', recordActivity)
    window.removeEventListener('keydown',   recordActivity)
    if (interval !== null) clearInterval(interval)
  })

  return { refreshing, refreshError, extendSession: doRefresh }
}
