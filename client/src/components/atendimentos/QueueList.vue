<template>
  <div class="queue-column">
    <!-- 1. Header da Fila (Estilo Imagem de Referência) -->
    <div class="queue-header-row">
      <div class="queue-header-left">
        <h2 class="queue-title-bold">Fila de Atendimento</h2>
        <span class="queue-pill-badge">{{ waitingCount ?? totalVisibleCount ?? 0 }}</span>
      </div>
      <div class="queue-header-right">
        <button
          type="button"
          class="queue-filter-btn"
          :class="{ 'has-filter': hasActiveFilters, 'is-open': showFilterPopover }"
          title="Filtros e ordenação"
          @click.stop="toggleFilterPopover"
        >
          <span class="queue-icon-box"><i class="ri-equalizer-line"></i></span>
          <span v-if="hasActiveFilters" class="filter-badge-dot" title="Filtros ativos"></span>
        </button>

        <!-- Popover de Filtros da Fila -->
        <Transition name="filter-fade-slide">
          <div v-if="showFilterPopover" ref="filterPopoverRef" class="queue-filter-popover" @click.stop>
            <div class="filter-popover-header">
              <div class="filter-header-title">
                <span class="filter-title-icon"><i class="ri-filter-3-line"></i></span>
                <span>Filtros da Fila</span>
              </div>
              <button type="button" class="filter-close-btn" @click="showFilterPopover = false" title="Fechar filtros">
                <i class="ri-close-line"></i>
              </button>
            </div>

            <div class="filter-popover-body">
              <!-- Departamento -->
              <div class="filter-group">
                <label class="filter-label">Departamento</label>
                <div class="filter-select-wrapper">
                  <select v-model="selectedDepartment" class="filter-select">
                    <option value="">Todos os departamentos</option>
                    <option v-for="dept in departmentsList" :key="dept.id" :value="dept.name">
                      {{ dept.name }}
                    </option>
                  </select>
                  <span class="select-chevron"><i class="ri-arrow-down-s-line"></i></span>
                </div>
              </div>

              <!-- Ordenação -->
              <div class="filter-group">
                <label class="filter-label">Ordenar por</label>
                <div class="filter-select-wrapper">
                  <select v-model="sortOrder" class="filter-select">
                    <option value="recent">Mais recentes primeiro</option>
                    <option value="oldest">Mais antigos primeiro</option>
                    <option value="unread">Com mensagens não lidas</option>
                    <option value="name">Nome do cliente (A-Z)</option>
                  </select>
                  <span class="select-chevron"><i class="ri-arrow-down-s-line"></i></span>
                </div>
              </div>

              <!-- Tipo de Contato / Checkboxes -->
              <div class="filter-group">
                <label class="filter-label">Tipo de Contato</label>
                <div class="filter-checkbox-list">
                  <label class="filter-checkbox-label">
                    <input
                      type="checkbox"
                      v-model="filterOnlyClients"
                      @change="onToggleClientsFilter"
                    />
                    <span>Apenas clientes</span>
                  </label>
                  <label class="filter-checkbox-label">
                    <input
                      type="checkbox"
                      v-model="filterOnlyEmployee"
                      @change="onToggleEmployeeFilter"
                    />
                    <span>Apenas funcionários</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="filter-popover-footer">
              <button
                v-if="hasActiveFilters"
                type="button"
                class="filter-reset-btn"
                @click="resetFilters"
              >
                Limpar
              </button>
              <button
                type="button"
                class="filter-apply-btn"
                @click="showFilterPopover = false"
              >
                Concluir
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- 2. Abas de Status da Fila (Aguardando X  Grupos Y  Em atend. Z) -->
    <div class="queue-status-tabs-row">
      <button
        type="button"
        class="queue-status-tab"
        :class="{ active: currentTab === 'aguardando' }"
        @click="currentTab = 'aguardando'"
      >
        <span>Aguardando</span>
        <span class="tab-counter">{{ waitingCount }}</span>
      </button>

      <button
        type="button"
        class="queue-status-tab"
        :class="{ active: currentTab === 'grupos' }"
        @click="currentTab = 'grupos'"
      >
        <span>Grupos</span>
        <span class="tab-counter">{{ groupCount }}</span>
      </button>

      <button
        type="button"
        class="queue-status-tab"
        :class="{ active: currentTab === 'em_atendimento' }"
        @click="currentTab = 'em_atendimento'"
      >
        <span>Em atend.</span>
        <span class="tab-counter">{{ inProgressCount }}</span>
      </button>
    </div>

    <!-- 3. Campo de Busca (Buscar atendimento...) -->
    <div class="queue-search-row">
      <div class="queue-search-box">
        <span class="search-icon-box"><i class="ri-search-line"></i></span>
        <input
          v-model="searchTerm"
          type="text"
          placeholder="Buscar atendimento..."
        />
        <button
          v-if="searchTerm"
          type="button"
          class="clear-input-btn"
          @click="searchTerm = ''"
        >
          <span class="clear-icon-box"><i class="ri-close-line"></i></span>
        </button>
      </div>
    </div>

    <!-- 4. Lista de Atendimentos (Scrollable) -->
    <div class="queue-list-container">
      <div v-if="filteredTickets.length === 0" class="queue-empty-message">
        <span class="empty-icon-box"><i class="ri-folder-open-line"></i></span>
        <span>Nenhum atendimento nesta fila</span>
      </div>

      <QueueItem
        v-for="ticket in filteredTickets"
        :key="ticket.id"
        :ticket="ticket"
        @select="onTicketClick"
      />
    </div>

    <!-- Modal Nova Conversa (acionado pelo Topbar ou atalhos) -->
    <NewConversationModal
      v-if="isNewConversationOpen"
      @close="closeNewConversation"
      @started="onTicketClick"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useTicketStore } from '@/stores/tickets.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import QueueItem from '@/components/atendimentos/QueueItem.vue'
import NewConversationModal from '@/components/atendimentos/NewConversationModal.vue'

const emit = defineEmits(['ticket-selected'])

const ticketStore = useTicketStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const ui = useUiStore()
const currentTab = computed({
  get: () => ticketStore.activeQueueTab,
  set: (val) => ticketStore.setQueueTab(val)
})
const searchTerm = ref('')
const isRefreshing = ref(false)
const localShowNewConversation = ref(false)

// Estados de Filtros e Ordenação
const showFilterPopover = ref(false)
const filterPopoverRef = ref(null)
const selectedDepartment = ref('')
const sortOrder = ref('recent')
const filterOnlyClients = ref(false)
const filterOnlyEmployee = ref(false)

const departmentsList = computed(() => {
  return settingsStore.departments || []
})

const hasActiveFilters = computed(() => {
  return !!selectedDepartment.value || sortOrder.value !== 'recent' || filterOnlyClients.value || filterOnlyEmployee.value
})

function toggleFilterPopover() {
  showFilterPopover.value = !showFilterPopover.value
}

function onToggleClientsFilter() {
  if (filterOnlyClients.value) {
    filterOnlyEmployee.value = false
  }
}

function onToggleEmployeeFilter() {
  if (filterOnlyEmployee.value) {
    filterOnlyClients.value = false
  }
}

function resetFilters() {
  selectedDepartment.value = ''
  sortOrder.value = 'recent'
  filterOnlyClients.value = false
  filterOnlyEmployee.value = false
}

function onDocumentClick(e) {
  if (showFilterPopover.value && filterPopoverRef.value && !filterPopoverRef.value.contains(e.target)) {
    showFilterPopover.value = false
  }
}

function onDocumentKeydown(e) {
  if (e.key === 'Escape' && showFilterPopover.value) {
    showFilterPopover.value = false
  }
}

const isNewConversationOpen = computed(() => {
  return ui.isModalOpen('new_conversation') || localShowNewConversation.value
})

function closeNewConversation() {
  ui.closeModal('new_conversation')
  localShowNewConversation.value = false
}

onMounted(() => {
  if (settingsStore.departments.length === 0) {
    settingsStore.fetchDepartments()
  }
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
})

async function refreshQueue() {
  isRefreshing.value = true
  try {
    await ticketStore.fetchQueue()
  } finally {
    setTimeout(() => { isRefreshing.value = false }, 400)
  }
}

const totalVisibleCount = computed(() => {
  return (ticketStore.visibleTickets || []).filter(t => t.status !== 'finalizado').length
})

const waitingCount = computed(() => {
  return (ticketStore.waitingTickets || []).length
})

const inProgressCount = computed(() => {
  return (ticketStore.inProgressTickets || []).length
})

const groupCount = computed(() => {
  return (ticketStore.groupTickets || []).length
})

function onTicketClick(ticketId) {
  emit('ticket-selected', ticketId)
}

function parseTicketTime(ticket) {
  const ts = ticket.updated_at || ticket.created_at || ticket.time
  if (!ts) return 0
  const d = new Date(ts)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

const filteredTickets = computed(() => {
  let list = (ticketStore.visibleTickets || []).filter(t => t.status !== 'finalizado')

  // Aba selecionada
  if (currentTab.value === 'aguardando') {
    list = list.filter(t => !t.is_group && (t.status === 'aguardando' || !t.assumed))
  } else if (currentTab.value === 'em_atendimento') {
    list = list.filter(t => !t.is_group && (t.assumed || t.status === 'em_atendimento' || t.status === 'chatbot'))
  } else if (currentTab.value === 'grupos') {
    list = list.filter(t => t.status === 'grupo' || t.is_group)
  }

  // Busca textual
  if (searchTerm.value.trim()) {
    const term = searchTerm.value.trim().toLowerCase()
    list = list.filter(t => {
      const name = (t.clientName || t.client_name || '').toLowerCase()
      const phone = (t.phone || '').toLowerCase()
      const prev = (t.preview || '').toLowerCase()
      return name.includes(term) || phone.includes(term) || prev.includes(term)
    })
  }

  // Filtro por departamento
  if (selectedDepartment.value) {
    const depTerm = selectedDepartment.value.toLowerCase().trim()
    list = list.filter(t => {
      const ticketDept = (t.department || t.departments?.name || t.department_name || t.deptInitial || '').toLowerCase()
      return ticketDept.includes(depTerm)
    })
  }

  // Tipo de Contato
  if (filterOnlyClients.value) {
    list = list.filter(t => !t.is_employee)
  }

  if (filterOnlyEmployee.value) {
    list = list.filter(t => !!t.is_employee)
  }

  // Ordenação
  list = [...list].sort((a, b) => {
    if (sortOrder.value === 'unread') {
      const unreadA = (a.unreadCount || a.unread_count || 0) > 0 ? 1 : 0
      const unreadB = (b.unreadCount || b.unread_count || 0) > 0 ? 1 : 0
      if (unreadA !== unreadB) return unreadB - unreadA
      return parseTicketTime(b) - parseTicketTime(a)
    }

    if (sortOrder.value === 'oldest') {
      return parseTicketTime(a) - parseTicketTime(b)
    }

    if (sortOrder.value === 'name') {
      const nameA = (a.clientName || a.client_name || '').toLowerCase()
      const nameB = (b.clientName || b.client_name || '').toLowerCase()
      return nameA.localeCompare(nameB)
    }

    // Padrão: 'recent' (mais recentes primeiro, com não lidas priorizadas)
    const unreadA = (a.unreadCount || a.unread_count || 0) > 0 ? 1 : 0
    const unreadB = (b.unreadCount || b.unread_count || 0) > 0 ? 1 : 0
    if (unreadA !== unreadB) return unreadB - unreadA

    const timeA = parseTicketTime(a)
    const timeB = parseTicketTime(b)
    return timeB - timeA
  })

  return list
})
</script>

<style scoped>
/* ─── Coluna da Fila (Estilo da Imagem de Referência) ─────────────────────── */
.queue-column {
  width: 290px;
  min-width: 270px;
  max-width: 300px;
  flex-shrink: 0;
  background-color: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}

/* 1. Header */
.queue-header-row {
  height: 52px;
  min-height: 52px;
  padding: 14px 12px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}

.queue-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.queue-title-bold {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  letter-spacing: -0.01em;
}

.queue-pill-badge {
  background: #d1fae5;
  color: #059669;
  border: none;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  line-height: 1.3;
}

.queue-header-right {
  display: flex;
  align-items: center;
  position: relative;
}

.queue-filter-btn {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s ease;
}

.queue-filter-btn:hover {
  background: #f8fafc;
  color: #0f172a;
}

.queue-filter-btn.is-open,
.queue-filter-btn.has-filter {
  background: #ecfdf5;
  color: #059669;
}

.filter-badge-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: #10b981;
  border: 1.5px solid #ffffff;
}

/* Popover de Filtros */
.queue-filter-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 290px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.06);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: filterPop 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.filter-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
  background: #fafafa;
}

.filter-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.filter-title-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #059669;
  font-size: 14px;
}

.filter-close-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.filter-close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.filter-popover-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 11.5px;
  font-weight: 600;
  color: #475569;
}

.filter-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.filter-select {
  width: 100%;
  height: 34px;
  padding: 0 28px 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  font-size: 12px;
  color: #1e293b;
  appearance: none;
  outline: none;
  transition: border-color 0.15s ease;
}

.filter-select:focus {
  border-color: #059669;
  box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.1);
}

.select-chevron {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: #94a3b8;
  display: flex;
  align-items: center;
  font-size: 14px;
}

.filter-checkbox-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f8fafc;
  padding: 8px 10px;
  border-radius: 8px;
}

.filter-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  user-select: none;
}

.filter-checkbox-label input[type="checkbox"] {
  accent-color: #059669;
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.filter-popover-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #f1f5f9;
  background: #fafafa;
}

.filter-reset-btn {
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: #ef4444;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.filter-reset-btn:hover {
  background: #fee2e2;
}

.filter-apply-btn {
  border: none;
  background: #059669;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 14px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.filter-apply-btn:hover {
  background: #047857;
}

/* Transição do popover */
.filter-fade-slide-enter-active,
.filter-fade-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.filter-fade-slide-enter-from,
.filter-fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 2. Trilho de Abas em Cápsula (Aguardando 30  Grupos 17  Em atend. 1) */
.queue-status-tabs-row {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 3px;
  margin: 0 12px 10px;
  gap: 2px;
}

.queue-status-tab {
  flex: 1;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.queue-status-tab:hover {
  color: #0f172a;
}

.queue-status-tab.active {
  background: #ffffff !important;
  color: #0f172a !important;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-counter {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.queue-status-tab.active .tab-counter {
  color: #94a3b8;
  font-weight: 500;
}

/* 3. Campo de Busca */
.queue-search-row {
  padding: 0 12px 10px;
}

.queue-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 12px;
  transition: all 0.15s ease;
}

.queue-search-box:focus-within {
  background: #ffffff;
  border-color: #059669;
  box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.1);
}

.search-mag-icon {
  font-size: 13px;
  color: #94a3b8;
  flex-shrink: 0;
}

.queue-search-box input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #0f172a;
  outline: none;
}

.queue-search-box input::placeholder {
  color: #94a3b8;
}

.clear-input-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  font-size: 11px;
}

/* 4. Lista de Itens */
.queue-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.queue-icon-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.queue-icon-box i {
  font-size: 15px;
  line-height: 1;
}

.search-icon-box {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  flex-shrink: 0;
}

.search-icon-box i {
  font-size: 14px;
  line-height: 1;
}

.clear-icon-box {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-icon-box i {
  font-size: 13px;
  line-height: 1;
}

.empty-icon-box {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon-box i {
  font-size: 28px;
  color: #cbd5e1;
  line-height: 1;
}

.queue-empty-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 16px;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 768px) {
  .queue-column {
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
    border-right: none !important;
  }
  .queue-list-container {
    padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
  }
}
</style>
