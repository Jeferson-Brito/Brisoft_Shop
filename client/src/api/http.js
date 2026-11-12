import axios from 'axios'
import { shouldIgnoreUnauthorized, useAuthStore } from '@/stores/auth.store'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

// Interceptor de request: injeta JWT em toda chamada à API e registra atividade
http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
    auth.recordActivity?.()
  }
  return config
})

// Interceptor de response: redireciona para login se token expirou
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (error.config?.url?.includes('/auth/login') || shouldIgnoreUnauthorized()) {
        return Promise.reject(error)
      }
      const auth = useAuthStore()
      const failedToken = String(error.config?.headers?.Authorization || error.config?.headers?.authorization || '').replace(/^Bearer\s+/i, '')
      if (auth.token && failedToken && failedToken !== auth.token) {
        return Promise.reject(error)
      }
      auth.clearSession()
      if (window.location.pathname !== '/login') {
        const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
        window.location.assign(`/login?redirect=${encodeURIComponent(destination)}`)
      }
    }
    return Promise.reject(error)
  }
)

export default http
