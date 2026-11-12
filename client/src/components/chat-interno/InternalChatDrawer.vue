<template>
  <aside class="internal-chat-drawer" id="internalChatDrawer">
    <!-- MODO 1: CONVERSA ABERTA COM COLEGA OU CANAL -->
    <div v-if="chatStore.activeConversation" class="drawer-view-chat">
      <!-- Header da Conversa -->
      <header class="drawer-header chat-mode-header">
        <div class="header-left-col">
          <button
            type="button"
            class="back-to-list-btn"
            title="Voltar para lista de colegas"
            @click="chatStore.activeConversation = null"
          >
            <i class="ri-arrow-left-s-line"></i>
          </button>

          <!-- Foto e Dados do Colega -->
          <div class="contact-header-info">
            <div class="user-avatar-frame">
              <img
                :src="getAvatarPhoto(activeTargetUser || { name: chatStore.activeConversation.name })"
                :alt="chatStore.activeConversation.name"
                class="avatar-photo"
                @error="onAvatarImgError($event, activeTargetUser || { name: chatStore.activeConversation.name })"
              />
              <span
                v-if="chatStore.activeConversation.type === 'direct'"
                class="online-status-badge"
                :class="{ online: isUserOnline(activeTargetUser?.id) }"
              ></span>
            </div>

            <div class="user-text-info">
              <h3 class="user-display-name">{{ chatStore.activeConversation.name }}</h3>
              <p class="user-status-line">
                <template v-if="chatStore.activeConversation.type === 'direct'">
                  <span class="status-indicator" :class="{ online: isUserOnline(activeTargetUser?.id) }">
                    <span class="dot-mini"></span>
                    {{ getUserStatusText(activeTargetUser) }}
                  </span>
                  <span v-if="activeTargetUser?.cargo || activeTargetUser?.role" class="user-role-text">• {{ activeTargetUser.cargo || activeTargetUser.role }}</span>
                </template>
                <template v-else-if="chatStore.activeConversation.type === 'general'">
                  <span class="channel-desc-text">📢 Canal Geral da Empresa</span>
                </template>
                <template v-else>
                  <span class="channel-desc-text">🏢 Canal do Setor</span>
                </template>
              </p>
            </div>
          </div>
        </div>

        <div class="header-right-col">
          <button
            type="button"
            class="drawer-close-btn"
            title="Fechar chat interno"
            @click="$emit('close')"
          >
            <i class="ri-close-line"></i>
          </button>
        </div>
      </header>

      <!-- Mensagens da Conversa -->
      <div class="drawer-messages-scroll" ref="messagesScrollRef">
        <div v-if="chatStore.isLoading" class="loading-state">
          <i class="ri-loader-4-line spin-icon"></i>
          <span>Carregando mensagens...</span>
        </div>

        <div v-else-if="chatStore.messages.length === 0" class="empty-conversation-state">
          <div class="avatar-hero">
            <img
              :src="getAvatarPhoto(activeTargetUser || { name: chatStore.activeConversation.name })"
              :alt="chatStore.activeConversation.name"
            />
          </div>
          <h4>{{ chatStore.activeConversation.name }}</h4>
          <p>Envie uma mensagem interna para iniciar o diálogo.</p>
        </div>

        <div v-else class="messages-stream">
          <div
            v-for="(msg, index) in chatStore.messages"
            :key="msg.id || index"
            class="chat-bubble-row"
            :class="{
              'mine': msg.sender_id === auth.user?.id,
              'theirs': msg.sender_id !== auth.user?.id
            }"
          >
            <!-- Foto do remetente nas mensagens recebidas -->
            <div v-if="msg.sender_id !== auth.user?.id" class="bubble-sender-avatar">
              <img
                :src="getAvatarPhoto(msg.sender || { name: 'Colega' })"
                :alt="msg.sender?.name"
                @error="onAvatarImgError($event, msg.sender)"
              />
            </div>

            <div class="bubble-content-wrap">
              <span
                v-if="msg.sender_id !== auth.user?.id && chatStore.activeConversation.type !== 'direct'"
                class="bubble-sender-title"
              >
                {{ msg.sender?.name || 'Colega' }}
              </span>

              <div class="bubble-text">
                {{ msg.text }}
              </div>

              <div class="bubble-footer">
                <span class="bubble-time">{{ formatTime(msg.created_at) }}</span>
                <i v-if="msg.sender_id === auth.user?.id" class="ri-check-double-line check-read"></i>
              </div>
            </div>
          </div>
        </div>

        <!-- Indicador de Digitação -->
        <div v-if="isTypingNow" class="drawer-typing-alert">
          <div class="dots-bounce">
            <span></span><span></span><span></span>
          </div>
          <span>{{ typingLabel }}</span>
        </div>
      </div>

      <!-- Barra de Envio Inferior -->
      <footer class="drawer-footer-input">
        <form class="input-form-box" @submit.prevent="handleSendMessage">
          <button
            type="button"
            class="quick-emoji-btn"
            title="Adicionar emoji"
            @click="addEmoji('👋')"
          >
            <i class="ri-emotion-happy-line"></i>
          </button>

          <textarea
            ref="inputRef"
            v-model="messageText"
            rows="1"
            placeholder="Mensagem interna... (Enter envia)"
            class="drawer-textarea"
            @keydown="onKeydownInput"
          ></textarea>

          <button
            type="submit"
            class="send-btn"
            :disabled="!messageText.trim() || chatStore.isSending"
            title="Enviar mensagem"
          >
            <i v-if="chatStore.isSending" class="ri-loader-4-line spin-icon"></i>
            <i v-else class="ri-send-plane-2-fill"></i>
          </button>
        </form>
      </footer>
    </div>

    <!-- MODO 2: LISTA DE COLEGAS E CANAIS DA EMPRESA -->
    <div v-else class="drawer-view-list">
      <!-- Header da Lista -->
      <header class="drawer-header list-mode-header">
        <div class="header-branding">
          <span class="brand-badge"><i class="ri-team-fill"></i></span>
          <div>
            <h2 class="drawer-title">Chat da Equipe</h2>
            <span class="drawer-subtitle">Comunicação Interna</span>
          </div>
        </div>

        <div class="header-actions">
          <span class="online-tag" :title="`${onlineCount} online`">
            <span class="pulse-green-dot"></span>
            {{ onlineCount }} online
          </span>
          <button
            type="button"
            class="drawer-close-btn"
            title="Fechar painel"
            @click="$emit('close')"
          >
            <i class="ri-close-line"></i>
          </button>
        </div>
      </header>

      <!-- Barra de Busca de Colegas -->
      <div class="drawer-search-row">
        <div class="search-input-group">
          <i class="ri-search-line search-icon"></i>
          <input
            v-model="searchTerm"
            type="text"
            placeholder="Buscar colega por nome ou setor..."
            class="team-search-input"
          />
          <button v-if="searchTerm" class="btn-clear-search" @click="searchTerm = ''">
            <i class="ri-close-line"></i>
          </button>
        </div>
      </div>

      <!-- Scroll da Lista de Colegas e Canais -->
      <div class="drawer-list-scroll">
        <!-- Canal Geral da Empresa -->
        <div class="section-title">CANAL DA EMPRESA</div>
        <div
          v-for="conv in channelConversations"
          :key="conv.id"
          class="team-member-card channel-card"
          @click="chatStore.selectConversation(conv)"
        >
          <div class="channel-icon-avatar">
            <i :class="conv.type === 'general' ? 'ri-megaphone-fill' : 'ri-building-4-fill'"></i>
          </div>
          <div class="card-text-col">
            <div class="card-name-row">
              <span class="card-title-bold">{{ conv.name }}</span>
              <span v-if="conv.last_message_at" class="card-timestamp">
                {{ formatTime(conv.last_message_at) }}
              </span>
            </div>
            <div class="card-preview-row">
              <span class="card-preview-text">
                {{ conv.last_message_text || 'Recados e avisos para toda a equipe' }}
              </span>
              <span v-if="conv.unread_count > 0" class="unread-count-pill">
                {{ conv.unread_count }}
              </span>
            </div>
          </div>
        </div>

        <!-- Seção: Colaboradores da Empresa -->
        <div class="section-title section-space">
          COLEGAS DE TRABALHO ({{ filteredMembers.length }})
        </div>

        <div v-if="filteredMembers.length === 0" class="empty-search-msg">
          <i class="ri-user-unfollow-line"></i>
          <span>Nenhum colega encontrado com esse nome.</span>
        </div>

        <!-- Lista de Colegas com Fotos -->
        <div
          v-for="member in filteredMembers"
          :key="member.id"
          class="team-member-card"
          @click="openDirect(member.id)"
        >
          <!-- Foto do Usuário com Status Online -->
          <div class="member-photo-frame">
            <img
              :src="getAvatarPhoto(member)"
              :alt="member.name"
              class="member-photo"
              @error="onAvatarImgError($event, member)"
            />
            <span
              class="photo-status-dot"
              :class="{ online: isUserOnline(member.id) }"
              :title="isUserOnline(member.id) ? 'Disponível online' : 'Offline'"
            ></span>
          </div>

          <!-- Informações do Usuário -->
          <div class="card-text-col">
            <div class="card-name-row">
              <span class="card-title-bold">{{ member.name }}</span>
              <span v-if="getDirectConv(member.id)?.last_message_at" class="card-timestamp">
                {{ formatTime(getDirectConv(member.id).last_message_at) }}
              </span>
            </div>
            <div class="card-preview-row">
              <span class="card-role-label">
                {{ member.cargo || member.role || 'Colaborador' }}
                <template v-if="getDirectConv(member.id)?.last_message_text">
                  — {{ getDirectConv(member.id).last_message_text }}
                </template>
              </span>
              <span v-if="getDirectConv(member.id)?.unread_count > 0" class="unread-count-pill">
                {{ getDirectConv(member.id).unread_count }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useInternalChatStore } from '@/stores/internal-chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'

defineEmits(['close'])

const chatStore = useInternalChatStore()
const auth = useAuthStore()
const ui = useUiStore()

const searchTerm = ref('')
const messageText = ref('')
const messagesScrollRef = ref(null)
const inputRef = ref(null)

onMounted(async () => {
  await Promise.all([
    chatStore.fetchConversations(),
    chatStore.fetchTeamMembers()
  ])
})

watch(() => chatStore.messages.length, () => {
  scrollToBottom()
})

watch(() => chatStore.activeConversation?.id, () => {
  scrollToBottom()
  nextTick(() => inputRef.value?.focus())
})

function scrollToBottom() {
  nextTick(() => {
    if (messagesScrollRef.value) {
      messagesScrollRef.value.scrollTop = messagesScrollRef.value.scrollHeight
    }
  })
}

// ─── Computeds ────────────────────────────────────────────────────────────────
const onlineCount = computed(() => ui.onlineUsersCount || 1)

const channelConversations = computed(() => {
  return chatStore.conversations.filter(c => c.type === 'general' || c.type === 'department')
})

const filteredMembers = computed(() => {
  const q = searchTerm.value.toLowerCase().trim()
  if (!q) return chatStore.teamMembers
  return chatStore.teamMembers.filter(m =>
    m.name?.toLowerCase().includes(q) ||
    m.cargo?.toLowerCase().includes(q) ||
    m.role?.toLowerCase().includes(q) ||
    m.email?.toLowerCase().includes(q)
  )
})

const activeTargetUser = computed(() => {
  if (chatStore.activeConversation?.type !== 'direct') return null
  return chatStore.activeConversation.other_user
})

const isTypingNow = computed(() => {
  if (!chatStore.activeConversation) return false
  const typers = chatStore.typingUsers[chatStore.activeConversation.id]
  return typers && Object.keys(typers).length > 0
})

const typingLabel = computed(() => {
  if (!chatStore.activeConversation) return ''
  const typers = chatStore.typingUsers[chatStore.activeConversation.id] || {}
  const names = Object.values(typers)
  if (names.length === 1) return `${names[0]} está digitando...`
  if (names.length > 1) return `${names[0]} e outros estão digitando...`
  return ''
})

// ─── Helpers de Fotos dos Usuários ───────────────────────────────────────────
function getAvatarPhoto(user) {
  if (user?.avatar_url && !user.avatar_url.includes('undefined')) {
    return user.avatar_url
  }
  // Gera uma foto de perfil nítida e profissional baseada no nome
  const name = user?.name || 'Colaborador'
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=ffffff&size=128&bold=true&format=svg`
}

function onAvatarImgError(event, user) {
  // Se a foto falhar ao carregar, aplica fallback de avatar fotográfico
  const name = user?.name || 'Colaborador'
  event.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=ffffff&size=128&bold=true&format=svg`
}

function isUserOnline(userId) {
  if (!userId) return false
  if (userId === auth.user?.id) return true
  return ui.onlineUsersList.some(u => String(u.id) === String(userId))
}

function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return 'Offline'
  const date = new Date(lastSeenAt)
  if (isNaN(date.getTime())) return 'Offline'

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffTime = today.getTime() - targetDay.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const timeStr = `${hours}:${minutes}`

  if (diffDays === 0) {
    return `Visto por último hoje às ${timeStr}`
  } else if (diffDays === 1) {
    return `Visto por último ontem às ${timeStr}`
  } else {
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    if (date.getFullYear() === now.getFullYear()) {
      return `Visto por último em ${day}/${month} às ${timeStr}`
    } else {
      return `Visto por último em ${day}/${month}/${date.getFullYear()} às ${timeStr}`
    }
  }
}

function getUserStatusText(user) {
  if (!user?.id) return ''
  if (isUserOnline(user.id)) return 'Online'
  const lastSeen = ui.lastSeenUsers?.[user.id] || user.last_seen_at
  return formatLastSeen(lastSeen)
}

function getDirectConv(userId) {
  return chatStore.conversations.find(c =>
    c.type === 'direct' && String(c.other_user?.id) === String(userId)
  )
}

async function openDirect(targetUserId) {
  await chatStore.startDirectChatWith(targetUserId)
}

// ─── Envio de Mensagem ────────────────────────────────────────────────────────
async function handleSendMessage() {
  const text = messageText.value.trim()
  if (!text) return

  messageText.value = ''
  await chatStore.sendMessage(text)
  scrollToBottom()
}

function onKeydownInput(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSendMessage()
  }
}

function addEmoji(emoji) {
  messageText.value += emoji
  inputRef.value?.focus()
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}
</script>

<style scoped>
.internal-chat-drawer {
  width: 410px;
  min-width: 410px;
  max-width: 410px;
  height: 100%;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  z-index: 40;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.04);
  font-family: inherit;
  overflow: hidden;
}

/* ─── HEADERS ───────────────────────────────────────────────────────────────── */
.drawer-header {
  height: 60px;
  padding: 0 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.list-mode-header .header-branding {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-badge {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  line-height: 1.2;
}

.drawer-subtitle {
  font-size: 11px;
  color: #64748b;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.online-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.pulse-green-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

.drawer-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.drawer-close-btn:hover {
  color: #0f172a;
  background: #f1f5f9;
}

/* Chat Header */
.chat-mode-header .header-left-col {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.back-to-list-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 22px;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.back-to-list-btn:hover {
  background: #f1f5f9;
  color: #2563eb;
}

.contact-header-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.user-avatar-frame {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  flex-shrink: 0;
}

.avatar-photo {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #e2e8f0;
}

.online-status-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #cbd5e1;
  border: 2px solid #ffffff;
}

.online-status-badge.online {
  background: #22c55e;
}

.user-text-info {
  min-width: 0;
}

.user-display-name {
  font-size: 13.5px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-status-line {
  font-size: 11px;
  color: #64748b;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #94a3b8;
}

.status-indicator.online {
  color: #16a34a;
  font-weight: 600;
}

.dot-mini {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

/* ─── BUSCA DE EQUIPE ───────────────────────────────────────────────────────── */
.drawer-search-row {
  padding: 10px 14px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
}

.search-input-group {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: #94a3b8;
  font-size: 14px;
}

.team-search-input {
  width: 100%;
  height: 34px;
  padding: 0 28px 0 32px;
  background: #f1f5f9;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 12.5px;
  color: #0f172a;
  outline: none;
  transition: all 0.15s ease;
}

.team-search-input:focus {
  background: #ffffff;
  border-color: #cbd5e1;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.btn-clear-search {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
}

/* ─── LISTA DE MEMBROS E CARDS ──────────────────────────────────────────────── */
.drawer-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  padding: 6px 6px 4px 6px;
  letter-spacing: 0.5px;
}

.section-space {
  margin-top: 14px;
}

.team-member-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 2px;
  user-select: none;
}

.team-member-card:hover {
  background: #f8fafc;
}

.channel-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.channel-card:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.channel-icon-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 19px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-photo-frame {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  flex-shrink: 0;
}

.member-photo {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #e2e8f0;
}

.photo-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #cbd5e1;
  border: 2px solid #ffffff;
}

.photo-status-dot.online {
  background: #22c55e;
}

.card-text-col {
  flex: 1;
  min-width: 0;
}

.card-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.card-title-bold {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-timestamp {
  font-size: 11px;
  color: #94a3b8;
  margin-left: 6px;
  flex-shrink: 0;
}

.card-preview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.card-preview-text,
.card-role-label {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unread-count-pill {
  background: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  flex-shrink: 0;
}

.empty-search-msg {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

/* ─── CHAT ACTIVE MODE ──────────────────────────────────────────────────────── */
.drawer-view-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.drawer-messages-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
}

.loading-state {
  margin: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 12.5px;
}

.empty-conversation-state {
  margin: auto;
  text-align: center;
  color: #64748b;
  padding: 20px;
}

.avatar-hero {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  margin: 0 auto 10px auto;
  overflow: hidden;
  border: 2px solid #e2e8f0;
}

.avatar-hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.empty-conversation-state h4 {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px 0;
}

.empty-conversation-state p {
  font-size: 12px;
  margin: 0;
}

.messages-stream {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-bubble-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 82%;
}

.chat-bubble-row.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-bubble-row.theirs {
  align-self: flex-start;
}

.bubble-sender-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid #e2e8f0;
}

.bubble-sender-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bubble-content-wrap {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 7px 11px;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.chat-bubble-row.mine .bubble-content-wrap {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
  border-bottom-right-radius: 2px;
}

.chat-bubble-row.theirs .bubble-content-wrap {
  border-bottom-left-radius: 2px;
}

.bubble-sender-title {
  font-size: 11px;
  font-weight: 700;
  color: #2563eb;
  display: block;
  margin-bottom: 2px;
}

.bubble-text {
  font-size: 13px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 3px;
}

.bubble-time {
  font-size: 10px;
  color: #94a3b8;
}

.chat-bubble-row.mine .bubble-time {
  color: rgba(255, 255, 255, 0.8);
}

.check-read {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
}

.drawer-typing-alert {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: #64748b;
  margin-top: 8px;
}

.dots-bounce {
  display: flex;
  gap: 3px;
}

.dots-bounce span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #94a3b8;
  animation: typing-blink 1.4s infinite both;
}

.dots-bounce span:nth-child(2) { animation-delay: 0.2s; }
.dots-bounce span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-blink {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* ─── FOOTER INPUT ──────────────────────────────────────────────────────────── */
.drawer-footer-input {
  padding: 10px 14px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
}

.input-form-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 3px 6px;
  transition: all 0.15s ease;
}

.input-form-box:focus-within {
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.quick-emoji-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 17px;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-emoji-btn:hover {
  color: #2563eb;
}

.drawer-textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  font-size: 13px;
  color: #0f172a;
  max-height: 80px;
  line-height: 1.35;
  padding: 4px 0;
  font-family: inherit;
}

.send-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.send-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .internal-chat-drawer {
    position: fixed;
    top: 54px;
    right: 0;
    bottom: 0;
    width: 100vw;
    min-width: 100vw;
    max-width: 100vw;
    z-index: 100;
  }
}
</style>
