<template>
  <div class="table-view-layout" style="width:100%;">
    <!-- Barra Compacta de Ferramentas: Lupa + Pesquisa Pequena + Botão de Filtros -->
    <div class="history-toolbar">
      <div class="history-toolbar-actions">
        <!-- Botão Lupa & Caixa de Pesquisa Pequena -->
        <div class="history-search-wrapper" :class="{ open: isSearchOpen || filters.search }">
          <button
            type="button"
            class="history-tool-btn history-search-toggle"
            :class="{ active: isSearchOpen || filters.search }"
            title="Pesquisar conversas"
            @click="toggleSearch"
          >
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>

          <Transition name="search-expand">
            <div v-if="isSearchOpen || filters.search" class="history-compact-search">
              <input
                ref="searchInputRef"
                v-model="filters.search"
                type="text"
                class="history-search-input"
                placeholder="Buscar cliente, tel, protocolo..."
                @keydown.esc="onSearchEsc"
              />
              <button
                v-if="filters.search"
                type="button"
                class="history-search-clear"
                title="Limpar pesquisa"
                @click="clearSearch"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </Transition>
        </div>

        <!-- Botão de Filtros com Popover Suspenso -->
        <div class="history-filter-wrapper" ref="filterDropdownRef">
          <button
            type="button"
            class="history-tool-btn history-filter-btn"
            :class="{ active: showFilterPopover || hasActiveFilters }"
            title="Filtros de conversas"
            @click="showFilterPopover = !showFilterPopover"
          >
            <i class="fa-solid fa-sliders"></i>
            <span>Filtros</span>
            <span v-if="activeFilterCount > 0" class="history-filter-count">
              {{ activeFilterCount }}
            </span>
          </button>

          <!-- Painel Suspenso de Filtros -->
          <Transition name="popover-fade">
            <div v-if="showFilterPopover" class="history-filter-popover">
              <div class="popover-header">
                <span><i class="fa-solid fa-sliders"></i> Filtros de Conversas</span>
                <button type="button" class="popover-close-btn" @click="showFilterPopover = false">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div class="popover-content">
                <!-- Filtro: Departamento -->
                <div class="popover-field">
                  <label><i class="fa-solid fa-building"></i> Departamento</label>
                  <select v-model="filters.department" class="popover-select">
                    <option value="">Todos os Departamentos</option>
                    <option v-for="d in settingsStore.departments" :key="d.id" :value="d.name">
                      {{ d.name }}
                    </option>
                  </select>
                </div>

                <!-- Filtro: Atendente -->
                <div class="popover-field">
                  <label><i class="fa-solid fa-user-tie"></i> Atendente</label>
                  <select v-model="filters.agent" class="popover-select">
                    <option value="">Todos os Atendentes</option>
                    <option v-for="ag in uniqueAgents" :key="ag" :value="ag">
                      {{ ag }}
                    </option>
                  </select>
                </div>

                <!-- Filtro: Avaliação CSAT -->
                <div class="popover-field">
                  <label><i class="fa-solid fa-star"></i> Avaliação</label>
                  <select v-model="filters.rating" class="popover-select">
                    <option value="">Todas</option>
                    <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                    <option value="4">⭐⭐⭐⭐ (4)</option>
                    <option value="3">⭐⭐⭐ (3)</option>
                    <option value="2">⭐⭐ (2)</option>
                    <option value="1">⭐ (1)</option>
                    <option value="sem_avaliacao">Sem avaliação</option>
                  </select>
                </div>

                <!-- Filtros de Data -->
                <div class="popover-date-grid">
                  <div class="popover-field">
                    <label><i class="fa-regular fa-calendar"></i> De</label>
                    <input v-model="filters.dateFrom" type="date" class="popover-input" />
                  </div>
                  <div class="popover-field">
                    <label><i class="fa-regular fa-calendar-check"></i> Até</label>
                    <input v-model="filters.dateTo" type="date" class="popover-input" />
                  </div>
                </div>
              </div>

              <div class="popover-footer">
                <button
                  v-if="hasActiveFilters"
                  type="button"
                  class="popover-reset-btn"
                  @click="clearFilters"
                >
                  <i class="fa-solid fa-eraser"></i> Limpar filtros
                </button>
                <button
                  type="button"
                  class="popover-apply-btn"
                  @click="showFilterPopover = false"
                >
                  Concluído
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Chips dos filtros ativos para rápida visualização e remoção -->
        <div v-if="hasActiveChips" class="history-chips-row">
          <span v-if="filters.department" class="history-chip">
            Setor: <strong>{{ filters.department }}</strong>
            <i class="fa-solid fa-xmark" @click="filters.department = ''"></i>
          </span>
          <span v-if="filters.agent" class="history-chip">
            Atendente: <strong>{{ filters.agent }}</strong>
            <i class="fa-solid fa-xmark" @click="filters.agent = ''"></i>
          </span>
          <span v-if="filters.rating" class="history-chip">
            {{ filters.rating === 'sem_avaliacao' ? 'Sem avaliação' : `${filters.rating} ★` }}
            <i class="fa-solid fa-xmark" @click="filters.rating = ''"></i>
          </span>
          <span v-if="filters.dateFrom || filters.dateTo" class="history-chip">
            {{ filters.dateFrom ? formatShortDate(filters.dateFrom) : 'Início' }} - {{ filters.dateTo ? formatShortDate(filters.dateTo) : 'Hoje' }}
            <i class="fa-solid fa-xmark" @click="filters.dateFrom = ''; filters.dateTo = ''"></i>
          </span>
          <button type="button" class="history-chip-clear" @click="clearFilters" title="Limpar todos os filtros">
            Limpar tudo
          </button>
        </div>
      </div>
    </div>

    <!-- Tabela Full-Width do Histórico -->
    <div class="table-content-area" style="flex:1;min-height:0;">
      <div class="table-card-container">
        <div class="table-scroll-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Protocolo</th>
                <th>Departamento</th>
                <th>Atendente</th>
                <th>Encerrado em</th>
                <th>Avaliação</th>
                <th>Status</th>
                <th style="text-align:right;">Ação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading" v-for="i in 8" :key="'skel-' + i" class="skeleton-row">
                <td><div class="sk-cell"><div class="sk-avatar"></div><div class="sk-lines"><div class="sk-line sk-w70"></div><div class="sk-line sk-w50"></div></div></div></td>
                <td><div class="sk-line sk-w40"></div></td>
                <td><div class="sk-line sk-w60"></div></td>
                <td><div class="sk-line sk-w55"></div></td>
                <td><div class="sk-line sk-w45"></div></td>
                <td><div class="sk-line sk-w35"></div></td>
                <td><div class="sk-line sk-w30"></div></td>
                <td><div class="sk-line sk-w25" style="margin-left:auto"></div></td>
              </tr>
              <tr v-else-if="paginatedList.length === 0">
                <td colspan="8" style="text-align:center;padding:36px 12px;color:#94a3b8;font-size:13px;">
                  <i class="fa-solid fa-magnifying-glass" style="font-size:20px;display:block;margin-bottom:8px;"></i>
                  Cliente não encontrado ou funcionário não encontrado!
                </td>
              </tr>
              <tr
                v-for="item in paginatedList"
                :key="item.id"
                style="cursor:pointer;"
                @click="openDetailsModal(item)"
              >
                <!-- Cliente -->
                <td>
                  <div class="contact-cell">
                    <div
                      class="initial-avatar"
                      style="width:34px;height:34px;font-size:12px;flex-shrink:0;"
                      :style="{ background: item.avatarColor || '#059669' }"
                    >
                      <img v-if="item.avatar_url" :src="item.avatar_url" alt="Foto do cliente" referrerpolicy="no-referrer" class="history-avatar-image" />
                      <span v-else>{{ item.initials || 'CL' }}</span>
                    </div>
                    <div class="contact-cell-meta">
                      <span class="contact-cell-name">
                        {{ normalizePersonName(item.clientName || item.client_name || 'Cliente') }}
                      </span>
                      <span class="contact-cell-sub">
                        <i class="fa-brands fa-whatsapp" style="color:#22c55e;margin-right:2px;"></i>
                        {{ formatPhone(item.phone) }}
                      </span>
                    </div>
                  </div>
                </td>

                <!-- Protocolo -->
                <td>
                  <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11.5px;color:#334155;">
                    #{{ shortProtocol(item.protocolo || item.id) }}
                  </code>
                </td>

                <!-- Departamento -->
                <td>
                  <span
                    class="badge"
                    :style="{
                      background: `${getDeptColor(item.deptFinal || item.department)}18`,
                      color: getDeptColor(item.deptFinal || item.department),
                      border: `1px solid ${getDeptColor(item.deptFinal || item.department)}40`
                    }"
                  >
                    {{ item.deptFinal || item.department || 'Geral' }}
                  </span>
                </td>

                <!-- Atendente -->
                <td style="font-weight:500;color:#334155;">
                  <i class="fa-solid fa-user" style="color:#94a3b8;font-size:10.5px;margin-right:4px;"></i>
                  {{ item.agent || item.encerrado_por || 'Sistema' }}
                </td>

                <!-- Data / Hora -->
                <td style="font-size:12px;color:#64748b;">
                  {{ formatDateTime(item.closed_at || item.updated_at || item.time) }}
                </td>

                <!-- Avaliação -->
                <td>
                  <div v-if="item.rating" style="display:inline-flex;align-items:center;gap:4px;background:#fefce8;border:1px solid #fef08a;padding:2px 8px;border-radius:12px;color:#ca8a04;font-weight:700;font-size:11.5px;">
                    <i class="fa-solid fa-star" style="color:#eab308;font-size:11px;"></i>
                    {{ item.rating }} {{ item.rating === 1 ? 'estrela' : 'estrelas' }}
                  </div>
                  <span v-else style="font-size:11px;color:#94a3b8;">
                    Não avaliado
                  </span>
                </td>

                <!-- Status -->
                <td>
                  <span class="badge badge-finalizado">Finalizado</span>
                </td>

                <!-- Ação -->
                <td style="text-align:right;">
                  <button
                    type="button"
                    class="btn-secondary"
                    style="font-size:11.5px;padding:4px 10px;gap:6px;"
                    title="Ver conversa completa"
                    @click.stop="openDetailsModal(item)"
                  >
                    <i class="fa-regular fa-comment-dots"></i> Ver Chat
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginação -->
        <div class="table-pagination-footer">
          <span>
            Mostrando <strong>{{ paginationInfo.from }}</strong> - <strong>{{ paginationInfo.to }}</strong> de <strong>{{ filteredHistory.length }}</strong> atendimentos
          </span>

          <div style="display:flex;align-items:center;gap:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span>Itens por página:</span>
              <select v-model.number="itemsPerPage" class="form-control" style="padding:2px 6px;font-size:11px;height:26px;">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </div>

            <div class="pagination-controls">
              <button
                class="page-btn"
                :disabled="currentPage <= 1"
                @click="currentPage--"
              >
                <i class="fa-solid fa-chevron-left" style="font-size:10px;"></i>
              </button>

              <button
                v-for="p in totalPages"
                :key="p"
                class="page-btn"
                :class="{ active: p === currentPage }"
                @click="currentPage = p"
              >
                {{ p }}
              </button>

              <button
                class="page-btn"
                :disabled="currentPage >= totalPages"
                @click="currentPage++"
              >
                <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DETALHADO DO ATENDIMENTO (POPUP) -->
    <Teleport to="body">
      <div
        v-if="selectedTicketModal"
        class="modal-overlay active history-detail-overlay"
        @click.self="selectedTicketModal = null"
      >
        <div class="modal-container history-detail-modal" role="dialog" aria-modal="true" aria-label="Detalhes da conversa">
          <!-- Modal Header -->
          <div class="modal-header history-detail-header">
            <div class="history-customer-summary">
              <div
                class="initial-avatar history-detail-avatar"
                :style="{ background: selectedTicketModal.avatarColor || '#059669' }"
              >
                <img v-if="selectedTicketModal.avatar_url" :src="selectedTicketModal.avatar_url" alt="Foto do cliente" referrerpolicy="no-referrer" class="history-avatar-image" />
                <span v-else>{{ selectedTicketModal.initials || 'CL' }}</span>
              </div>
              <div class="history-customer-copy">
                <div class="history-customer-name-row">
                  <span class="modal-title history-customer-name">
                  {{ normalizePersonName(selectedTicketModal.clientName || selectedTicketModal.client_name || 'Cliente') }}
                  </span>
                  <span class="history-channel-pill"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>
                </div>
                <div class="history-customer-meta">
                  <span><i class="fa-solid fa-phone"></i>{{ formatPhone(selectedTicketModal.phone) }}</span>
                  <span class="history-meta-separator"></span>
                  <span><i class="fa-solid fa-hashtag"></i>{{ selectedTicketModal.protocolo || selectedTicketModal.id }}</span>
                </div>
              </div>
            </div>

            <button type="button" class="history-modal-close" aria-label="Fechar detalhes da conversa" @click="selectedTicketModal = null">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Modal Body em 2 Colunas -->
          <div class="history-detail-body">
            <!-- Coluna 1: Chat de Mensagens -->
            <div class="history-conversation-pane">
              <div class="history-conversation-toolbar">
                <div>
                  <span class="history-toolbar-icon"><i class="fa-regular fa-comments"></i></span>
                  <div><strong>Conversa completa</strong><small>Histórico de mensagens deste atendimento</small></div>
                </div>
                <span class="history-message-count">
                  {{ (selectedTicketModal.messages || []).filter(msg => !msg?.text?.startsWith?.('[Chatbot][State]')).length }} mensagens
                </span>
              </div>

              <div class="chat-messages-container history-conversation-messages">
                <div v-if="detailLoading" class="history-conversation-state">
                  <span class="history-state-icon"><i class="fa-solid fa-spinner fa-spin"></i></span>
                  <strong>Carregando conversa</strong>
                  <small>Buscando todas as mensagens deste atendimento.</small>
                </div>
                <div v-else-if="!selectedTicketModal.messages || selectedTicketModal.messages.length === 0" class="history-conversation-state">
                  <span class="history-state-icon empty"><i class="fa-regular fa-message"></i></span>
                  <strong>Nenhuma mensagem registrada</strong>
                  <small>Este atendimento não possui mensagens disponíveis no histórico.</small>
                </div>
                <template v-else>
                  <div class="chat-date-pill history-start-pill"><i class="fa-regular fa-calendar"></i> Início do atendimento</div>
                  <ChatBubble
                    v-for="(m, idx) in (selectedTicketModal.messages || []).filter(msg => !msg?.text?.startsWith?.('[Chatbot][State]'))"
                    :key="idx"
                    :msg="m"
                    :initials="selectedTicketModal.initials"
                    :avatar-color="selectedTicketModal.avatarColor"
                    :avatar-url="selectedTicketModal.avatar_url"
                  />
                </template>
              </div>
            </div>

            <!-- Coluna 2: Informações e Metadados do Atendimento -->
            <aside class="history-detail-sidebar">
              <!-- Card de Avaliação do Cliente -->
              <div
                class="history-rating-card"
                :class="{ rated: selectedTicketModal.rating }"
              >
                <div class="history-card-eyebrow"><i class="fa-solid fa-star"></i> Avaliação do atendimento</div>
                <div v-if="selectedTicketModal.rating" class="history-rating-result">
                  <div class="history-stars" :aria-label="`${selectedTicketModal.rating} de 5 estrelas`">
                    <i v-for="star in 5" :key="star" class="fa-solid fa-star" :class="{ active: star <= selectedTicketModal.rating }"></i>
                  </div>
                  <strong>{{ selectedTicketModal.rating }} de 5</strong>
                  <small>Avaliação enviada pelo cliente via WhatsApp</small>
                </div>
                <div v-else class="history-rating-pending">
                  <span><i class="fa-regular fa-clock"></i></span>
                  <div><strong>Aguardando avaliação</strong><small>A pesquisa foi enviada, mas ainda não recebeu uma resposta.</small></div>
                </div>
              </div>

              <!-- Metadados da Conversa -->
              <section class="history-info-card">
                <div class="history-info-card-header">
                  <span class="history-info-card-icon"><i class="fa-solid fa-headset"></i></span>
                  <div><strong>Detalhes do atendimento</strong><small>Responsáveis e período da conversa</small></div>
                </div>
                <div class="history-detail-list">
                  <div class="history-detail-row">
                    <span class="history-detail-row-icon"><i class="fa-solid fa-user-tie"></i></span>
                    <div><small>Atendente responsável</small><strong>{{ selectedTicketModal.agent || selectedTicketModal.encerrado_por || 'Sistema' }}</strong></div>
                  </div>
                  <div class="history-detail-row">
                    <span class="history-detail-row-icon"><i class="fa-solid fa-building"></i></span>
                    <div><small>Departamento</small><strong>{{ selectedTicketModal.deptFinal || selectedTicketModal.department || 'Geral' }}</strong></div>
                  </div>
                  <div class="history-detail-row">
                    <span class="history-detail-row-icon"><i class="fa-regular fa-clock"></i></span>
                    <div><small>Início do atendimento</small><strong>{{ formatDateTime(selectedTicketModal.created_at || selectedTicketModal.time) }}</strong></div>
                  </div>
                  <div class="history-detail-row success">
                    <span class="history-detail-row-icon"><i class="fa-solid fa-check"></i></span>
                    <div><small>Encerramento</small><strong>{{ formatDateTime(selectedTicketModal.closed_at || selectedTicketModal.updated_at) }}</strong></div>
                  </div>
                </div>
              </section>

              <!-- Dados do Cliente -->
              <section class="history-info-card">
                <div class="history-info-card-header">
                  <span class="history-info-card-icon customer"><i class="fa-regular fa-address-card"></i></span>
                  <div><strong>Dados do cliente</strong><small>Informações salvas no contato</small></div>
                  <button class="history-edit-contact" type="button" @click="showEditContactModal = true">
                    <i class="fa-solid fa-pen"></i><span>Editar</span>
                  </button>
                </div>
                <div class="history-detail-list">
                  <div class="history-detail-row">
                    <span class="history-detail-row-icon"><i class="fa-solid fa-user"></i></span>
                    <div><small>Nome</small><strong>{{ normalizePersonName(selectedTicketModal.clientName || selectedTicketModal.client_name) }}</strong></div>
                  </div>
                  <div class="history-detail-row whatsapp">
                    <span class="history-detail-row-icon"><i class="fa-brands fa-whatsapp"></i></span>
                    <div><small>Telefone / WhatsApp</small><strong>{{ formatPhone(selectedTicketModal.phone) }}</strong></div>
                  </div>
                  <div class="history-detail-row">
                    <span class="history-detail-row-icon"><i class="fa-regular fa-envelope"></i></span>
                    <div><small>E-mail</small><strong>{{ selectedTicketModal.email || selectedTicketModal.contact?.email || 'Não informado' }}</strong></div>
                  </div>
                  <div class="history-detail-row">
                    <span class="history-detail-row-icon"><i class="fa-regular fa-id-card"></i></span>
                    <div><small>CNPJ / CPF</small><strong>{{ formatCnpjCpf(selectedTicketModal.cnpj || selectedTicketModal.contact?.cnpj) }}</strong></div>
                  </div>
                  <div class="history-detail-row">
                    <span class="history-detail-row-icon"><i class="fa-regular fa-building"></i></span>
                    <div><small>Empresa</small><strong>{{ selectedTicketModal.company || selectedTicketModal.contact?.company || 'Não informada' }}</strong></div>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal Editar Contato -->
    <ModalEditarContato
      v-if="showEditContactModal && selectedTicketModal"
      :ticket="selectedTicketModal"
      @close="showEditContactModal = false"
      @saved="fetchHistory"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ticketsApi } from '@/api/tickets.api'
import { useSettingsStore } from '@/stores/settings.store'
import { useAuthStore } from '@/stores/auth.store'
import { formatPhone, formatCnpjCpf, formatDateTime } from '@/utils/formatters'
import { normalizePersonName } from '@/utils/person-display'
import ChatBubble from '@/components/atendimentos/ChatBubble.vue'
import ModalEditarContato from '@/components/modals/ModalEditarContato.vue'

const settingsStore = useSettingsStore()
const authStore = useAuthStore()

const historyList = ref([])
const loading = ref(false)
const selectedTicketModal = ref(null)
const detailLoading = ref(false)
const showEditContactModal = ref(false)

const currentPage = ref(1)
const itemsPerPage = ref(20)

const isSearchOpen = ref(false)
const showFilterPopover = ref(false)
const searchInputRef = ref(null)
const filterDropdownRef = ref(null)

const filters = ref({
  search: '',
  department: '',
  agent: '',
  rating: '',
  dateFrom: '',
  dateTo: ''
})

function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value
  if (isSearchOpen.value) {
    nextTick(() => searchInputRef.value?.focus())
  }
}

function onSearchEsc() {
  if (!filters.value.search) {
    isSearchOpen.value = false
  }
}

function clearSearch() {
  filters.value.search = ''
  searchInputRef.value?.focus()
}

const activeFilterCount = computed(() => {
  let count = 0
  if (filters.value.department) count++
  if (filters.value.agent) count++
  if (filters.value.rating) count++
  if (filters.value.dateFrom || filters.value.dateTo) count++
  return count
})

const hasActiveChips = computed(() => {
  return Boolean(
    filters.value.department ||
    filters.value.agent ||
    filters.value.rating ||
    filters.value.dateFrom ||
    filters.value.dateTo
  )
})

function formatShortDate(d) {
  if (!d) return ''
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`
  return d
}

function handleClickOutside(event) {
  if (filterDropdownRef.value && !filterDropdownRef.value.contains(event.target)) {
    showFilterPopover.value = false
  }
}

function handleHistoryKeydown(event) {
  if (event.key === 'Escape' && selectedTicketModal.value && !showEditContactModal.value) {
    selectedTicketModal.value = null
  }
}

const uniqueAgents = computed(() => {
  const set = new Set()
  historyList.value.forEach(h => {
    const ag = h.agent || h.encerrado_por
    if (ag && ag !== '--') set.add(ag)
  })
  return Array.from(set)
})

const hasActiveFilters = computed(() => {
  return (
    filters.value.search !== '' ||
    filters.value.department !== '' ||
    filters.value.agent !== '' ||
    filters.value.rating !== '' ||
    filters.value.dateFrom !== '' ||
    filters.value.dateTo !== ''
  )
})

function clearFilters() {
  filters.value = {
    search: '',
    department: '',
    agent: '',
    rating: '',
    dateFrom: '',
    dateTo: ''
  }
  currentPage.value = 1
}

function exportFilteredHistoryCsv() {
  const list = filteredHistory.value
  if (!list.length) return
  let csv = '\uFEFFProtocolo;Cliente;Telefone;Departamento;Atendente;Avaliação;Data\r\n'
  for (const row of list) {
    const proto = row.protocolo || row.id || ''
    const client = (row.clientName || row.client_name || '').replace(/;/g, ',')
    const phone = row.phone || ''
    const dept = row.deptFinal || row.department || ''
    const agent = row.agent || row.encerrado_por || ''
    const rating = row.rating ? `${row.rating} estrelas` : 'Sem avaliação'
    const date = row.closed_at || row.created_at || ''
    csv += `${proto};${client};${phone};${dept};${agent};${rating};${date}\r\n`
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `historico_conversas_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

const filteredHistory = computed(() => {
  return historyList.value.filter(item => {
    // 1. Busca textual
    if (filters.value.search) {
      const term = filters.value.search.toLowerCase()
      const client = (item.clientName || item.client_name || '').toLowerCase()
      const phone = (item.phone || '').toLowerCase()
      const proto = (item.protocolo || item.id || '').toLowerCase()
      const msgMatch = (item.messages || []).some(m => (m.text || '').toLowerCase().includes(term))
      if (!client.includes(term) && !phone.includes(term) && !proto.includes(term) && !msgMatch) {
        return false
      }
    }

    // 2. Departamento
    if (filters.value.department) {
      const dept = item.deptFinal || item.department || ''
      if (dept !== filters.value.department) return false
    }

    // 3. Atendente
    if (filters.value.agent) {
      const ag = item.agent || item.encerrado_por || ''
      if (ag !== filters.value.agent) return false
    }

    // 4. Avaliação CSAT
    if (filters.value.rating) {
      if (filters.value.rating === 'com_avaliacao') {
        if (!item.rating) return false
      } else if (filters.value.rating === 'sem_avaliacao') {
        if (item.rating) return false
      } else {
        if (String(item.rating) !== String(filters.value.rating)) return false
      }
    }

    // 5. Data Início
    if (filters.value.dateFrom) {
      const itemDate = (item.closed_at || item.created_at || '').substring(0, 10)
      if (itemDate && itemDate < filters.value.dateFrom) return false
    }

    // 6. Data Fim
    if (filters.value.dateTo) {
      const itemDate = (item.closed_at || item.created_at || '').substring(0, 10)
      if (itemDate && itemDate > filters.value.dateTo) return false
    }

    return true
  })
})

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredHistory.value.length / itemsPerPage.value))
})

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredHistory.value.slice(start, start + itemsPerPage.value)
})

const paginationInfo = computed(() => {
  const total = filteredHistory.value.length
  if (total === 0) return { from: 0, to: 0 }
  const from = (currentPage.value - 1) * itemsPerPage.value + 1
  const to = Math.min(currentPage.value * itemsPerPage.value, total)
  return { from, to }
})

function shortProtocol(id) {
  if (!id) return '--'
  if (id.length > 12) return id.substring(0, 8)
  return id
}

function getDeptColor(deptName) {
  const d = settingsStore.departments.find(x => x.name === deptName)
  return d?.color || '#059669'
}

async function openDetailsModal(item) {
  selectedTicketModal.value = { ...item }
  detailLoading.value = true
  try {
    const { data } = await ticketsApi.get(item.id)
    if (data?.success && data.ticket && selectedTicketModal.value?.id === item.id) {
      selectedTicketModal.value = {
        ...item,
        ...data.ticket,
        clientName: data.ticket.clientName || data.ticket.client_name || item.clientName,
        avatarColor: data.ticket.avatarColor || data.ticket.avatar_color || item.avatarColor,
        rating: item.rating,
        messages: data.ticket.messages || item.messages || []
      }
    }
  } catch (error) {
    console.warn('Falha ao atualizar a conversa completa:', error)
  } finally {
    detailLoading.value = false
  }
}

async function fetchHistory() {
  loading.value = true
  try {
    const { data } = await ticketsApi.history()
    if (data.success && Array.isArray(data.history)) {
      historyList.value = data.history
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleHistoryKeydown)
  settingsStore.fetchDepartments()
  fetchHistory()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleHistoryKeydown)
})
</script>

<style scoped>
.initial-avatar { overflow: hidden; }
.history-avatar-image { width: 100%; height: 100%; object-fit: cover; }

/* ── Detalhes da conversa ── */
.history-detail-overlay { padding:24px;box-sizing:border-box;backdrop-filter:blur(5px);background:rgba(15,23,42,.58); }
.history-detail-modal { width:min(1120px,calc(100vw - 48px));max-width:none;height:min(860px,calc(100vh - 48px));max-height:none;border:1px solid rgba(226,232,240,.9);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;background:#fff;box-shadow:0 28px 80px rgba(15,23,42,.3); }
.history-detail-header { min-height:74px;padding:12px 18px;border-bottom:1px solid #e8edf3;display:flex;align-items:center;justify-content:space-between;gap:16px;flex:none;background:#fff; }
.history-customer-summary { min-width:0;display:flex;align-items:center;gap:12px; }
.history-detail-avatar { width:44px;height:44px;font-size:14px;flex:none;box-shadow:0 0 0 3px #f1f5f9; }
.history-customer-copy { min-width:0;display:flex;flex-direction:column;gap:5px; }
.history-customer-name-row { min-width:0;display:flex;align-items:center;gap:8px; }
.history-customer-name { overflow:hidden;color:#0f172a;font-size:15px;text-overflow:ellipsis;white-space:nowrap; }
.history-channel-pill { padding:3px 7px;border:1px solid #bbf7d0;border-radius:999px;display:inline-flex;align-items:center;gap:4px;flex:none;background:#f0fdf4;color:#07864b;font-size:9.5px;font-weight:600; }
.history-customer-meta { min-width:0;display:flex;align-items:center;gap:8px;color:#64748b;font-size:10.5px; }
.history-customer-meta>span:not(.history-meta-separator) { min-width:0;display:inline-flex;align-items:center;gap:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.history-customer-meta i { color:#94a3b8;font-size:9px; }
.history-meta-separator { width:3px;height:3px;border-radius:50%;flex:none;background:#cbd5e1; }
.history-modal-close { width:34px;height:34px;border:1px solid #e2e8f0;border-radius:9px;display:grid;place-items:center;flex:none;background:#fff;color:#64748b;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,color .15s ease,transform .15s ease; }
.history-modal-close:hover { border-color:#fecaca;background:#fef2f2;color:#dc2626;transform:rotate(3deg); }
.history-detail-body { flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(320px,.9fr);overflow:hidden; }
.history-conversation-pane { min-width:0;min-height:0;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;background:#f6f8fc; }
.history-conversation-toolbar { min-height:58px;padding:9px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;background:rgba(255,255,255,.94); }
.history-conversation-toolbar>div { min-width:0;display:flex;align-items:center;gap:9px; }
.history-conversation-toolbar>div>div { min-width:0;display:flex;flex-direction:column;gap:1px; }
.history-conversation-toolbar strong { color:#334155;font-size:12px;font-weight:600; }
.history-conversation-toolbar small { color:#94a3b8;font-size:9.5px; }
.history-toolbar-icon { width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex:none;background:#ecfdf5;color:#059669;font-size:11px; }
.history-message-count { padding:4px 8px;border:1px solid #e2e8f0;border-radius:999px;flex:none;background:#f8fafc;color:#64748b;font-size:9.5px;font-weight:600; }
.history-conversation-messages { flex:1;min-height:0;padding:20px 22px 28px;overflow-y:auto;background:radial-gradient(circle at 50% 0,rgba(209,250,229,.35),transparent 34%),#f6f8fc;scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent; }
.history-start-pill { width:max-content;margin:0 auto 18px;padding:4px 10px;border:1px solid #dbe2ea;border-radius:999px;background:rgba(255,255,255,.9);color:#64748b;font-size:9.5px;font-weight:500;box-shadow:0 2px 6px rgba(15,23,42,.03); }
.history-start-pill i { margin-right:4px;color:#94a3b8; }
.history-conversation-state { min-height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;color:#64748b;text-align:center; }
.history-conversation-state strong { color:#475569;font-size:12px;font-weight:600; }
.history-conversation-state small { max-width:280px;color:#94a3b8;font-size:10.5px;line-height:1.45; }
.history-state-icon { width:42px;height:42px;margin-bottom:4px;border-radius:12px;display:grid;place-items:center;background:#ecfdf5;color:#059669;font-size:15px; }
.history-state-icon.empty { background:#f1f5f9;color:#94a3b8; }
.history-detail-sidebar { min-width:0;padding:15px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;background:#f8fafc;scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent; }
.history-rating-card,.history-info-card { border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 3px 12px rgba(15,23,42,.025); }
.history-rating-card { padding:13px;display:flex;flex-direction:column;gap:10px; }
.history-rating-card.rated { border-color:#fde68a;background:linear-gradient(135deg,#fffdf4,#fffbeb); }
.history-card-eyebrow { display:flex;align-items:center;gap:6px;color:#64748b;font-size:9px;font-weight:700;letter-spacing:.045em;text-transform:uppercase; }
.history-card-eyebrow i { color:#f59e0b; }
.history-rating-result { display:grid;grid-template-columns:1fr auto;align-items:center;gap:3px 10px; }
.history-rating-result strong { color:#92400e;font-size:13px;font-weight:700; }
.history-rating-result small { grid-column:1 / -1;color:#a16207;font-size:9.5px; }
.history-stars { display:flex;gap:3px;color:#e2e8f0;font-size:13px; }
.history-stars i.active { color:#fbbf24;filter:drop-shadow(0 1px 1px rgba(180,83,9,.12)); }
.history-rating-pending { display:flex;align-items:center;gap:9px; }
.history-rating-pending>span { width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none;background:#f1f5f9;color:#94a3b8; }
.history-rating-pending>div { min-width:0;display:flex;flex-direction:column;gap:2px; }
.history-rating-pending strong { color:#475569;font-size:11px;font-weight:600; }
.history-rating-pending small { color:#94a3b8;font-size:9.5px;line-height:1.35; }
.history-info-card { overflow:hidden; }
.history-info-card-header { min-height:52px;padding:10px 12px;border-bottom:1px solid #edf1f5;display:flex;align-items:center;gap:9px; }
.history-info-card-header>div { min-width:0;display:flex;flex:1;flex-direction:column;gap:1px; }
.history-info-card-header strong { color:#334155;font-size:11px;font-weight:600; }
.history-info-card-header small { color:#94a3b8;font-size:9px; }
.history-info-card-icon { width:29px;height:29px;border-radius:8px;display:grid;place-items:center;flex:none;background:#ecfdf5;color:#059669;font-size:10px; }
.history-info-card-icon.customer { background:#f0fdf4;color:#059669; }
.history-edit-contact { min-height:27px;padding:0 8px;border:1px solid #dbe2ea;border-radius:7px;display:inline-flex;align-items:center;gap:5px;flex:none;background:#fff;color:#475569;font-size:9.5px;font-weight:600;cursor:pointer;transition:all .15s ease; }
.history-edit-contact:hover { border-color:#a7f3d0;background:#ecfdf5;color:#047857; }
.history-detail-list { padding:3px 12px; }
.history-detail-row { padding:8px 0;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:9px; }
.history-detail-row:last-child { border-bottom:0; }
.history-detail-row-icon { width:27px;height:27px;border-radius:7px;display:grid;place-items:center;flex:none;background:#f1f5f9;color:#64748b;font-size:9.5px; }
.history-detail-row>div { min-width:0;display:flex;flex-direction:column;gap:1px; }
.history-detail-row small { color:#94a3b8;font-size:8.5px;font-weight:500; }
.history-detail-row strong { overflow-wrap:anywhere;color:#334155;font-size:10.5px;font-weight:600;line-height:1.35; }
.history-detail-row.success .history-detail-row-icon { background:#ecfdf5;color:#059669; }
.history-detail-row.whatsapp .history-detail-row-icon { background:#f0fdf4;color:#16a34a; }

@media (max-width: 860px) {
  .history-detail-overlay { padding:12px; }
  .history-detail-modal { width:calc(100vw - 24px);height:calc(100vh - 24px); }
  .history-detail-body { display:block;overflow-y:auto;background:#f8fafc; }
  .history-conversation-pane { min-height:62vh;border-right:0;border-bottom:1px solid #e2e8f0; }
  .history-conversation-messages { min-height:0; }
  .history-detail-sidebar { overflow:visible; }
}

@media (max-width: 560px) {
  .history-detail-overlay { padding:0; }
  .history-detail-modal { width:100vw;height:100vh;border:0;border-radius:0; }
  .history-detail-header { min-height:68px;padding:10px 12px; }
  .history-detail-avatar { width:39px;height:39px; }
  .history-channel-pill,.history-meta-separator,.history-customer-meta>span:last-child { display:none; }
  .history-customer-name { font-size:14px; }
  .history-conversation-toolbar { padding:8px 12px; }
  .history-conversation-toolbar small { display:none; }
  .history-conversation-messages { padding:16px 10px 24px; }
  .history-detail-sidebar { padding:10px; }
}

/* ── Barra Compacta de Ferramentas ── */
.history-toolbar {
  margin-bottom: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 8px 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}

.history-toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

/* ── Botão Genérico de Ação na Toolbar ── */
.history-tool-btn {
  height: 34px;
  min-width: 34px;
  padding: 0 12px;
  border-radius: 7px;
  border: 1px solid #dbe2ea;
  background: #ffffff;
  color: #475569;
  font-size: 12.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.history-tool-btn:hover {
  background: #f8fafc;
  color: #1f62d0;
  border-color: #bfdbfe;
}

.history-tool-btn.active {
  background: #eff6ff;
  color: #1f62d0;
  border-color: #1f62d0;
}

/* ── Lupa / Busca Pequena Expansível ── */
.history-search-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-search-toggle {
  padding: 0;
  width: 34px;
}

.history-compact-search {
  position: relative;
  display: flex;
  align-items: center;
}

.history-search-input {
  width: 250px;
  height: 34px;
  padding: 0 28px 0 10px;
  border: 1px solid #1f62d0;
  border-radius: 7px;
  font-size: 12.5px;
  color: #0f172a;
  background: #ffffff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(31, 98, 208, 0.1);
  transition: all 0.2s ease;
}

.history-search-input:focus {
  border-color: #1d4ed8;
}

.history-search-clear {
  position: absolute;
  right: 6px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 3px;
  font-size: 11px;
}

.history-search-clear:hover {
  color: #ef4444;
}

/* Transição suave da busca */
.search-expand-enter-active,
.search-expand-leave-active {
  transition: all 0.18s ease;
  overflow: hidden;
}

.search-expand-enter-from,
.search-expand-leave-to {
  width: 0;
  opacity: 0;
}

/* ── Popover de Filtros ── */
.history-filter-wrapper {
  position: relative;
}

.history-filter-count {
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 999px;
  background: #1f62d0;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.history-filter-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 340px;
  background: #ffffff;
  border: 1px solid #dbe2ea;
  border-radius: 10px;
  box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06);
  z-index: 100;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

.popover-title,
.popover-header span {
  font-size: 12.5px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.popover-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
}

.popover-close-btn:hover {
  color: #0f172a;
  background: #f1f5f9;
}

.popover-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.popover-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.popover-field label {
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 5px;
}

.popover-field label i {
  color: #94a3b8;
  font-size: 10px;
}

.popover-select,
.popover-input {
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  font-size: 12px;
  color: #0f172a;
  outline: none;
  box-sizing: border-box;
}

.popover-select:focus,
.popover-input:focus {
  border-color: #1f62d0;
}

.popover-date-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.popover-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}

.popover-reset-btn {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.popover-reset-btn:hover {
  text-decoration: underline;
}

.popover-apply-btn {
  background: #1f62d0;
  color: #ffffff;
  border: none;
  border-radius: 5px;
  padding: 5px 12px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  margin-left: auto;
  transition: background 0.15s ease;
}

.popover-apply-btn:hover {
  background: #1d4ed8;
}

/* Transição Popover */
.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ── Chips de Filtros Ativos ── */
.history-chips-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-right: auto;
  order: -1;
}

.history-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 5px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1f62d0;
  font-size: 11px;
  font-weight: 500;
}

.history-chip i {
  font-size: 9px;
  cursor: pointer;
  color: #60a5fa;
}

.history-chip i:hover {
  color: #ef4444;
}

.history-chip-clear {
  background: transparent;
  border: none;
  color: #ef4444;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 0 4px;
}

.history-chip-clear:hover {
  text-decoration: underline;
}

/* ── Skeleton loader ── */
@keyframes sk-shimmer {
  0% { background-position: -400px 0 }
  100% { background-position: 400px 0 }
}
.skeleton-row td { padding: 10px 12px; border-top: 1px solid #f1f5f9; }
.sk-cell { display: flex; align-items: center; gap: 9px; }
.sk-lines { display: flex; flex-direction: column; gap: 5px; flex: 1; }
.sk-avatar { width: 34px; height: 34px; border-radius: 8px; flex: none; background: linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size: 800px 100%; animation: sk-shimmer 1.4s infinite linear; }
.sk-line { height: 10px; border-radius: 5px; background: linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size: 800px 100%; animation: sk-shimmer 1.4s infinite linear; }
.sk-w70 { width: 70%; } .sk-w60 { width: 60%; } .sk-w55 { width: 55%; } .sk-w50 { width: 50%; } .sk-w45 { width: 45%; } .sk-w40 { width: 40%; } .sk-w35 { width: 35%; } .sk-w30 { width: 30%; } .sk-w25 { width: 25%; }
</style>
