import { defineStore } from 'pinia'
import { api } from '../api'

export interface UserPreferences {
  targetRole?: string
  location?:   string
  workType:    'any' | 'onsite' | 'hybrid' | 'remote'
}

export interface AuthUser {
  userId:    string
  email:     string
  firstName: string
  lastName:  string
  preferences?: UserPreferences
}

export interface RegisterData {
  firstName:     string
  lastName:      string
  email:         string
  password:      string
  preferences?:  { targetRole?: string; location?: string; workType?: string }
  gdprConsentAt: string
}

function parseUser(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return {
      userId:    payload.sub ?? '',
      email:     payload.email ?? '',
      firstName: payload.firstName ?? '',
      lastName:  payload.lastName ?? '',
      preferences: payload.preferences ?? undefined,
    }
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const token = sessionStorage.getItem('token') as string | null
    return {
      token,
      user: token ? parseUser(token) : null as AuthUser | null,
    }
  },
  getters: {
    isAuthenticated: (state) => !!state.token,
  },
  actions: {
    async login(email: string, password: string): Promise<string | null> {
      try {
        const data = await api.login(email, password)
        this.token = data.token
        this.user  = parseUser(data.token)
        sessionStorage.setItem('token', data.token)
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Login failed'
      }
    },

    async register(payload: RegisterData): Promise<string | null> {
      try {
        const data = await api.register(payload)
        this.token = data.token
        this.user  = parseUser(data.token)
        sessionStorage.setItem('token', data.token)
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Registration failed'
      }
    },

    async updateProfile(data: { firstName: string; lastName: string; preferences: UserPreferences }): Promise<string | null> {
      try {
        const res = await api.updateProfile(data)
        if (this.token) {
          this.token = res.token
          this.user  = parseUser(res.token)
          sessionStorage.setItem('token', res.token)
        }
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Update failed'
      }
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<string | null> {
      try {
        await api.changePassword(currentPassword, newPassword)
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Password change failed'
      }
    },

    logout() {
      this.token = null
      this.user  = null
      sessionStorage.removeItem('token')
    },
  },
})
