<template>
  <div>
    <!-- 1. JANELINHA PEQUENA (POPOVER) ABAIXO DO BOTÃO DE HISTÓRICO -->
    <template v-if="isOpen && !selectedChat">
      <!-- Backdrop transparente invisível para fechar ao clicar fora (SEM BORRÃO) -->
      <div class="history-popover-backdrop" @click="close"></div>

      <!-- Janelinha pequena ancorada embaixo do botão -->
      <div class="history-dropdown-popover" @click.stop>
        <!-- Cabeçalho compacto -->
        <div class="popover-header">
          <div class="popover-title-row">
            <span class="popover-icon"><i class="fa-solid fa-clock-rotate-left"></i></span>
            <div class="popover-title-info">
              <span class="popover-title">Histórico do Cliente</span>
              <span v-if="ticket?.department" class="popover-dept-badge">
                <i class="fa-solid fa-building"></i> {{ ticket.department }}
              </span>
            </div>
          </div>
          <div class="popover-actions">
            <span class="popover-count-pill">{{ historyList.length }} atend.</span>
            <button type="button" class="popover-close-btn" @click="close" title="Fechar (Esc)">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Barra de pesquisa textual -->
        <div class="popover-search-box">
          <div class="search-input-group">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              v-model="searchQuery"
              class="popover-search-input"
              placeholder="Pesquisar assunto ou mensagem (ex: Nota Fiscal)..."
              @keyup.enter="fetchHistory"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="clear-icon-btn"
              @click="clearSearch"
              title="Limpar pesquisa"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Filtros rápidos (data e atendente) -->
        <div class="popover-filter-row">
          <div class="filter-field">
            <label>De:</label>
            <input type="date" v-model="dateFrom" class="filter-input-date" @change="fetchHistory" />
          </div>
          <div class="filter-field">
            <label>Até:</label>
            <input type="date" v-model="dateTo" class="filter-input-date" @change="fetchHistory" />
          </div>
          <div class="filter-field agent-field">
            <label>Atend.:</label>
            <input
              type="text"
              v-model="agentNameFilter"
              class="filter-input-text"
              placeholder="Nome..."
              @keyup.enter="fetchHistory"
            />
          </div>
          <button type="button" class="btn-popover-filter" @click="fetchHistory" title="Aplicar filtros">
            <i class="fa-solid fa-filter"></i>
          </button>
          <button
            v-if="hasActiveFilters"
            type="button"
            class="btn-popover-reset"
            @click="resetFilters"
            title="Limpar filtros"
          >
            <i class="fa-solid fa-rotate-left"></i>
          </button>
        </div>

        <!-- Lista de atendimentos do departamento -->
        <div class="popover-list-area">
          <div v-if="loading" class="popover-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Buscando atendimentos deste departamento...</span>
          </div>

          <div v-else-if="historyList.length === 0" class="popover-empty">
            <i class="fa-regular fa-folder-open empty-icon"></i>
            <span class="empty-main">Nenhum atendimento anterior</span>
            <small v-if="hasActiveFilters">Tente alterar os filtros ou termos da pesquisa.</small>
            <small v-else>Não há outros atendimentos finalizados deste cliente neste departamento.</small>
          </div>

          <div v-else class="popover-items-wrapper">
            <div
              v-for="item in historyList"
              :key="item.id"
              class="popover-item-card"
              @click="openChatDetails(item)"
              title="Clique para ver toda a conversa"
            >
              <!-- Linha superior: Data/Hora e Atendente com Foto -->
              <div class="item-header-row">
                <span class="item-date">
                  <i class="fa-regular fa-calendar-check"></i>
                  {{ item.date }}
                </span>

                <div class="item-agent">
                  <img
                    v-if="item.agent_avatar_url"
                    :src="item.agent_avatar_url"
                    alt="Foto do atendente"
                    class="agent-avatar-img"
                    referrerpolicy="no-referrer"
                  />
                  <span v-else class="agent-avatar-initials">
                    {{ getInitials(item.agent_name) }}
                  </span>
                  <span class="agent-name-text">{{ item.agent_name }}</span>
                </div>
              </div>

              <!-- Resumo do assunto -->
              <div class="item-summary-row">
                {{ item.summary || 'Atendimento finalizado' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 2. POPUP DA CONVERSA COMPLETA: DRAWER LATERAL ESTILO BLOCO DE NOTAS (MENOR E SEM BORRÃO) -->
    <Teleport to="body">
      <Transition name="chat-drawer-slide">
        <div v-if="selectedChat" class="history-drawer-wrapper">
          <!-- Backdrop transparente invisível para clique fora (SEM BORRÃO) -->
          <div class="history-drawer-backdrop" @click="closeChatDetails"></div>

          <div class="history-drawer-panel" @click.stop>
            <!-- Cabeçalho do Drawer -->
            <div class="drawer-header">
              <div class="drawer-header-left">
                <button
                  type="button"
                  class="btn-drawer-back"
                  @click="closeChatDetails"
                  title="Voltar para a lista"
                >
                  <i class="fa-solid fa-arrow-left"></i>
                </button>

                <div class="drawer-header-meta">
                  <div class="drawer-title-row">
                    <img
                      v-if="selectedChat.agent_avatar_url"
                      :src="selectedChat.agent_avatar_url"
                      alt="Foto do atendente"
                      class="drawer-agent-avatar"
                      referrerpolicy="no-referrer"
                    />
                    <span v-else class="drawer-agent-avatar-initials">
                      {{ getInitials(selectedChat.agent_name) }}
                    </span>
                    <strong class="drawer-agent-name">{{ selectedChat.agent_name }}</strong>
                  </div>
                  <div class="drawer-submeta">
                    <span><i class="fa-regular fa-calendar"></i> {{ selectedChat.date }}</span>
                    <span v-if="selectedChat.department" class="drawer-dept-tag">
                      <i class="fa-solid fa-building"></i> {{ selectedChat.department }}
                    </span>
                  </div>
                </div>
              </div>

              <button type="button" class="btn-drawer-close" @click="closeChatDetails" title="Fechar (Esc)">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <!-- Barra de pesquisa interna na conversa -->
            <div class="drawer-search-bar">
              <div class="search-input-group">
                <i class="fa-solid fa-magnifying-glass search-icon"></i>
                <input
                  type="text"
                  v-model="chatSearchQuery"
                  class="drawer-search-input"
                  placeholder="Pesquisar mensagens desta conversa..."
                />
                <span v-if="chatSearchQuery" class="search-count-tag">
                  {{ filteredChatMessages.length }} encontrada(s)
                </span>
                <button
                  v-if="chatSearchQuery"
                  type="button"
                  class="clear-icon-btn"
                  @click="chatSearchQuery = ''"
                  title="Limpar pesquisa"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            <!-- Corpo das mensagens trocadas -->
            <div class="drawer-chat-body" ref="chatDetailBodyRef">
              <div v-if="loadingChat" class="drawer-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Carregando mensagens da conversa...</span>
              </div>

              <div v-else-if="filteredChatMessages.length === 0" class="drawer-empty">
                <p>Nenhuma mensagem correspondente encontrada.</p>
              </div>

              <div v-else class="drawer-messages-list">
                <div
                  v-for="msg in filteredChatMessages"
                  :key="msg.id || msg.created_at"
                  class="bubble-row"
                  :class="[
                    msg.sender === 'client' ? 'bubble-client' : 'bubble-agent',
                    { 'bubble-highlight': isMessageHighlighted(msg) }
                  ]"
                >
                  <div class="bubble-box">
                    <div class="bubble-sender-label">
                      {{ msg.sender === 'client' ? (ticket?.client_name || 'Cliente') : (msg.sender_name || selectedChat.agent_name) }}
                    </div>

                    <!-- Mídia se houver -->
                    <div v-if="msg.media_url" class="bubble-media-box">
                      <img
                        v-if="msg.type === 'image' || msg.media_type === 'image'"
                        :src="msg.media_url"
                        alt="Imagem do chat"
                        class="bubble-img"
                      />
                      <audio
                        v-else-if="msg.type === 'audio' || msg.media_type === 'audio'"
                        controls
                        :src="msg.media_url"
                        class="bubble-audio-player"
                      ></audio>
                      <a
                        v-else
                        :href="msg.media_url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="bubble-file-link"
                      >
                        <i class="fa-solid fa-file-lines"></i>
                        <span>{{ msg.file_name || 'Abrir documento' }}</span>
                      </a>
                    </div>

                    <!-- Texto -->
                    <p class="bubble-message-text">{{ msg.text }}</p>

                    <!-- Horário -->
                    <span class="bubble-time-label">
                      {{ formatMessageTime(msg.created_at || msg.time) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Rodapé informativo do Drawer -->
            <div class="drawer-footer">
              <small>Atendimento finalizado • Somente leitura</small>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ticketsApi } from '@/api/tickets.api'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  ticket: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const loading = ref(false)
const historyList = ref([])
const searchQuery = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const agentNameFilter = ref('')

const selectedChat = ref(null)
const loadingChat = ref(false)
const chatMessages = ref([])
const chatSearchQuery = ref('')
const chatDetailBodyRef = ref(null)

const hasActiveFilters = computed(() => {
  return Boolean(searchQuery.value.trim() || dateFrom.value || dateTo.value || agentNameFilter.value.trim())
})

function getInitials(name) {
  if (!name) return 'AT'
  const parts = String(name).trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return String(name).slice(0, 2).toUpperCase()
}

function formatPhone(val) {
  if (!val) return ''
  const clean = String(val).replace(/\D/g, '')
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  }
  if (clean.length === 13) {
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`
  }
  return val
}

function formatMessageTime(val) {
  if (!val) return ''
  try {
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
  } catch (_) {}
  return String(val).slice(0, 5)
}

async function fetchHistory() {
  if (!props.ticket?.id) return
  loading.value = true
  try {
    const params = {}
    if (searchQuery.value.trim()) params.search = searchQuery.value.trim()
    if (dateFrom.value) params.dateFrom = dateFrom.value
    if (dateTo.value) params.dateTo = dateTo.value
    if (agentNameFilter.value.trim()) params.agentName = agentNameFilter.value.trim()

    const res = await ticketsApi.getClientHistory(props.ticket.id, params)
    if (res.data?.success) {
      historyList.value = res.data.history || []
    }
  } catch (err) {
    console.error('Erro ao buscar histórico do cliente:', err)
  } finally {
    loading.value = false
  }
}

function clearSearch() {
  searchQuery.value = ''
  fetchHistory()
}

function resetFilters() {
  searchQuery.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  agentNameFilter.value = ''
  fetchHistory()
}

async function openChatDetails(item) {
  selectedChat.value = item
  loadingChat.value = true
  chatMessages.value = []
  chatSearchQuery.value = ''
  try {
    const res = await ticketsApi.get(item.id)
    if (res.data?.success && res.data.ticket) {
      chatMessages.value = res.data.ticket.messages || []
      await nextTick()
      if (chatDetailBodyRef.value) {
        chatDetailBodyRef.value.scrollTop = chatDetailBodyRef.value.scrollHeight
      }
    }
  } catch (err) {
    console.error('Erro ao carregar mensagens do atendimento:', err)
  } finally {
    loadingChat.value = false
  }
}

function closeChatDetails() {
  selectedChat.value = null
  chatMessages.value = []
  chatSearchQuery.value = ''
}

const filteredChatMessages = computed(() => {
  if (!chatSearchQuery.value.trim()) {
    return chatMessages.value
  }
  const term = chatSearchQuery.value.trim().toLowerCase()
  return chatMessages.value.filter(m => (m.text || '').toLowerCase().includes(term))
})

function isMessageHighlighted(msg) {
  if (!chatSearchQuery.value.trim()) return false
  return (msg.text || '').toLowerCase().includes(chatSearchQuery.value.trim().toLowerCase())
}

function close() {
  selectedChat.value = null
  emit('close')
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    if (selectedChat.value) {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      closeChatDetails()
    } else if (props.isOpen) {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      close()
    }
  }
}

watch(() => props.isOpen, (open) => {
  if (open && props.ticket?.id) {
    selectedChat.value = null
    fetchHistory()
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})
</script>

<style scoped>
/* 1. JANELINHA PEQUENA (POPOVER) */
.history-popover-backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
  backdrop-filter: none;
  z-index: 1190;
  cursor: default;
}

.history-dropdown-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 440px;
  max-width: calc(100vw - 32px);
  max-height: 520px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 12px 36px -4px rgba(15, 23, 42, 0.18), 0 4px 12px -2px rgba(15, 23, 42, 0.08);
  border: 1px solid #e2e8f0;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: popover-drop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes popover-drop {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.popover-header {
  padding: 12px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.popover-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.popover-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #eff6ff;
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}

.popover-title-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.popover-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
}

.popover-dept-badge {
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  background: #e2e8f0;
  padding: 2px 7px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.popover-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.popover-count-pill {
  font-size: 11px;
  font-weight: 600;
  color: #2563eb;
  background: #dbeafe;
  padding: 2px 7px;
  border-radius: 12px;
}

.popover-close-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: all 0.15s ease;
}

.popover-close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.popover-search-box {
  padding: 10px 14px 6px;
  background: #ffffff;
}

.search-input-group {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: #94a3b8;
  font-size: 12px;
  pointer-events: none;
}

.popover-search-input {
  width: 100%;
  padding: 7px 30px 7px 30px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 12px;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.popover-search-input:focus {
  border-color: #2563eb;
  background: #ffffff;
}

.clear-icon-btn {
  position: absolute;
  right: 8px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  font-size: 11px;
}

.clear-icon-btn:hover {
  color: #475569;
}

.popover-filter-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 10px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  font-size: 11px;
}

.filter-field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.filter-field label {
  color: #64748b;
  font-weight: 500;
  white-space: nowrap;
}

.filter-input-date {
  padding: 4px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 10.5px;
  color: #0f172a;
  background: #ffffff;
  outline: none;
}

.filter-field.agent-field {
  flex: 1;
  min-width: 0;
}

.filter-input-text {
  width: 100%;
  min-width: 60px;
  padding: 4px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 11px;
  color: #0f172a;
  outline: none;
}

.btn-popover-filter {
  padding: 5px 8px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-popover-filter:hover {
  background: #1d4ed8;
}

.btn-popover-reset {
  padding: 5px 7px;
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}

.btn-popover-reset:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.popover-list-area {
  flex: 1;
  overflow-y: auto;
  min-height: 140px;
  max-height: 360px;
  background: #ffffff;
}

.popover-loading,
.popover-empty {
  padding: 32px 20px;
  text-align: center;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-icon {
  font-size: 28px;
  color: #cbd5e1;
}

.empty-main {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.popover-items-wrapper {
  display: flex;
  flex-direction: column;
}

.popover-item-card {
  padding: 11px 14px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.popover-item-card:hover {
  background: #f8fafc;
}

.item-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.item-date {
  font-size: 11.5px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 5px;
}

.item-date i {
  color: #64748b;
  font-size: 11px;
}

.item-agent {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.agent-avatar-img {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid #e2e8f0;
  flex-shrink: 0;
}

.agent-avatar-initials {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e0e7ff;
  color: #4338ca;
  font-size: 9.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-name-text {
  font-size: 11.5px;
  font-weight: 600;
  color: #334155;
}

.item-summary-row {
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
  word-break: break-word;
}

/* 2. DRAWER LATERAL ESTILO BLOCO DE NOTAS (SEM BORRÃO) */
.history-drawer-wrapper {
  position: fixed;
  inset: 0;
  z-index: 1450;
  pointer-events: none;
}

.history-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
  backdrop-filter: none;
  pointer-events: auto;
  cursor: default;
}

.history-drawer-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 440px;
  max-width: 92vw;
  background: #ffffff;
  z-index: 1455;
  box-shadow: -6px 0 32px rgba(15, 23, 42, 0.14);
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.chat-drawer-slide-enter-active,
.chat-drawer-slide-leave-active {
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-drawer-slide-enter-from,
.chat-drawer-slide-leave-to {
  transform: translateX(100%);
}

.drawer-header {
  padding: 12px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.drawer-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.btn-drawer-back {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-drawer-back:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.drawer-header-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.drawer-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.drawer-agent-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #e2e8f0;
}

.drawer-agent-avatar-initials {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e0e7ff;
  color: #4338ca;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-agent-name {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.drawer-submeta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #64748b;
}

.drawer-dept-tag {
  background: #e2e8f0;
  color: #334155;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 600;
}

.btn-drawer-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-drawer-close:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.drawer-search-bar {
  padding: 8px 14px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
}

.drawer-search-input {
  width: 100%;
  padding: 6px 30px 6px 30px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 12px;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
}

.drawer-search-input:focus {
  border-color: #2563eb;
  background: #ffffff;
}

.search-count-tag {
  position: absolute;
  right: 26px;
  font-size: 10px;
  font-weight: 600;
  color: #2563eb;
  background: #dbeafe;
  padding: 2px 6px;
  border-radius: 8px;
}

.drawer-chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.drawer-loading,
.drawer-empty {
  margin: auto;
  text-align: center;
  color: #64748b;
  font-size: 12px;
}

.drawer-messages-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bubble-row {
  display: flex;
  width: 100%;
}

.bubble-row.bubble-client {
  justify-content: flex-start;
}

.bubble-row.bubble-agent {
  justify-content: flex-end;
}

.bubble-box {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bubble-client .bubble-box {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 2px;
}

.bubble-agent .bubble-box {
  background: #dbeafe;
  border: 1px solid #bfdbfe;
  border-bottom-right-radius: 2px;
}

.bubble-row.bubble-highlight .bubble-box {
  outline: 2px solid #2563eb;
  box-shadow: 0 0 10px rgba(37, 99, 235, 0.25);
}

.bubble-sender-label {
  font-size: 10.5px;
  font-weight: 700;
  color: #475569;
}

.bubble-client .bubble-sender-label {
  color: #2563eb;
}

.bubble-media-box {
  margin: 4px 0;
}

.bubble-img {
  max-width: 100%;
  max-height: 200px;
  border-radius: 6px;
  object-fit: cover;
}

.bubble-audio-player {
  max-width: 100%;
  height: 32px;
}

.bubble-file-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #2563eb;
  text-decoration: underline;
  font-size: 11px;
}

.bubble-message-text {
  margin: 0;
  font-size: 12.5px;
  color: #0f172a;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble-time-label {
  align-self: flex-end;
  font-size: 9.5px;
  color: #64748b;
  margin-top: 2px;
}

.drawer-footer {
  padding: 8px 14px;
  background: #f1f5f9;
  border-top: 1px solid #e2e8f0;
  text-align: center;
  color: #64748b;
  font-size: 11px;
}
</style>
