import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  // View ativa no SPA
  const activeView = ref(sessionStorage.getItem('activeView') || 'dashboard')

  // Toast notifications
  const toasts = ref([])

  // Modal aberto
  const openModals = ref(new Set())

  // Status do WhatsApp
  const whatsappStatus = ref('disconnected') // 'connected' | 'disconnected' | 'scan_qr'
  const whatsappQrCode = ref(null)
  const whatsappAccounts = ref([])

  // Status de conexão com o servidor e usuários online
  const serverOnline = ref(false)
  const onlineUsersCount = ref(1)
  const onlineUsersList = ref([])
  const lastSeenUsers = ref({})

  function switchView(view) {
    activeView.value = view
    try { sessionStorage.setItem('activeView', view) } catch {}
  }

  function showToast(message, type = 'success', duration = 3500) {
    const id = Date.now()
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, duration)
  }

  function openModal(name) { openModals.value.add(name) }
  function closeModal(name) { openModals.value.delete(name) }
  function isModalOpen(name) { return openModals.value.has(name) }

  // Estado do Chat Mobile (para ocultar navegação inferior tipo WhatsApp)
  const isMobileChatOpen = ref(false)

  function setMobileChatOpen(val) {
    isMobileChatOpen.value = Boolean(val)
  }

  // Estado de navegação de rotas/abas (para feedback visual imediato)
  const isNavigating = ref(false)

  function setNavigating(val) {
    isNavigating.value = Boolean(val)
  }

  // Aba do Módulo de Atendimentos ('atendimentos' | 'conversas_internas')
  const activeChatModuleTab = ref('atendimentos')

  function setChatModuleTab(tab) {
    activeChatModuleTab.value = tab
    if (tab === 'conversas_internas') {
      isInternalChatOpen.value = false
    }
  }

  // Estado do Painel/Gaveta do Chat Interno da Equipe
  const isInternalChatOpen = ref(false)

  function toggleInternalChat() {
    isInternalChatOpen.value = !isInternalChatOpen.value
  }

  function openInternalChat() {
    isInternalChatOpen.value = true
  }

  function closeInternalChat() {
    isInternalChatOpen.value = false
  }

  return {
    activeView, toasts, openModals, whatsappStatus, whatsappQrCode, whatsappAccounts, serverOnline,
    onlineUsersCount, onlineUsersList, lastSeenUsers, isMobileChatOpen, setMobileChatOpen,
    isNavigating, setNavigating,
    activeChatModuleTab, setChatModuleTab,
    isInternalChatOpen, toggleInternalChat, openInternalChat, closeInternalChat,
    switchView, showToast, openModal, closeModal, isModalOpen
  }
})
