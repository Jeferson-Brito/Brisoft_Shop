import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth.store'
import { ticketsApi } from '@/api/tickets.api'

export const useTicketStore = defineStore('tickets', () => {
  // ─── State ──────────────────────────────────────────────────────────────────
  const queue          = ref([])      // todos os tickets ativos (aguardando + em_atendimento)
  const activeTicketId = ref(null)    // ticket selecionado no painel direito
  const loading        = ref(false)
  const loadingMessageIds = ref([])
  const kpiRevision    = ref(0)
  const assumeRequests = new Map()
  let requireExplicitSelection = true
  let queueRequestId = 0
  const initialQueueTab = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('brisoft_shop_queue_tab')) || 'aguardando'
  const activeQueueTab = ref(['aguardando', 'em_atendimento', 'grupos'].includes(initialQueueTab) ? initialQueueTab : 'aguardando')

  function getTicketQueueTab(ticket) {
    if (!ticket) return null
    if (ticket.is_group || ticket.status === 'grupo') return 'grupos'
    if (ticket.assumed || ticket.status === 'em_atendimento' || ticket.status === 'chatbot') return 'em_atendimento'
    if (ticket.status === 'aguardando' || !ticket.assumed) return 'aguardando'
    return 'aguardando'
  }

  function setQueueTab(tab) {
    if (tab && ['aguardando', 'em_atendimento', 'grupos'].includes(tab)) {
      activeQueueTab.value = tab
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('brisoft_shop_queue_tab', tab)
      }
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  // Tickets visíveis conforme perfil: admin e supervisor veem tudo/depto, analista só vê seus próprios atendimentos ou se for colaborador
  const visibleTickets = computed(() => {
    const auth = useAuthStore()
    if (auth.isAdmin) return queue.value

    return queue.value.filter(t => {
      // 1. Colaborador/participante adicionado vê sempre
      if ((t.collaborators || []).some(person => String(person.id) === String(auth.user?.id))) return true

      // 2. Atendente responsável pelo atendimento
      if (t.user_id && auth.user?.id && t.user_id === auth.user.id) return true
      if (auth.user?.name && t.agent_name === auth.user.name) return true

      // 3. Supervisor do departamento
      if (auth.isSupervisor && t.department_id && auth.departmentIds.includes(String(t.department_id))) return true

      // 4. Grupos do WhatsApp do departamento
      if (t.is_group || t.status === 'grupo') {
        if (auth.departmentId && t.department_id && String(t.department_id) === String(auth.departmentId)) return true
        if (auth.departmentName && t.department && t.department.toLowerCase() === auth.departmentName.toLowerCase()) return true
        return false
      }

      // 5. Fila aguardando (sem atendente humano assumido): visível para o departamento
      const isUnassigned = t.status === 'aguardando' || t.status === 'chatbot' || !t.user_id
      if (isUnassigned) {
        if (auth.departmentId && t.department_id && String(t.department_id) === String(auth.departmentId)) return true
        if (auth.departmentName && t.department && t.department.toLowerCase() === auth.departmentName.toLowerCase()) return true
        return !t.department_id
      }

      // 6. Em atendimento por outro atendente: NÃO VISÍVEL
      return false
    })
  })

  const waitingTickets     = computed(() => visibleTickets.value.filter(t => t.status === 'aguardando'))
  const inProgressTickets  = computed(() => visibleTickets.value.filter(t => t.status === 'em_atendimento'))
  const chatbotTickets     = computed(() => visibleTickets.value.filter(t => t.status === 'chatbot'))
  const groupTickets       = computed(() => visibleTickets.value.filter(t => t.status === 'grupo'))

  const activeTicket = computed(() =>
    visibleTickets.value.find(t => String(t.id) === String(activeTicketId.value)) ?? null
  )

  // ─── Actions ─────────────────────────────────────────────────────────────────

  function resetLiveState() {
    queue.value = []
    activeTicketId.value = null
    loadingMessageIds.value = []
  }

  async function fetchQueue({ silent = false } = {}) {
    const requestId = ++queueRequestId
    if (!silent) loading.value = true
    try {
      const { data } = await ticketsApi.list()
      if (requestId !== queueRequestId) return
      if (data.success) {
        queue.value = (data.tickets || []).map(t => {
          const existing = queue.value.find(current => String(current.id) === String(t.id))
          const incomingMessages = t.messages || []
          const isCurrentActive = String(t.id) === String(activeTicketId.value)
          const finalUnread = isCurrentActive ? 0 : (t.unread_count ?? existing?.unreadCount ?? 0)

          let messages = existing?.messages || []
          if (incomingMessages.length > messages.length) {
            messages = incomingMessages
          } else if (incomingMessages.length > 0 && messages.length === 0) {
            messages = incomingMessages
          }

          return {
            ...existing,
            ...t,
            unreadCount: finalUnread,
            unread_count: finalUnread,
            messages
          }
        })
        // Se o ticket ativo atual não estiver mais visível na fila, desseleciona
        if (activeTicketId.value && queue.value.length > 0 && !visibleTickets.value.some(t => String(t.id) === String(activeTicketId.value))) {
          activeTicketId.value = null
        }

        // Libera imediatamente o loading da fila assim que os tickets forem atribuídos
        if (!silent) loading.value = false

        // Carrega o histórico do ticket ativo em segundo plano sem bloquear a renderização da fila
        if (activeTicketId.value) {
          const act = queue.value.find(t => String(t.id) === String(activeTicketId.value))
          if (act) {
            act.unreadCount = 0
            act.unread_count = 0
            ticketsApi.markAsRead(activeTicketId.value).catch(() => {})
            loadTicketMessages(activeTicketId.value).catch(() => {})
          }
        }
      }
    } finally {
      if (!silent && requestId === queueRequestId) loading.value = false
    }
  }

  function isLoadingMessages(ticketId) {
    return loadingMessageIds.value.includes(ticketId)
  }

  async function loadTicketMessages(ticketId) {
    if (!ticketId || isLoadingMessages(ticketId)) return
    loadingMessageIds.value = [...loadingMessageIds.value, ticketId]
    try {
      const { data } = await ticketsApi.get(ticketId)
      if (data.success && data.ticket) receiveTicket(data.ticket)
    } finally {
      loadingMessageIds.value = loadingMessageIds.value.filter(id => id !== ticketId)
    }
  }

  function notifyKpisUpdated() {
    kpiRevision.value += 1
  }

  // Recebe ticket via WebSocket e insere/atualiza na fila
  function receiveTicket(ticket) {
    if (ticket?.status === 'finalizado' || ticket?.status === 'grupo_inativo') {
      removeTicket(ticket.id)
      return
    }
    const isCurrentActive = String(ticket.id) === String(activeTicketId.value)
    const finalUnread = isCurrentActive ? 0 : (ticket.unread_count ?? ticket.unreadCount ?? 0)

    const idx = queue.value.findIndex(t => String(t.id) === String(ticket.id))
    if (idx !== -1) {
      const existing = queue.value[idx]
      const incomingMessages = ticket.messages || []
      queue.value[idx] = {
        ...existing,
        ...ticket,
        unreadCount: finalUnread,
        unread_count: finalUnread,
        messages: incomingMessages.length >= (existing.messages?.length ?? 0)
          ? incomingMessages
          : existing.messages
      }
    } else {
      queue.value.unshift({
        ...ticket,
        unreadCount: finalUnread,
        unread_count: finalUnread,
        messages: ticket.messages || []
      })
    }

    // Se o ticket ativo atual não está mais visível para este usuário (ex: foi transferido), desseleciona imediatamente
    if (activeTicketId.value && queue.value.length > 0 && !visibleTickets.value.some(t => String(t.id) === String(activeTicketId.value))) {
      activeTicketId.value = null
    }
  }

  // Adiciona mensagem a um ticket existente com desduplicação robusta
  function appendMessage(ticketId, message) {
    const ticket = queue.value.find(t => t.id === ticketId)
    if (!ticket) return
    if (!ticket.messages) ticket.messages = []

    // 1. Se a mensagem tem ID, checa se já existe por ID
    if (message.id) {
      const existingIdx = ticket.messages.findIndex(m => m.id === message.id)
      if (existingIdx !== -1) return

      // Se havia uma mensagem otimista sem ID com mesmo texto/remetente, substitui
      const optIdx = ticket.messages.findIndex(m => !m.id && m.sender === message.sender && m.text === message.text)
      if (optIdx !== -1) {
        ticket.messages[optIdx] = message
        return
      }
    } else {
      // Mensagem local otimista sem ID: previne duplicata exata recente
      const isDuplicate = ticket.messages.some(m => m.sender === message.sender && m.text === message.text && m.time === message.time)
      if (isDuplicate) return
    }

    ticket.messages.push(message)
    ticket.preview = message.text || ticket.preview
    ticket.time    = message.time  || ticket.time

    // Apenas mensagens vindas do cliente incrementam contagem não lida se a conversa não estiver ativa
    if (message.sender === 'client' && !message.from_me && String(ticketId) !== String(activeTicketId.value)) {
      ticket.unreadCount = (ticket.unreadCount || 0) + 1
      ticket.unread_count = (ticket.unread_count || 0) + 1
    }
  }

  function patchMessage(ticketId, messageId, patch) {
    const ticket = queue.value.find(t => String(t.id) === String(ticketId))
    const message = ticket?.messages?.find(item => String(item.id) === String(messageId))
    if (message) Object.assign(message, patch)
  }

  // Remove ticket da fila (após encerramento)
  function removeTicket(ticketId) {
    const idx = queue.value.findIndex(t => String(t.id) === String(ticketId))
    if (idx !== -1) queue.value.splice(idx, 1)
    if (String(activeTicketId.value) === String(ticketId)) {
      minimizeActiveTicket({ clearPersisted: true })
    }
  }

  // Remove múltiplos tickets da fila em lote
  function removeTickets(ticketIds = []) {
    if (!Array.isArray(ticketIds) || !ticketIds.length) return
    const idSet = new Set(ticketIds.map(String))
    queue.value = queue.value.filter(t => !idSet.has(String(t.id)))
    if (activeTicketId.value && idSet.has(String(activeTicketId.value))) {
      minimizeActiveTicket({ clearPersisted: true })
    }
  }

  // Atualiza campos específicos de um ticket
  function patchTicket(ticketId, patch) {
    const ticket = queue.value.find(t => t.id === ticketId)
    if (ticket) Object.assign(ticket, patch)
  }

  async function selectTicket(ticketId) {
    requireExplicitSelection = false
    activeTicketId.value = ticketId
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('brisoft_shop_open_ticket_id', String(ticketId))
    }
    // Marca como lido imediatamente local e no servidor
    const ticket = queue.value.find(t => String(t.id) === String(ticketId))
    if (ticket) {
      const tab = getTicketQueueTab(ticket)
      if (tab) setQueueTab(tab)
      ticket.unreadCount = 0
      ticket.unread_count = 0
      ticketsApi.markAsRead(ticketId).catch(() => {})
      try { await loadTicketMessages(ticketId) } catch (e) {}
    }
  }

  function minimizeActiveTicket({ clearPersisted = true } = {}) {
    activeTicketId.value = null
    requireExplicitSelection = true
    if (clearPersisted && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('brisoft_shop_open_ticket_id')
    }
  }

  async function assume(ticketId) {
    // Um clique duplo ou dois componentes reagindo ao mesmo evento compartilham
    // a mesma requisição. Isso evita que a segunda tentativa reverta a primeira.
    if (assumeRequests.has(ticketId)) return assumeRequests.get(ticketId)

    const request = performAssume(ticketId)
    assumeRequests.set(ticketId, request)
    try {
      return await request
    } finally {
      assumeRequests.delete(ticketId)
    }
  }

  async function performAssume(ticketId) {
    const auth   = useAuthStore()
    const ticket = queue.value.find(t => t.id === ticketId)
    if (!ticket) return { success: false, error: 'Ticket não encontrado' }

    // Snapshot para rollback
    const snapshot = { assumed: ticket.assumed, status: ticket.status, messages: [...(ticket.messages || [])] }

    // Mutação otimista
    ticket.assumed = true
    ticket.status  = 'em_atendimento'
    ticket.messages.push({ type: 'divider', text: `Atendimento assumido por ${auth.user?.name}` })
    setQueueTab('em_atendimento')

    try {
      const { data } = await ticketsApi.assume(ticketId)
      if (data.success) return { success: true }
      // Rollback
      Object.assign(ticket, snapshot)
      return { success: false, error: data.error || 'Erro ao assumir' }
    } catch (e) {
      Object.assign(ticket, snapshot)
      const serverError = e.response?.data?.error
      const error = serverError || (e.request ? 'Sem conexão com o servidor' : 'Não foi possível assumir o atendimento')
      return { success: false, error }
    }
  }

  async function close(ticketId, options = {}) {
    const ticket = queue.value.find(t => t.id === ticketId)
    if (!ticket) return { success: false, error: 'Ticket não encontrado' }

    const ticketIdx = queue.value.findIndex(t => t.id === ticketId)
    const snapshot  = { ...ticket, messages: [...(ticket.messages || [])] }
    const wasActive = activeTicketId.value === ticketId

    // Remoção otimista
    queue.value.splice(ticketIdx, 1)
    if (wasActive) {
      minimizeActiveTicket({ clearPersisted: true })
    }

    try {
      const { data } = await ticketsApi.close(ticketId, options)
      if (data.success) return { success: true }
      // Rollback: reinsere na posição original
      queue.value.splice(ticketIdx, 0, snapshot)
      activeTicketId.value = ticketId
      requireExplicitSelection = false
      return { success: false, error: data.error || 'Erro ao encerrar' }
    } catch (e) {
      queue.value.splice(ticketIdx, 0, snapshot)
      activeTicketId.value = ticketId
      requireExplicitSelection = false
      return { success: false, error: 'Sem conexão com o servidor' }
    }
  }

  return {
    // state
    queue, activeTicketId, loading, loadingMessageIds, kpiRevision, activeQueueTab,
    // getters
    visibleTickets, waitingTickets, inProgressTickets, chatbotTickets, groupTickets, activeTicket,
    // actions
    fetchQueue, fetchTickets: fetchQueue, receiveTicket, appendMessage, patchMessage, removeTicket, removeTickets, patchTicket, notifyKpisUpdated, isLoadingMessages, loadTicketMessages, resetLiveState,
    selectTicket, minimizeActiveTicket, assume, close, setQueueTab, getTicketQueueTab
  }
})
