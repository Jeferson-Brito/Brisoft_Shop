<template>
  <div class="atendimentos-view-layout">
    <!-- VISUALIZAÇÃO 1: Fila e Chat do WhatsApp -->
    <div
      v-show="ui.activeChatModuleTab === 'atendimentos'"
      class="atendimentos-main-grid"
      :class="{
        'details-open': isDetailsOpen && !!ticketStore.activeTicket,
        'mobile-chat-active': mobilePanel === 'chat'
      }"
    >
      <!-- Coluna 1: Fila de Atendimentos (Aguardando / Em atendimento) -->
      <QueueList
        @ticket-selected="onTicketSelected"
      />

      <!-- Coluna 2: Chat em Tempo Real -->
      <ChatPanel
        :ticket="ticketStore.activeTicket"
        :performance="performance"
        :is-details-open="isDetailsOpen && !!ticketStore.activeTicket"
        @toggle-details="isDetailsOpen = !isDetailsOpen"
        @go-back="onGoBack"
      />

      <!-- Coluna 3: Detalhes do Atendimento & Contato -->
      <ContactDrawer
        v-if="isDetailsOpen && ticketStore.activeTicket && !ticketStore.activeTicket.is_group"
        :ticket="ticketStore.activeTicket"
        @close="isDetailsOpen = false"
      />

      <!-- Gaveta Lateral Rápida do Chat Interno (se acionada no modo atendimento) -->
      <InternalChatDrawer
        v-if="ui.isInternalChatOpen"
        @close="ui.closeInternalChat"
      />
    </div>

    <!-- VISUALIZAÇÃO 2: Chat Interno Completo da Equipe (Duas Colunas) -->
    <div
      v-show="ui.activeChatModuleTab === 'conversas_internas'"
      class="internal-chat-full-container"
    >
      <InternalChatView />
    </div>

    <!-- Modal Nova Conversa -->
    <NewConversationModal
      v-if="showNewConversation"
      @close="showNewConversation = false"
    />

    <!-- Modal de Encerramento -->
    <ModalEncerrar
      v-if="ui.isModalOpen('encerrar')"
      :ticket="ticketStore.activeTicket"
      @close="ui.closeModal('encerrar')"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { useTicketStore } from '@/stores/tickets.store'
import { useUiStore }     from '@/stores/ui.store'
import { useAuthStore }   from '@/stores/auth.store'
import { ticketsApi }     from '@/api/tickets.api'
import QueueList          from '@/components/atendimentos/QueueList.vue'
import ChatPanel          from '@/components/atendimentos/ChatPanel.vue'
import ContactDrawer      from '@/components/atendimentos/ContactDrawer.vue'
import ModalEncerrar      from '@/components/modals/ModalEncerrar.vue'
import NewConversationModal from '@/components/atendimentos/NewConversationModal.vue'
import InternalChatDrawer from '@/components/chat-interno/InternalChatDrawer.vue'
import InternalChatView   from '@/components/chat-interno/InternalChatView.vue'

import { useNotepadStore } from '@/stores/notepad.store'

const route       = useRoute()
const ticketStore = useTicketStore()
const ui          = useUiStore()
const auth        = useAuthStore()
const notepadStore = useNotepadStore()

const mobilePanel          = ref('queue')
const isDetailsOpen        = ref(false)
const showNewConversation  = ref(false)
const performance          = ref(null)
let refreshTimer           = null
let queueRefreshTimer      = null
let performanceRequestId   = 0
let liveSyncRunning        = false
let isComponentMounted     = false

function onTicketSelected() {
  mobilePanel.value = 'chat'
  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    if (!window.history.state?.mobileChat) {
      window.history.pushState({ ...window.history.state, mobileChat: true }, '')
    }
  }
}

function onGoBack() {
  if (ticketStore.activeTicket) {
    const tab = ticketStore.getTicketQueueTab(ticketStore.activeTicket)
    if (tab) ticketStore.setQueueTab(tab)
  }
  if (typeof window !== 'undefined' && window.history.state?.mobileChat) {
    window.history.back()
  } else {
    mobilePanel.value = 'queue'
    ticketStore.minimizeActiveTicket({ clearPersisted: true })
  }
}

function handlePopState() {
  if (isDetailsOpen.value) {
    isDetailsOpen.value = false
    return
  }
  if (mobilePanel.value === 'chat') {
    if (ticketStore.activeTicket) {
      const tab = ticketStore.getTicketQueueTab(ticketStore.activeTicket)
      if (tab) ticketStore.setQueueTab(tab)
    }
    mobilePanel.value = 'queue'
    ticketStore.minimizeActiveTicket({ clearPersisted: true })
  }
}

function minimizeActiveChat(event) {
  if (event.key !== 'Escape' || !ticketStore.activeTicket) return
  if (event.defaultPrevented) return
  if (notepadStore.isOpen) return
  if (document.querySelector('.modal-overlay.active')) return
  const tab = ticketStore.getTicketQueueTab(ticketStore.activeTicket)
  if (tab) ticketStore.setQueueTab(tab)
  ticketStore.minimizeActiveTicket({ clearPersisted: true })
  isDetailsOpen.value = false
  mobilePanel.value = 'queue'
}

async function fetchPerformance() {
  const requestId = ++performanceRequestId
  try {
    // Analistas e administradores que também atendem veem seus próprios
    // números. Supervisores mantêm a visão consolidada dos setores vinculados.
    const params = auth.user?.id && !auth.isSupervisor ? { agentId: auth.user.id } : {}
    if (!auth.isAdmin && auth.departmentId) {
      params.departmentId = auth.departmentId
    }
    const { data } = await ticketsApi.performance(params)
    if (requestId === performanceRequestId && data.success && data.performance) performance.value = data.performance
  } catch (_) {}
}

watch(() => ticketStore.queue.filter(ticket => !ticket.is_group).map(ticket => `${ticket.id}:${ticket.status}:${ticket.updated_at || ''}`).join('|'), () => {
  clearTimeout(queueRefreshTimer)
  queueRefreshTimer = setTimeout(fetchPerformance, 2500)
})

watch(() => ticketStore.kpiRevision, () => {
  clearTimeout(queueRefreshTimer)
  queueRefreshTimer = setTimeout(fetchPerformance, 2500)
})

async function syncLiveData() {
  if (liveSyncRunning || document.visibilityState !== 'visible') return
  liveSyncRunning = true
  try {
    await Promise.all([ticketStore.fetchQueue({ silent: true }), fetchPerformance()])
  } catch (_) {
  } finally {
    liveSyncRunning = false
  }
}

watch(mobilePanel, (val) => {
  ui.setMobileChatOpen(val === 'chat')
}, { immediate: true })

watch(() => ticketStore.activeTicket, (ticket) => {
  if (!ticket) mobilePanel.value = 'queue'
})

watch(isDetailsOpen, (open) => {
  if (open && typeof window !== 'undefined' && window.innerWidth <= 768) {
    if (!window.history.state?.mobileDetails) {
      window.history.pushState({ ...window.history.state, mobileDetails: true }, '')
    }
  }
})

onBeforeRouteLeave(() => {
  // Se havia um chat aberto, sincroniza a aba da fila com a categoria desse chat
  if (ticketStore.activeTicket) {
    const tab = ticketStore.getTicketQueueTab(ticketStore.activeTicket)
    if (tab) ticketStore.setQueueTab(tab)
  }
  // Minimiza o chat e limpa do sessionStorage para que ao voltar o chat esteja minimizado
  ticketStore.minimizeActiveTicket({ clearPersisted: true })
  isDetailsOpen.value = false
  mobilePanel.value = 'queue'
})

onMounted(async () => {
  isComponentMounted = true

  // Lê ticket que estava aberto antes de uma atualização da página (F5) ou passado por query param
  const persistedTicketId = typeof sessionStorage !== 'undefined'
    ? (sessionStorage.getItem('brisoft_shop_open_ticket_id') || null)
    : null

  const targetTicketId = route.query?.ticketId || persistedTicketId

  refreshTimer = setInterval(syncLiveData, 30000)
  document.addEventListener('visibilitychange', syncLiveData)
  document.addEventListener('keydown', minimizeActiveChat)
  window.addEventListener('popstate', handlePopState)

  // Carrega fila e indicadores
  await Promise.all([ticketStore.fetchQueue(), fetchPerformance()])

  if (!isComponentMounted) return

  // Se o usuário JÁ clicou em um ticket enquanto a fila carregava, NÃO minimize!
  if (ticketStore.activeTicketId) {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      mobilePanel.value = 'chat'
    }
    return
  }

  // Se for apenas atualização da página (F5) ou link direto, restaura o chat aberto
  if (targetTicketId) {
    const numericId = Number(targetTicketId) || targetTicketId
    const exists = ticketStore.visibleTickets.some(t => String(t.id) === String(numericId))
    if (exists) {
      await ticketStore.selectTicket(numericId)
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        mobilePanel.value = 'chat'
      }
    } else {
      ticketStore.minimizeActiveTicket({ clearPersisted: true })
      isDetailsOpen.value = false
      mobilePanel.value = 'queue'
    }
  } else {
    // Se não havia targetTicketId e o usuário não clicou em nada, garante que começa minimizado
    ticketStore.minimizeActiveTicket({ clearPersisted: true })
    isDetailsOpen.value = false
    mobilePanel.value = 'queue'
  }
})

onBeforeUnmount(() => {
  isComponentMounted = false
  if (ticketStore.activeTicket) {
    const tab = ticketStore.getTicketQueueTab(ticketStore.activeTicket)
    if (tab) ticketStore.setQueueTab(tab)
  }
  ticketStore.minimizeActiveTicket({ clearPersisted: true })
  isDetailsOpen.value = false
  mobilePanel.value = 'queue'
  clearInterval(refreshTimer)
  clearTimeout(queueRefreshTimer)
  document.removeEventListener('visibilitychange', syncLiveData)
  document.removeEventListener('keydown', minimizeActiveChat)
  window.removeEventListener('popstate', handlePopState)
  ui.setMobileChatOpen(false)
})
</script>

<style scoped>
.atendimentos-view-layout {
  position: relative;
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-app, #f8fafc);
}

.atendimentos-main-grid {
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.internal-chat-full-container {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 768px) {
  .atendimentos-main-grid {
    position: relative;
    width: 100%;
  }
  .atendimentos-main-grid.mobile-chat-active :deep(.queue-column) {
    display: none !important;
  }
  .atendimentos-main-grid:not(.mobile-chat-active) :deep(.chat-column) {
    display: none !important;
  }
  .atendimentos-main-grid.mobile-chat-active :deep(.chat-column) {
    display: flex !important;
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
  }
  .atendimentos-main-grid:not(.mobile-chat-active) :deep(.queue-column) {
    display: flex !important;
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
  }
  :deep(.contact-drawer) {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
    z-index: 2000 !important;
  }
}
</style>
