import { defineStore } from 'pinia'
import { api } from '../api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: sessionStorage.getItem('token') as string | null
  }),
  getters: {
    isAuthenticated: (state) => !!state.token
  },
  actions: {
    async login(password: string): Promise<string | null> {
      try {
        const data = await api.login(password)
        this.token = data.token
        sessionStorage.setItem('token', data.token)
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Login failed'
      }
    },
    logout() {
      this.token = null
      sessionStorage.removeItem('token')
    }
  }
})
