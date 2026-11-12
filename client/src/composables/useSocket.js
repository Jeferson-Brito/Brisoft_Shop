import { io } from 'socket.io-client'
import { useAuthStore }   from '@/stores/auth.store'
import { useTicketStore } from '@/stores/tickets.store'
import { useUiStore }     from '@/stores/ui.store'
import { useInternalChatStore } from '@/stores/internal-chat.store'
import { sendNativeNotification, requestNotificationPermission } from '@/utils/native-notifications'
import { closeSharedAudioContext, sharedAudioContext } from '@/utils/notification-sound'

let socket = null
const incomingCallTimers = new Map()
const incomingCallRingtoneTimers = new Map()
const incomingCallAudioContexts = new Map()

/**
 * Composable que gerencia a conexão Socket.io.
 * Todos os eventos do servidor atualizam as Pinia stores diretamente —
 * a UI reage automaticamente sem nenhum render() manual.
 */
export function useSocket() {
  function connect() {
    const auth = useAuthStore()
    if (!auth.token) return
    requestNotificationPermission()
    if (socket?.connected && socket.auth?.token === auth.token) return

    if (socket) {
      const stale = socket
      socket = null
      stale.io.reconnection(false)
      stale.removeAllListeners()
      stale.disconnect()
    }

    socket = io('/', {
      auth:               { token: auth.token },
      reconnectionAttempts: Infinity,
      reconnectionDelay:  2000,
      timeout:            15000,
      transports:         ['websocket', 'polling']
    })

    const tickets = useTicketStore()
    const ui      = useUiStore()

    // ── Conexão ──────────────────────────────────────────────────────────────
    socket.on('connect', () => {
      ui.serverOnline = true
      tickets.fetchQueue({ silent: true }).catch(() => {})
      tickets.notifyKpisUpdated()
    })

    socket.on('disconnect', () => {
      ui.serverOnline = false
    })

    socket.on('connect_error', (err) => {
      ui.serverOnline = false
      if (/autenticado|inválida|expirada/i.test(err.message || '')) {
        disconnect()
        auth.clearSession()
        if (!window.location.pathname.startsWith('/login')) window.location.assign('/login')
      }
    })

    socket.on('session_expired', () => {
      disconnect()
      auth.clearSession()
      window.location.assign('/login')
    })

    socket.io.on('reconnect', () => {
      ui.serverOnline = true
      tickets.fetchQueue({ silent: true }).catch(() => {})
      tickets.notifyKpisUpdated()
    })

    socket.on('online_users', (data) => {
      if (data) {
        ui.onlineUsersCount = typeof data.count === 'number' ? data.count : 0
        ui.onlineUsersList = Array.isArray(data.users) ? data.users : []
        if (data.last_seen && typeof data.last_seen === 'object') {
          ui.lastSeenUsers = { ...data.last_seen }
        }
      }
    })

    // ── WhatsApp ─────────────────────────────────────────────────────────────
    socket.on('whatsapp_status', (data) => {
      ui.whatsappStatus = data.status
      if (Array.isArray(data.accounts)) {
        ui.whatsappAccounts = applyWhatsAppAccounts(ui.whatsappAccounts, data.accounts, auth.canManageTeam, true)
      }
    })

    socket.on('whatsapp_accounts_updated', (data) => {
      if (!Array.isArray(data?.accounts)) return
      ui.whatsappAccounts = applyWhatsAppAccounts(ui.whatsappAccounts, data.accounts, auth.canManageTeam, auth.isAdmin)
    })

    // ── Tickets em tempo real ─────────────────────────────────────────────────
    socket.on('ticket_created', ({ ticket }) => {
      if (!ticket) return
      tickets.receiveTicket(ticket)
      if (!ticket.is_group) tickets.notifyKpisUpdated()
      _notifyIfRelevant(ticket, ticket.is_group
        ? `👥 Grupo disponível: ${ticket.clientName || ticket.client_name || 'Grupo do WhatsApp'}`
        : `💬 Novo atendimento (${ticket.department || 'Geral'}): ${ticket.clientName || 'Cliente'}`)
    })

    socket.on('ticket_updated', ({ ticket }) => {
      if (!ticket) return
      tickets.receiveTicket(ticket)
      if (!ticket?.is_group) tickets.notifyKpisUpdated()
    })

    socket.on('queue_updated', ({ ticket }) => {
      if (!ticket) return
      tickets.receiveTicket(ticket)
      if (!ticket?.is_group) tickets.notifyKpisUpdated()
    })

    socket.on('tickets_batch_removed', (data) => {
      if (Array.isArray(data?.ticketIds) && data.ticketIds.length) {
        tickets.removeTickets(data.ticketIds)
        tickets.notifyKpisUpdated()
      }
    })

    socket.on('tickets_updated', () => {
      tickets.fetchQueue({ silent: true })
      tickets.notifyKpisUpdated()
    })

    socket.on('whatsapp_account_reconnected', () => {
      tickets.fetchQueue({ silent: true })
      tickets.notifyKpisUpdated()
    })

    socket.on('new_message', (data) => {
      const { ticketId, message, ticket, contact } = data

      // Garante que o ticket existe na store
      if (ticket) tickets.receiveTicket(ticket)
      if (message && ticketId) {
        tickets.appendMessage(ticketId, message)
      }
      tickets.notifyKpisUpdated()

      // Toast + som apenas para mensagens do cliente destinadas ao usuário
      if (message?.sender === 'client' || !message?.sender) {
        const t = tickets.queue.find(q => q.id === ticketId)
        if (t && _isForMe(t)) {
          const name     = t.is_group ? (message?.sender_name || t.clientName || 'Grupo') : (contact?.name || t.clientName || 'Cliente')
          const preview  = (message?.text || '').substring(0, 40)
          ui.showToast(`💬 ${name}: "${preview}"`)
          _playMessageSound()
          sendNativeNotification(`💬 ${name}`, preview, { tag: `ticket-${ticketId}` })
        }
      }
    })

    socket.on('message_updated', ({ ticketId, message }) => {
      if (ticketId && message?.id) tickets.patchMessage(ticketId, message.id, message)
    })

    socket.on('message_deleted', ({ ticketId, message }) => {
      if (ticketId && message?.id) tickets.patchMessage(ticketId, message.id, message)
    })

    socket.on('rating_received', (data) => {
      const auth = useAuthStore()
      if (data.agentName && auth.user?.name === data.agentName) {
        ui.showToast(`⭐ Cliente avaliou seu atendimento com ${data.rating} estrelas!`)
      }
    })

    socket.on('incoming_whatsapp_call', (data = {}) => {
      const active = data.status === 'ringing'
      const callKey = _incomingCallKey(data)
      if (data.ticketId) tickets.patchTicket(data.ticketId, { incomingCall: data })

      clearTimeout(incomingCallTimers.get(callKey))
      if (active) {
        _startCallRingtone(callKey, data.isVideo)
        incomingCallTimers.set(callKey, setTimeout(() => {
          if (data.ticketId) tickets.patchTicket(data.ticketId, { incomingCall: null })
          stopIncomingCallAlert(callKey)
        }, 45000))
      } else {
        _stopCallRingtone(callKey)
        incomingCallTimers.set(callKey, setTimeout(() => {
          if (data.ticketId) tickets.patchTicket(data.ticketId, { incomingCall: null })
          incomingCallTimers.delete(callKey)
        }, 2500))
      }
    })

    socket.on('kpis_updated', () => {
      tickets.notifyKpisUpdated()
    })

    // Eventos do Chat Interno da Equipe (100% independente do WhatsApp)
    socket.on('internal_message', (message) => {
      const internalChat = useInternalChatStore()
      internalChat.handleIncomingInternalMessage(message)

      const auth = useAuthStore()
      if (message && message.sender_id !== auth.user?.id) {
        const senderName = message.sender?.name || 'Colega de equipe'
        const preview = (message.text || 'Enviou um arquivo').slice(0, 50)
        sendNativeNotification(`💬 ${senderName} (Chat Interno)`, preview, { tag: `internal-${message.conversation_id}` })
      }
    })

    socket.on('internal_user_typing', (data) => {
      const internalChat = useInternalChatStore()
      internalChat.handleUserTyping(data)
    })

    socket.on('internal_conversation_read', (data) => {
      const internalChat = useInternalChatStore()
      internalChat.handleConversationRead?.(data)
    })

    socket.on('internal_conversation_created', (conv) => {
      const internalChat = useInternalChatStore()
      internalChat.handleConversationCreated(conv)
    })

    socket.on('internal_conversation_updated', (data) => {
      const internalChat = useInternalChatStore()
      internalChat.handleConversationUpdated(data)
    })

    socket.on('internal_conversation_deleted', (data) => {
      const internalChat = useInternalChatStore()
      internalChat.handleConversationDeleted(data)
    })

    socket.on('internal_conversation_removed', (data) => {
      const internalChat = useInternalChatStore()
      internalChat.handleConversationDeleted(data)
    })

    socket.on('internal_participant_left', () => {
      const internalChat = useInternalChatStore()
      internalChat.fetchConversations()
    })

    socket.on('internal_reaction_updated', (data) => {
      const internalChat = useInternalChatStore()
      internalChat.handleReactionUpdated(data)
    })

    socket.on('internal_message_pinned', (data) => {
      const internalChat = useInternalChatStore()
      internalChat.handleMessagePinned(data)
    })

    socket.on('internal_message_edited', (data) => {
      const internalChat = useInternalChatStore()
      internalChat.handleMessageEdited(data)
    })

    socket.on('internal_message_deleted', (data) => {
      const internalChat = useInternalChatStore()
      internalChat.handleMessageDeleted(data)
    })
  }

  function disconnect() {
    if (socket) {
      socket.io.reconnection(false)
      socket.disconnect()
    }
    socket = null
    closeSharedAudioContext()
    for (const timer of incomingCallTimers.values()) clearTimeout(timer)
    incomingCallTimers.clear()
    for (const callKey of incomingCallRingtoneTimers.keys()) _stopCallRingtone(callKey)
  }

  function sendEvent(event, payload) {
    socket?.emit(event, payload)
  }

  return { connect, disconnect, sendEvent, stopIncomingCallAlert, getSocket: () => socket }
}

// ─── Helpers privados ─────────────────────────────────────────────────────────

function _incomingCallKey(data = {}) {
  return String(data.callId || data.ticketId || data.phone || 'incoming-call')
}

function stopIncomingCallAlert(callId) {
  const callKey = String(callId || 'incoming-call')
  clearTimeout(incomingCallTimers.get(callKey))
  incomingCallTimers.delete(callKey)
  _stopCallRingtone(callKey)
}

function _stopCallRingtone(callKey) {
  clearInterval(incomingCallRingtoneTimers.get(callKey))
  incomingCallRingtoneTimers.delete(callKey)
  incomingCallAudioContexts.get(callKey)?.close?.().catch(() => {})
  incomingCallAudioContexts.delete(callKey)
}

function _startCallRingtone(callKey, isVideo = false) {
  _stopCallRingtone(callKey)
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const context = new AudioContext()
    incomingCallAudioContexts.set(callKey, context)

    const tone = (frequency, start, duration, volume = 0.16) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.connect(gain); gain.connect(context.destination)
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.025)
      gain.gain.setValueAtTime(volume, start + duration - 0.06)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      oscillator.start(start); oscillator.stop(start + duration + 0.02)
    }

    const ring = () => {
      context.resume?.().catch(() => {})
      const start = context.currentTime + 0.04
      if (isVideo) {
        tone(659, start, 0.22)
        tone(784, start + 0.25, 0.22)
        tone(988, start + 0.5, 0.32)
      } else {
        for (const offset of [0, 0.82]) {
          tone(440, start + offset, 0.58, 0.13)
          tone(480, start + offset, 0.58, 0.13)
        }
      }
    }

    ring()
    incomingCallRingtoneTimers.set(callKey, setInterval(ring, isVideo ? 2100 : 2600))
  } catch {}
}

function _isForMe(ticket) {
  const auth = useAuthStore()
  if (auth.isAdmin) return true
  if (auth.isSupervisor && ticket.department_id && auth.departmentIds.includes(String(ticket.department_id))) return true
  if (auth.departmentId && ticket.department_id && String(auth.departmentId) === String(ticket.department_id)) return true
  if (auth.departmentName && ticket.department && auth.departmentName.toLowerCase() === ticket.department.toLowerCase()) return true
  return false
}

function _notifyIfRelevant(ticket, message) {
  if (!_isForMe(ticket)) return
  if (window.location.pathname.startsWith('/painel-tv')) return
  const ui = useUiStore()
  ui.showToast(message)
  _playTicketSound()
}

function withoutQr(account) {
  if (!account?.qrCode) return account
  const copy = { ...account }
  delete copy.qrCode
  return copy
}

function applyWhatsAppAccounts(current, incoming, canSeeQr, replaceAll) {
  const previousById = new Map((current || []).map(account => [String(account.id), account]))
  const normalized = incoming.map(account => {
    const previous = previousById.get(String(account.id))
    if (!canSeeQr) return withoutQr(account)
    if (!account.qrCode && previous?.qrCode && (account.status === 'scan_qr' || account.status === 'connecting')) {
      return { ...account, qrCode: previous.qrCode }
    }
    return account
  })
  if (replaceAll) return normalized
  const incomingIds = new Set(normalized.map(account => String(account.id)))
  const incomingDepartments = new Set(normalized.flatMap(account => [account.departmentId, account.fallbackDepartmentId].filter(Boolean).map(String)))
  const kept = (current || []).filter(account => {
    if (incomingIds.has(String(account.id))) return false
    const departments = [account.departmentId, account.fallbackDepartmentId].filter(Boolean).map(String)
    return !departments.some(id => incomingDepartments.has(id))
  }).map(account => (canSeeQr ? account : withoutQr(account)))
  return [...kept, ...normalized]
}

function _playMessageSound() {
  try {
    const ctx = sharedAudioContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18)
    osc.start(); osc.stop(ctx.currentTime + 0.18)
  } catch {}
}

function _playTicketSound() {
  try {
    const ctx = sharedAudioContext()
    if (!ctx) return
    const ping = (freq, start, dur) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.4, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.01, start + dur)
      osc.start(start); osc.stop(start + dur)
    }
    ping(900, ctx.currentTime, 0.22)
    ping(1300, ctx.currentTime + 0.26, 0.22)
  } catch {}
}
