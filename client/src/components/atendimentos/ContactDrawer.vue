<template>
  <div class="details-column" id="contactDetailsCol">
    <!-- Header com gradiente verde -->
    <div class="details-header">
      <div class="details-header-left">
        <div class="details-header-icon">
          <i class="fa-solid fa-address-card"></i>
        </div>
        <span class="details-header-title">Detalhes</span>
      </div>
      <div class="details-header-actions">
        <button
          type="button"
          class="details-action-btn edit-btn"
          title="Editar contato"
          @click="showEditModal = true"
        >
          <i class="fa-solid fa-pen"></i>
        </button>
        <button
          type="button"
          class="details-action-btn close-btn"
          title="Fechar painel"
          @click="$emit('close')"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>

    <div class="details-body">

      <!-- Card: Dados do Chamado -->
      <div class="details-card">
        <div class="card-title-row">
          <span class="card-section-title">
            <i class="fa-solid fa-circle-info"></i> Dados do Chamado
          </span>
          <span class="status-pill" :class="ticket?.status || 'aberto'">
            <span class="status-dot"></span>
            {{ statusLabel }}
          </span>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <div class="meta-icon-label">
              <span class="meta-icon-box"><i class="fa-solid fa-tag"></i></span>
              <span class="meta-label">Departamento</span>
            </div>
            <span class="dept-badge">
              {{ ticket?.department || ticket?.deptInitial || 'Geral' }}
            </span>
          </div>

          <div class="meta-item">
            <div class="meta-icon-label">
              <span class="meta-icon-box"><i class="fa-regular fa-clock"></i></span>
              <span class="meta-label">{{ ticket?.status === 'em_atendimento' ? 'Tempo de Atendimento' : 'Tempo em Espera' }}</span>
            </div>
            <span class="duration-badge">{{ durationStr }}</span>
          </div>

          <div class="meta-item meta-item--subtle">
            <div class="meta-icon-label">
              <span class="meta-icon-box meta-icon-box--muted"><i class="fa-solid fa-stopwatch"></i></span>
              <span class="meta-label">TME</span>
            </div>
            <span class="duration-badge duration-badge--muted">{{ tmeStr }}</span>
          </div>

          <div class="meta-item">
            <div class="meta-icon-label">
              <span class="meta-icon-box"><i class="fa-solid fa-hashtag"></i></span>
              <span class="meta-label">Protocolo</span>
            </div>
            <div class="id-copy-box" @click="copyTicketId" title="Clique para copiar ID">
              <code>#{{ ticket?.id ? ticket.id.substring(0, 8) : '—' }}</code>
              <i class="fa-regular" :class="copiedId ? 'fa-circle-check text-success' : 'fa-copy'"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- Card: Contato Relacionado -->
      <div class="details-card contact-card">
        <!-- Banner do perfil -->
        <div class="contact-hero">
          <div
            class="contact-avatar-hero"
            :style="{ backgroundColor: ticket?.avatarColor || '#059669' }"
          >
            <img v-if="ticket?.avatar_url" :src="ticket.avatar_url" alt="Foto do cliente" referrerpolicy="no-referrer" />
            <span v-else>{{ ticket?.initials || 'CL' }}</span>
          </div>
          <div class="contact-hero-text">
            <strong class="contact-hero-name" :title="ticket?.clientName || ticket?.client_name">
              {{ normalizePersonName(ticket?.clientName || ticket?.client_name || 'Cliente') }}
            </strong>
            <span class="contact-hero-phone">{{ displayPhone }}</span>
            <div class="contact-role-tag" :class="{ employee: ticket?.is_employee }">
              <i class="fa-solid" :class="ticket?.is_employee ? 'fa-id-badge' : 'fa-user'"></i>
              {{ ticket?.is_employee ? 'Funcionário' : 'Cliente' }}
            </div>
          </div>
          <div class="contact-hero-actions">
            <button
              v-if="!contactSaved"
              type="button"
              class="btn-hero-save"
              :disabled="savingContact"
              @click="saveContact(ticket?.is_employee)"
              title="Salvar contato"
            >
              <i class="fa-solid" :class="savingContact ? 'fa-spinner fa-spin' : 'fa-user-plus'"></i>
            </button>
          </div>
        </div>

        <!-- Tipo de Contato -->
        <div class="contact-type-control">
          <span class="contact-type-label">Tipo de contato</span>
          <div class="contact-type-options" role="group" aria-label="Tipo de contato">
            <button
              type="button"
              :class="{ active: !ticket?.is_employee }"
              :disabled="savingContact"
              @click="saveContact(false)"
            >
              <i class="fa-solid fa-user"></i> Cliente
            </button>
            <button
              type="button"
              :class="{ active: ticket?.is_employee }"
              :disabled="savingContact"
              @click="saveContact(true)"
            >
              <i class="fa-solid fa-id-badge"></i> Funcionário
            </button>
          </div>
          <small>{{ contactSaved ? 'Alterações são salvas imediatamente.' : 'Ao escolher, o contato também será salvo.' }}</small>
        </div>

        <!-- Atributos do contato -->
        <div class="contact-attributes-list">
          <div class="attribute-row">
            <span class="attribute-icon"><i class="fa-regular fa-envelope"></i></span>
            <div class="attribute-content">
              <span class="attribute-label">E-mail</span>
              <span class="attribute-val" :class="{ 'text-muted': !contact.email }">
                {{ contact.email || 'Não informado' }}
              </span>
            </div>
          </div>

          <div class="attribute-row">
            <span class="attribute-icon"><i class="fa-regular fa-id-card"></i></span>
            <div class="attribute-content">
              <span class="attribute-label">CPF / CNPJ</span>
              <span class="attribute-val" :class="{ 'text-muted': !contact.cnpj }">
                {{ contact.cnpj ? formatCnpjCpf(contact.cnpj) : 'Não informado' }}
              </span>
            </div>
          </div>

          <div class="attribute-row">
            <span class="attribute-icon"><i class="fa-regular fa-building"></i></span>
            <div class="attribute-content">
              <span class="attribute-label">Empresa</span>
              <span class="attribute-val" :class="{ 'text-muted': !contact.company }">
                {{ contact.company || 'Não informada' }}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Modal de Edição de Contato -->
    <ModalEditarContato
      v-if="showEditModal"
      :ticket="ticket"
      @close="showEditModal = false"
      @saved="showEditModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useUiStore } from '@/stores/ui.store'
import { useTicketStore } from '@/stores/tickets.store'
import { ticketsApi } from '@/api/tickets.api'
import { formatPhone, formatCnpjCpf } from '@/utils/formatters'
import ModalEditarContato from '@/components/modals/ModalEditarContato.vue'
import { normalizePersonName } from '@/utils/person-display'

const props = defineProps({
  ticket: {
    type: Object,
    default: null
  }
})

defineEmits(['close'])

const ui = useUiStore()
const ticketStore = useTicketStore()
const showEditModal = ref(false)
const savingContact = ref(false)
const copiedId = ref(false)
const nowTick = ref(Date.now())
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  clearInterval(timer)
})

const contact = computed(() => props.ticket?.contact || {})
const contactSaved = computed(() => Boolean(props.ticket?.contact_id || contact.value?.id))

const displayPhone = computed(() => {
  const p = contact.value?.phone || props.ticket?.phone
  return formatPhone(p)
})

const statusLabel = computed(() => {
  const s = props.ticket?.status
  if (s === 'aguardando') return 'Aguardando'
  if (s === 'em_atendimento') return 'Em atendimento'
  if (s === 'chatbot') return 'Bot'
  if (s === 'finalizado') return 'Finalizado'
  return s || 'Aberto'
})

const whatsappAccountLabel = computed(() => {
  const channel = props.ticket?.channel || ''
  const accountId = channel.startsWith('whatsapp:') ? channel.slice('whatsapp:'.length) : null
  const account = accountId ? ui.whatsappAccounts.find(item => item.id === accountId) : null
  return account?.name || 'WhatsApp Principal'
})

function formatDurationSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hrs = Math.floor(safeSeconds / 3600)
  const mins = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const durationStr = computed(() => {
  const start = props.ticket?.assumed_at || props.ticket?.started_at || props.ticket?.created_at
  if (!start) return '00:00:00'

  // Se o atendimento já foi encerrado, calcula a duração fixa final
  const end = props.ticket?.closed_at || props.ticket?.finished_at
  if (end || props.ticket?.status === 'finalizado') {
    const endTimestamp = end ? new Date(end).getTime() : (props.ticket?.updated_at ? new Date(props.ticket.updated_at).getTime() : Date.now())
    const diffSec = Math.max(0, Math.floor((endTimestamp - new Date(start).getTime()) / 1000))
    return formatDurationSeconds(diffSec)
  }

  // Se estiver em andamento, atualiza a cada segundo
  const _ = nowTick.value
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000))
  return formatDurationSeconds(diffSec)
})

const tmeStr = computed(() => {
  const queueStart = props.ticket?.queued_at || props.ticket?.created_at
  if (!queueStart) return '—'

  // Se já foi assumido, exibe o tempo total que esperou na fila até o atendimento humano
  const assumedAt = props.ticket?.assumed_at
  if (assumedAt) {
    const diffSec = Math.max(0, Math.floor((new Date(assumedAt).getTime() - new Date(queueStart).getTime()) / 1000))
    return formatDurationSeconds(diffSec)
  }

  // Se ainda estiver aguardando na fila, exibe o tempo de espera corrente
  if (props.ticket?.status === 'aguardando') {
    const _ = nowTick.value
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(queueStart).getTime()) / 1000))
    return formatDurationSeconds(diffSec)
  }

  return '—'
})

function copyTicketId() {
  if (!props.ticket?.id) return
  navigator.clipboard.writeText(props.ticket.id)
  copiedId.value = true
  setTimeout(() => { copiedId.value = false }, 2000)
}

async function saveContact(isEmployee = false) {
  if (!props.ticket?.id || savingContact.value) return
  savingContact.value = true
  try {
    const notes = typeof contact.value?.notes === 'string'
      ? contact.value.notes
      : contact.value?.notes?.[0]?.text || ''
    const { data } = await ticketsApi.updateContact(props.ticket.id, {
      name: props.ticket.clientName || props.ticket.client_name || contact.value?.name || 'Cliente',
      phone: contact.value?.phone || props.ticket.phone || '',
      email: contact.value?.email || '',
      cnpj: contact.value?.cnpj || '',
      note: notes,
      is_employee: Boolean(isEmployee)
    })
    if (!data?.success || !data.ticket) throw new Error(data?.error || 'NÃ£o foi possÃ­vel salvar o contato.')
    ticketStore.receiveTicket(data.ticket)
    ticketStore.notifyKpisUpdated()
    ui.showToast(Boolean(isEmployee) ? 'Contato salvo como funcionÃ¡rio.' : 'Contato salvo como cliente.')
  } catch (error) {
    ui.showToast(error.response?.data?.error || error.message || 'NÃ£o foi possÃ­vel salvar o contato.', 'error')
  } finally {
    savingContact.value = false
  }
}
</script>

<style scoped>
/* Layout Principal */
.details-column {
  width: 300px;
  min-width: 300px;
  max-width: 300px;
  flex-shrink: 0;
  background-color: #ffffff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
  user-select: none;
}

/* Header com visual neutro alinhado ao sidebar */
.details-header {
  height: 52px;
  min-height: 52px;
  padding: 0 12px 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  gap: 8px;
}

.details-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.details-header-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
  font-size: 13px;
  flex-shrink: 0;
}

.details-header-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #334155;
  letter-spacing: -0.01em;
}

.details-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.details-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.details-action-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.details-action-btn.close-btn:hover {
  background: rgba(239,68,68,0.35);
  border-color: rgba(239,68,68,0.5);
  color: #ffffff;
}

/* Body */
.details-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Cards */
.details-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-section-title {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 5px;
}

.card-section-title i {
  color: #0f172a;
  font-size: 12px;
}

/* Status Pills */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.status-pill .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-pill.em_atendimento {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #dfe7f1;
}
.status-pill.em_atendimento .status-dot {
  background: #0f172a;
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.12);
}

.status-pill.aguardando {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.status-pill.aguardando .status-dot { background: #64748b; }

.status-pill.chatbot {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.status-pill.chatbot .status-dot { background: #334155; }

.status-pill.finalizado {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.status-pill.finalizado .status-dot { background: #64748b; }

/* Meta Grid (dados do chamado) */
.meta-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.meta-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  gap: 6px;
}

.meta-item--subtle {
  background: transparent;
  border-radius: 0;
  padding: 8px 0;
  margin-top: 0;
}

.meta-item:last-child { border-bottom: none; padding-bottom: 0; }

.meta-icon-label {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.meta-icon-box {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
}

.meta-icon-box--muted {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #0f172a;
}

.meta-label {
  color: #475569;
  font-size: 11.5px;
  white-space: nowrap;
}

.dept-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #334155;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.duration-badge {
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 2px 8px;
  border-radius: 5px;
  white-space: nowrap;
  line-height: 1.3;
}

.duration-badge--muted {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #334155;
}

.id-copy-box {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.id-copy-box:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.id-copy-box code {
  font-size: 11px;
  font-family: monospace;
  color: #334155;
  font-weight: 700;
}

.id-copy-box i { font-size: 10px; color: #0f172a; }
.text-success { color: #0f172a !important; }

/* Card de Contato (Hero) */
.contact-card { gap: 14px; }

.contact-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  position: relative;
}

.contact-avatar-hero {
  width: 46px;
  height: 46px;
  min-width: 46px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 16px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
  border: 2px solid rgba(255,255,255,0.8);
}

.contact-avatar-hero img { width: 100%; height: 100%; object-fit: cover; }

.contact-hero-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
  flex: 1;
}

.contact-hero-name {
  font-size: 13.5px;
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-hero-phone {
  font-size: 11.5px;
  color: #475569;
  font-weight: 500;
}

.contact-role-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 2px 7px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
  margin-top: 2px;
}

.contact-role-tag.employee {
  background: #f8fafc;
  color: #475569;
  border-color: #e2e8f0;
}

.contact-hero-actions {
  position: absolute;
  top: 8px;
  right: 8px;
}

.btn-hero-save {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #0f172a;
  border: none;
  color: #ffffff;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18);
}

.btn-hero-save:hover {
  background: #1f2937;
  transform: scale(1.1);
}

/* Tipo de Contato */
.contact-type-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.contact-type-label {
  color: #475569;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.contact-type-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #f8fafc;
}

.contact-type-options button {
  border: 0;
  border-radius: 6px;
  padding: 6px 5px;
  background: transparent;
  color: #64748b;
  font-size: 10.5px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.12s ease;
}

.contact-type-options button.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  font-weight: 800;
}

.contact-type-options button:disabled { cursor: wait; opacity: 0.7; }

.contact-type-control small {
  color: #64748b;
  font-size: 9.5px;
}

/* Atributos do Contato */
.contact-attributes-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.attribute-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 11.5px;
  padding: 8px 0;
  border-bottom: 1px solid #f0fdf4;
}

.attribute-row:last-child { border-bottom: none; padding-bottom: 0; }

.attribute-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
  margin-top: 1px;
}

.attribute-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.attribute-label {
  font-size: 9.5px;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}

/* Override: label mais visÃ­vel dentro de card branco */
.contact-card .attribute-label {
  color: #475569;
}

.attribute-val {
  color: #1e293b;
  font-weight: 500;
  word-break: break-word;
  font-size: 11.5px;
}

.text-muted {
  color: #94a3b8;
  font-style: italic;
}

/* Scrollbar */
.details-body::-webkit-scrollbar { width: 4px; }
.details-body::-webkit-scrollbar-track { background: transparent; }
.details-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.details-body::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
</style>
