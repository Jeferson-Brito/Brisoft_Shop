import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { internalChatApi } from '@/api/internal-chat.api'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'

export const useInternalChatStore = defineStore('internalChat', () => {
  const auth = useAuthStore()
  const ui = useUiStore()

  const SESSION_CONVS_KEY = 'brisoft_internal_convs_cache'
  const SESSION_MSGS_KEY = 'brisoft_internal_msgs_cache'

  function getStoredJson(key, defaultVal) {
    try {
      const stored = sessionStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultVal
    } catch {
      return defaultVal
    }
  }

  const conversations = ref(getStoredJson(SESSION_CONVS_KEY, []))
  const teamMembers = ref([])
  const activeConversation = ref(null)
  const conversationDetails = ref(null)
  const isLoadingDetails = ref(false)
  const messages = ref([])
  const isLoading = ref(false)
  const isSending = ref(false)
  const typingUsers = ref({}) // conversationId -> { [userId]: userName }

  // Caches em memória para carregamento instantâneo (0ms)
  const messagesCache = ref(getStoredJson(SESSION_MSGS_KEY, {})) // convId -> message[]
  const detailsCache = ref({}) // convId -> details

  // Total de mensagens internas não lidas em todas as conversas
  const totalUnreadCount = computed(() => {
    return conversations.value.reduce((acc, conv) => acc + (conv.unread_count || 0), 0)
  })

  async function fetchConversations() {
    try {
      const { data } = await internalChatApi.listConversations()
      if (data?.success && Array.isArray(data.conversations)) {
        // Se já tiver uma conversa ativa aberta pelo usuário, preserva unread_count = 0
        if (activeConversation.value) {
          const activeInList = data.conversations.find(c => c.id === activeConversation.value.id)
          if (activeInList) {
            activeInList.unread_count = 0
            activeConversation.value = activeInList
          }
        }
        conversations.value = data.conversations
        try { sessionStorage.setItem(SESSION_CONVS_KEY, JSON.stringify(data.conversations)) } catch {}
      }
    } catch (err) {
      console.warn('Erro ao carregar conversas internas:', err)
    }
  }

  async function fetchTeamMembers() {
    try {
      const { data } = await internalChatApi.listTeamMembers()
      if (data?.success && Array.isArray(data.members)) {
        teamMembers.value = data.members
      }
    } catch (err) {
      console.warn('Erro ao carregar membros da equipe:', err)
    }
  }

  async function selectConversation(conv) {
    if (!conv) return
    activeConversation.value = conv

    // Zera imediatamente qualquer indicador de não lida na lista e no objeto ativo
    const targetInList = conversations.value.find(c => c.id === conv.id)
    if (targetInList) {
      targetInList.unread_count = 0
    }
    conv.unread_count = 0

    // Se já estiver em cache, exibe instantaneamente sem spinner (0ms)
    if (messagesCache.value[conv.id]) {
      messages.value = messagesCache.value[conv.id]
      isLoading.value = false
    } else {
      messages.value = []
      isLoading.value = true
    }

    // Sempre notifica o servidor que a conversa foi visualizada (persiste last_read_at)
    internalChatApi.markAsRead(conv.id).catch(() => {})

    // Busca mensagens atualizadas do servidor
    try {
      const { data } = await internalChatApi.getMessages(conv.id)
      if (data?.success && Array.isArray(data.messages)) {
        messagesCache.value[conv.id] = data.messages
        if (activeConversation.value?.id === conv.id) {
          messages.value = data.messages
          if (targetInList) targetInList.unread_count = 0
          conv.unread_count = 0
        }
      }
    } catch (err) {
      console.error('Erro ao buscar mensagens da conversa:', err)
    } finally {
      if (activeConversation.value?.id === conv.id) {
        isLoading.value = false
      }
    }
  }

  async function startDirectChatWith(userId) {
    try {
      // 1. Otimização instantânea: se já temos a conversa direta dessa pessoa na lista, abre ela direto!
      const existingConv = conversations.value.find(c =>
        c.type === 'direct' && (
          c.other_user_id === userId ||
          c.other_user?.id === userId ||
          c.participants?.some(p => (p.user_id || p.id) === userId)
        )
      )
      if (existingConv) {
        selectConversation(existingConv)
        return existingConv
      }

      // 2. Se não existir na memória, solicita ao backend
      const { data } = await internalChatApi.startDirectChat(userId)
      if (data?.success && data.conversation) {
        const newConv = data.conversation
        // Insere diretamente sem recarregar a lista inteira do zero
        if (!conversations.value.some(c => c.id === newConv.id)) {
          conversations.value.unshift(newConv)
        }
        selectConversation(newConv)
        return newConv
      }
    } catch (err) {
      ui.showToast('Erro ao abrir conversa direta: ' + (err.response?.data?.error || err.message), 'error')
    }
  }

  async function sendMessage(text, options = {}) {
    if (!activeConversation.value) return
    if (!text?.trim() && !options.media_url) return

    isSending.value = true
    try {
      const payload = {
        text: text?.trim(),
        media_url: options.media_url || null,
        media_type: options.media_type || null,
        file_name: options.file_name || null,
        reply_to_id: options.reply_to_id || null
      }

      const { data } = await internalChatApi.sendMessage(activeConversation.value.id, payload)
      if (data?.success && data.message) {
        // Se ainda não estiver na lista local, adiciona
        if (!messages.value.some(m => m.id === data.message.id)) {
          messages.value.push(data.message)
        }
        // Atualiza cache em memória
        const convId = activeConversation.value.id
        if (!messagesCache.value[convId]) messagesCache.value[convId] = []
        if (!messagesCache.value[convId].some(m => m.id === data.message.id)) {
          messagesCache.value[convId].push(data.message)
        }

        // Atualiza a conversa na lista lateral
        const conv = conversations.value.find(c => c.id === convId)
        if (conv) {
          conv.unread_count = 0
          conv.last_message_text = data.message.text || 'Arquivo compartilhado'
          conv.last_message_at = data.message.created_at
          // Move para o topo da lista
          conversations.value = [conv, ...conversations.value.filter(c => c.id !== conv.id)]
        }
      }
    } catch (err) {
      ui.showToast('Erro ao enviar mensagem: ' + (err.response?.data?.error || err.message), 'error')
    } finally {
      isSending.value = false
    }
  }

  async function sendMedia(file, metadata = {}) {
    if (!activeConversation.value || !file) return
    isSending.value = true
    try {
      const { data } = await internalChatApi.sendMedia(activeConversation.value.id, file, metadata)
      if (data?.success && data.message) {
        if (!messages.value.some(m => m.id === data.message.id)) {
          messages.value.push(data.message)
        }
        const convId = activeConversation.value.id
        if (!messagesCache.value[convId]) messagesCache.value[convId] = []
        if (!messagesCache.value[convId].some(m => m.id === data.message.id)) {
          messagesCache.value[convId].push(data.message)
        }

        const conv = conversations.value.find(c => c.id === convId)
        if (conv) {
          conv.unread_count = 0
          conv.last_message_text = data.message.text || (metadata.mediaType === 'audio' ? 'Mensagem de voz' : 'Arquivo compartilhado')
          conv.last_message_at = data.message.created_at
          conversations.value = [conv, ...conversations.value.filter(c => c.id !== conv.id)]
        }
        return data.message
      }
    } catch (err) {
      ui.showToast('Erro ao enviar arquivo: ' + (err.response?.data?.error || err.message), 'error')
    } finally {
      isSending.value = false
    }
  }

  // Recebe mensagem em tempo real do Socket.io
  function handleIncomingInternalMessage(message) {
    if (!message || !message.conversation_id) return

    const convId = message.conversation_id
    // Atualiza cache em memória
    if (!messagesCache.value[convId]) messagesCache.value[convId] = []
    if (!messagesCache.value[convId].some(m => m.id === message.id)) {
      messagesCache.value[convId].push(message)
    }

    const isCurrentActive = activeConversation.value?.id === convId
    const isFromMe = message.sender_id === auth.user?.id

    if (isCurrentActive) {
      if (!messages.value.some(m => m.id === message.id)) {
        messages.value.push(message)
      }
      if (!isFromMe) {
        internalChatApi.markAsRead(convId).catch(() => {})
      }
    } else {
      // Notificação se for de outro usuário
      if (!isFromMe) {
        const senderName = message.sender?.name || 'Colega de equipe'
        const preview = (message.text || 'Enviou um arquivo').slice(0, 50)
        ui.showToast(`💬 [Chat Interno] ${senderName}: "${preview}"`)
      }
    }

    // Atualiza prévia e contador na lista de conversas
    let conv = conversations.value.find(c => c.id === message.conversation_id)
    if (conv) {
      conv.last_message_text = message.text || 'Arquivo compartilhado'
      conv.last_message_at = message.created_at
      if (isCurrentActive || isFromMe) {
        conv.unread_count = 0
      } else {
        conv.unread_count = (conv.unread_count || 0) + 1
      }
      // Reordena conversa para o topo
      conversations.value = [conv, ...conversations.value.filter(c => c.id !== conv.id)]
    } else {
      // Se não estiver na lista (ex: nova conversa criada por outro usuário), recarrega lista
      fetchConversations()
    }
  }

  // Sincronização em tempo real de visualização da conversa
  function handleConversationRead({ conversationId, userId }) {
    if (userId === auth.user?.id) {
      const conv = conversations.value.find(c => c.id === conversationId)
      if (conv) {
        conv.unread_count = 0
      }
      if (activeConversation.value?.id === conversationId) {
        activeConversation.value.unread_count = 0
      }
    }
  }

  // Indicador de digitação
  function handleUserTyping({ conversationId, userId, userName, isTyping }) {
    if (userId === auth.user?.id) return
    if (!typingUsers.value[conversationId]) {
      typingUsers.value[conversationId] = {}
    }
    if (isTyping) {
      typingUsers.value[conversationId][userId] = userName
    } else {
      delete typingUsers.value[conversationId][userId]
    }
  }

  // Cria canal ou grupo corporativo
  async function createChannel(payload) {
    try {
      const { data } = await internalChatApi.createChannel(payload)
      if (data?.success && data.conversation) {
        if (!conversations.value.some(c => c.id === data.conversation.id)) {
          conversations.value.unshift(data.conversation)
        }
        await selectConversation(data.conversation)
        ui.showToast(`🎉 Canal "${data.conversation.name}" criado com sucesso!`)
        return data.conversation
      }
    } catch (err) {
      ui.showToast('Erro ao criar canal: ' + (err.response?.data?.error || err.message), 'error')
    }
  }

  // Busca detalhes da conversa (participantes e mídias) com cache instantâneo
  async function fetchConversationDetails(conversationId) {
    if (!conversationId) return

    // Se já estiver em cache, exibe instantaneamente
    if (detailsCache.value[conversationId]) {
      conversationDetails.value = detailsCache.value[conversationId]
      isLoadingDetails.value = false
    } else {
      conversationDetails.value = null
      isLoadingDetails.value = true
    }

    try {
      const { data } = await internalChatApi.getConversationDetails(conversationId)
      if (data?.success && data.details) {
        detailsCache.value[conversationId] = data.details
        if (activeConversation.value?.id === conversationId) {
          conversationDetails.value = data.details
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar detalhes da conversa:', err)
    } finally {
      if (activeConversation.value?.id === conversationId) {
        isLoadingDetails.value = false
      }
    }
  }

  // Atualiza canal ou grupo corporativo
  async function updateChannel(conversationId, payload) {
    try {
      const { data } = await internalChatApi.updateChannel(conversationId, payload)
      if (data?.success) {
        if (data.details) conversationDetails.value = data.details
        await fetchConversations()
        if (activeConversation.value?.id === conversationId) {
          const updated = conversations.value.find(c => c.id === conversationId)
          if (updated) activeConversation.value = updated
        }
        ui.showToast('Grupo atualizado com sucesso!')
        return data.details
      }
    } catch (err) {
      ui.showToast('Erro ao atualizar grupo: ' + (err.response?.data?.error || err.message), 'error')
      throw err
    }
  }

  // Exclui canal ou grupo corporativo
  async function deleteChannel(conversationId) {
    try {
      const { data } = await internalChatApi.deleteChannel(conversationId)
      if (data?.success) {
        conversations.value = conversations.value.filter(c => c.id !== conversationId)
        if (activeConversation.value?.id === conversationId) {
          activeConversation.value = conversations.value[0] || null
          if (activeConversation.value) selectConversation(activeConversation.value)
        }
        ui.showToast('Grupo excluído com sucesso.')
        return true
      }
    } catch (err) {
      ui.showToast('Erro ao excluir grupo: ' + (err.response?.data?.error || err.message), 'error')
      throw err
    }
  }

  // Sair de um grupo
  async function leaveChannel(conversationId) {
    try {
      const { data } = await internalChatApi.leaveChannel(conversationId)
      if (data?.success) {
        conversations.value = conversations.value.filter(c => c.id !== conversationId)
        if (activeConversation.value?.id === conversationId) {
          activeConversation.value = conversations.value[0] || null
          if (activeConversation.value) selectConversation(activeConversation.value)
        }
        ui.showToast('Você saiu do grupo.')
        return true
      }
    } catch (err) {
      ui.showToast('Erro ao sair do grupo: ' + (err.response?.data?.error || err.message), 'error')
      throw err
    }
  }

  // Alternar sub-responsável do canal
  async function toggleSubOwner(conversationId, targetUserId) {
    try {
      const { data } = await internalChatApi.toggleSubOwner(conversationId, targetUserId)
      if (data?.success) {
        if (data.details) conversationDetails.value = data.details
        ui.showToast(data.is_sub_owner ? 'Membro promovido a sub-responsável!' : 'Membro rebaixado.')
        return data
      }
    } catch (err) {
      ui.showToast('Erro: ' + (err.response?.data?.error || err.message), 'error')
      throw err
    }
  }

  // Notificação de novo canal criado em tempo real
  function handleConversationCreated(conv) {
    if (!conv || !conv.id) return
    if (!conversations.value.some(c => c.id === conv.id)) {
      conversations.value.unshift(conv)
      ui.showToast(`📢 Novo canal disponível: ${conv.name}`)
    }
  }

  function handleConversationUpdated(data) {
    if (!data?.id) return
    const conv = conversations.value.find(c => c.id === data.id)
    if (conv) {
      if (data.name) conv.name = data.name
      if (data.avatar_url !== undefined) conv.avatar_url = data.avatar_url
    }
    if (activeConversation.value?.id === data.id) {
      if (data.name) activeConversation.value.name = data.name
      if (data.avatar_url !== undefined) activeConversation.value.avatar_url = data.avatar_url
      if (data.details) conversationDetails.value = data.details
    }
  }

  function handleConversationDeleted({ id }) {
    if (!id) return
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeConversation.value?.id === id) {
      activeConversation.value = conversations.value[0] || null
      if (activeConversation.value) selectConversation(activeConversation.value)
    }
  }

  // ─── Fase 4: Reações, Fixação e Edição/Exclusão ──────────────────────────────
  const pinnedMessages = computed(() => {
    return messages.value.filter(m => m.is_pinned && !m.is_deleted)
  })

  async function toggleReaction(messageId, emoji) {
    try {
      // Otimista
      const msg = messages.value.find(m => m.id === messageId)
      if (msg) {
        msg.reactions = Array.isArray(msg.reactions) ? [...msg.reactions] : []
        const idx = msg.reactions.findIndex(r => r.emoji === emoji && r.user_id === auth.user?.id)
        if (idx >= 0) {
          msg.reactions.splice(idx, 1)
        } else {
          msg.reactions.push({ emoji, user_id: auth.user?.id, user_name: auth.user?.name })
        }
      }
      await internalChatApi.toggleReaction(messageId, emoji)
    } catch (err) {
      console.warn('Erro ao alternar reação:', err)
    }
  }

  async function togglePinMessage(messageId) {
    try {
      const msg = messages.value.find(m => m.id === messageId)
      if (msg) {
        msg.is_pinned = !msg.is_pinned
      }
      const { data } = await internalChatApi.togglePinMessage(messageId)
      if (data?.success) {
        ui.showToast(data.is_pinned ? '📌 Mensagem fixada!' : 'Mensagem desafixada.')
      }
    } catch (err) {
      ui.showToast('Erro ao fixar mensagem: ' + (err.response?.data?.error || err.message), 'error')
    }
  }

  async function editMessage(messageId, newText) {
    try {
      const { data } = await internalChatApi.editMessage(messageId, newText)
      if (data?.success && data.message) {
        const msg = messages.value.find(m => m.id === messageId)
        if (msg) {
          msg.text = data.message.text
          msg.is_edited = true
          msg.edited_at = data.message.edited_at
        }
        ui.showToast('Mensagem editada com sucesso!')
      }
    } catch (err) {
      ui.showToast('Erro ao editar mensagem: ' + (err.response?.data?.error || err.message), 'error')
    }
  }

  async function deleteMessage(messageId) {
    try {
      const { data } = await internalChatApi.deleteMessage(messageId)
      if (data?.success) {
        const msg = messages.value.find(m => m.id === messageId)
        if (msg) {
          msg.is_deleted = true
          msg.text = 'Esta mensagem foi apagada'
          msg.media_url = null
        }
        ui.showToast('Mensagem apagada.')
      }
    } catch (err) {
      ui.showToast('Erro ao excluir mensagem: ' + (err.response?.data?.error || err.message), 'error')
    }
  }

  // Handlers para eventos de WebSocket em tempo real (Fase 4)
  function handleReactionUpdated({ messageId, reactions }) {
    const msg = messages.value.find(m => m.id === messageId)
    if (msg) {
      msg.reactions = reactions || []
    }
  }

  function handleMessagePinned({ messageId, is_pinned, pinned_by, pinned_at }) {
    const msg = messages.value.find(m => m.id === messageId)
    if (msg) {
      msg.is_pinned = is_pinned
      msg.pinned_by = pinned_by
      msg.pinned_at = pinned_at
    }
  }

  function handleMessageEdited({ messageId, text, is_edited, edited_at }) {
    const msg = messages.value.find(m => m.id === messageId)
    if (msg) {
      msg.text = text
      msg.is_edited = is_edited
      msg.edited_at = edited_at
    }
  }

  function resetLocalState() {
    conversations.value = []
    messages.value = []
    messagesCache.value = {}
    detailsCache.value = {}
    activeConversation.value = null
    conversationDetails.value = null
    typingUsers.value = {}
    try {
      sessionStorage.removeItem(SESSION_CONVS_KEY)
      sessionStorage.removeItem(SESSION_MSGS_KEY)
    } catch {}
  }

  function handleMessageDeleted({ messageId }) {
    const msg = messages.value.find(m => m.id === messageId)
    if (msg) {
      msg.is_deleted = true
      msg.text = 'Esta mensagem foi apagada'
      msg.media_url = null
    }
  }

  return {
    conversations,
    teamMembers,
    activeConversation,
    conversationDetails,
    isLoadingDetails,
    messages,
    pinnedMessages,
    isLoading,
    isSending,
    typingUsers,
    totalUnreadCount,
    fetchConversations,
    resetLocalState,
    fetchTeamMembers,
    selectConversation,
    startDirectChatWith,
    createChannel,
    updateChannel,
    deleteChannel,
    leaveChannel,
    toggleSubOwner,
    fetchConversationDetails,
    handleConversationCreated,
    handleConversationUpdated,
    handleConversationDeleted,
    sendMessage,
    sendMedia,
    handleIncomingInternalMessage,
    handleConversationRead,
    handleUserTyping,
    toggleReaction,
    togglePinMessage,
    editMessage,
    deleteMessage,
    handleReactionUpdated,
    handleMessagePinned,
    handleMessageEdited,
    handleMessageDeleted
  }
})
