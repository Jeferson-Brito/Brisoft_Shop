import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth.api'

const TOKEN_KEY = 'brisoft_shop_token'
const LAST_ACTIVITY_KEY = 'brisoft_shop_last_activity'
const INACTIVITY_TIMEOUT_MS = 12 * 60 * 60 * 1000 // 12 horas de inatividade sem qualquer interação
const ACTIVITY_THROTTLE_MS = 30 * 1000 // Grava no localStorage no máximo a cada 30 segundos

let inactivityTimer = null
let lastRecordedTime = 0
let listenersAttached = false
let ignoreUnauthorizedUntil = 0

export function shouldIgnoreUnauthorized() {
  return Date.now() < ignoreUnauthorizedUntil
}

function loadStoredToken() {
  const sharedToken = localStorage.getItem(TOKEN_KEY)
  const legacyTabToken = sessionStorage.getItem(TOKEN_KEY)
  if (!sharedToken && legacyTabToken) localStorage.setItem(TOKEN_KEY, legacyTabToken)
  if (legacyTabToken) sessionStorage.removeItem(TOKEN_KEY)
  return sharedToken || legacyTabToken || null
}

export const useAuthStore = defineStore('auth', () => {
  // ─── State ──────────────────────────────────────────────────────────────────
  const token = ref(loadStoredToken())
  const user  = ref(null)
  const initialized = ref(false)

  // ─── Inatividade Inteligente (12h) ──────────────────────────────────────────
  function recordActivity() {
    const now = Date.now()
    if (now - lastRecordedTime < ACTIVITY_THROTTLE_MS) return
    lastRecordedTime = now
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now))
    } catch {}
  }

  function checkInactivity() {
    if (!token.value) return
    const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0)
    if (last && Date.now() - last > INACTIVITY_TIMEOUT_MS) {
      handleInactivityLogout()
    }
  }

  function handleInactivityLogout() {
    clearLiveState()
    clearSession()
    if (window.location.pathname !== '/login') {
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.assign(`/login?reason=inactivity&redirect=${encodeURIComponent(destination)}`)
    }
  }

  const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart']

  function startInactivityTracker() {
    if (typeof window === 'undefined') return
    recordActivity()

    if (!listenersAttached) {
      listenersAttached = true
      activityEvents.forEach((evt) => {
        window.addEventListener(evt, recordActivity, { passive: true })
      })
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkInactivity()
        }
      })
    }

    if (!inactivityTimer) {
      inactivityTimer = setInterval(checkInactivity, 30 * 1000)
    }
  }

  function stopInactivityTracker() {
    if (inactivityTimer) {
      clearInterval(inactivityTimer)
      inactivityTimer = null
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => !!token.value)
  const isAdmin         = computed(() => user.value?.role === 'Administrador')
  const isSupervisor    = computed(() => user.value?.role === 'Supervisor')
  const canManageTeam   = computed(() => isAdmin.value)
  const isTemporary     = computed(() => user.value?.is_temporary === true)
  const departmentId    = computed(() => user.value?.department_id ?? null)
  const departmentName  = computed(() => user.value?.department_name ?? null)
  const userName        = computed(() => user.value?.name || 'Usuário')
  const userEmail       = computed(() => user.value?.email || '')
  const departmentIds   = computed(() => [...new Set([
    ...(Array.isArray(user.value?.department_ids) ? user.value.department_ids : []),
    user.value?.department_id
  ].filter(Boolean).map(String))])

  // ─── Actions ─────────────────────────────────────────────────────────────────

  function setSession(newToken, newUser) {
    token.value = newToken
    user.value  = newUser
    localStorage.setItem(TOKEN_KEY, newToken)
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
    lastRecordedTime = Date.now()
    startInactivityTracker()
  }

  function suppressUnauthorizedLogout(ms = 4000) {
    ignoreUnauthorizedUntil = Date.now() + ms
  }

  function clearSession() {
    token.value = null
    user.value  = null
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(LAST_ACTIVITY_KEY)
    stopInactivityTracker()
  }

  async function login(email, password, company = '') {
    try {
      const { data } = await authApi.login(email, password, company)
      if (data.success && data.token) {
        setSession(data.token, data.user)
        return { success: true }
      }
      return { success: false, error: data.error || 'E-mail ou senha incorretos.' }
    } catch (err) {
      if (err.response?.data?.error) {
        return { success: false, error: err.response.data.error }
      }
      if (err.response?.status === 401) {
        return { success: false, error: 'E-mail ou senha incorretos. Verifique suas credenciais.' }
      }
      if (err.response) {
        return { success: false, error: 'Não foi possível autenticar. Tente novamente.' }
      }
      return { success: false, error: 'Erro de conexão. Verifique se o servidor está online.' }
    }
  }

  function clearLiveState() {
    import('@/utils/protected-media-cache').then(({ clearProtectedMediaCache }) => clearProtectedMediaCache()).catch(() => {})
  }

  async function logout() {
    authApi.logout().catch(() => {})
    clearLiveState()
    clearSession()
  }

  let initAuthPromise = null

  // Valida sessão existente ao carregar o app (com deduplicação de promise)
  async function initAuth() {
    if (initialized.value && (!token.value || user.value)) return isAuthenticated.value
    if (initAuthPromise) return initAuthPromise

    initAuthPromise = (async () => {
      if (!token.value) {
        initialized.value = true
        return false
      }

      // Se passou mais de 12h de inatividade absoluta desde a última ação:
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0)
      if (last && Date.now() - last > INACTIVITY_TIMEOUT_MS) {
        handleInactivityLogout()
        initialized.value = true
        return false
      }

      try {
        const { data } = await authApi.me()
        if (data.success && data.user) {
          user.value = data.user
          initialized.value = true
          startInactivityTracker()
          return true
        }
      } catch (err) {
        const status = err?.response?.status
        if (status === 401 || status === 403) clearSession()
        initialized.value = true
        return !status || status >= 500 ? Boolean(token.value) : false
      }
      clearSession()
      initialized.value = true
      return false
    })().finally(() => {
      initAuthPromise = null
    })

    return initAuthPromise
  }

  async function refreshUser() {
    const { data } = await authApi.me()
    if (data.success && data.user) user.value = data.user
    return user.value
  }

  return {
    // state
    token, user, initialized,
    // getters
    isAuthenticated, isAdmin, isSupervisor, canManageTeam, isTemporary, departmentId, departmentName, departmentIds, userName, userEmail,
    // actions
    login, logout, initAuth, refreshUser, setSession, clearSession, recordActivity, suppressUnauthorizedLogout
  }
})
