import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'

const ONE_DAY_S = 86400

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

export function useSessionExpiry() {
  const auth = useAuthStore()

  const secondsRemaining = computed<number | null>(() => {
    if (!auth.token) return null
    const exp = jwtExp(auth.token)
    if (exp === null) return null
    return exp - Math.floor(Date.now() / 1000)
  })

  const isExpiringSoon = computed<boolean>(() => {
    const s = secondsRemaining.value
    return s !== null && s > 0 && s < ONE_DAY_S
  })

  return { isExpiringSoon, secondsRemaining }
}
