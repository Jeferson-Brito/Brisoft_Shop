<template>
  <Teleport to="body">
    <div class="modal-overlay active" id="modalEncerrarAtendimento" @click.self="$emit('close')">
      <div class="modal-container close-ticket-modal">
        <!-- Header Moderno -->
        <div class="modal-header close-modal-header">
          <div class="header-title-group">
            <div class="header-icon-box">
              <i class="ri-checkbox-circle-fill"></i>
            </div>
            <div>
              <h3 class="modal-title">Encerrar Atendimento</h3>
              <p class="modal-subtitle">Revise as informações antes de concluir esta conversa.</p>
            </div>
          </div>
          <button type="button" class="btn-close-modal" title="Cancelar e fechar" @click="$emit('close')">
            <i class="ri-close-line"></i>
          </button>
        </div>

        <div class="modal-body close-modal-body">
          <!-- Card de Identificação do Atendimento -->
          <div class="ticket-summary-card">
            <div class="client-hero-row">
              <div class="client-avatar" :style="{ background: clientAvatarColor }">
                <img
                  v-if="ticket?.avatar_url && !avatarFailed"
                  :src="ticket.avatar_url"
                  :alt="clientName"
                  @error="avatarFailed = true"
                />
                <span v-else>{{ clientInitials }}</span>
              </div>
              <div class="client-hero-text">
                <div class="client-name-line">
                  <h4 class="client-name">{{ clientName }}</h4>
                  <span
                    class="client-role-badge"
                    :class="{ employee: ticket?.is_employee }"
                  >
                    <i :class="ticket?.is_employee ? 'ri-shield-user-line' : 'ri-user-smile-line'"></i>
                    {{ ticket?.is_employee ? 'Funcionário' : 'Cliente' }}
                  </span>
                </div>
                <span v-if="ticket?.phone" class="client-phone">
                  <i class="ri-whatsapp-line"></i> {{ formatPhone(ticket.phone) }}
                </span>
              </div>
            </div>

            <!-- Grid de Metadados -->
            <div class="ticket-meta-grid">
              <div class="meta-cell">
                <span class="meta-label">Protocolo</span>
                <button
                  type="button"
                  class="protocol-copy-badge"
                  :title="copiedId ? 'Copiado para a área de transferência!' : 'Clique para copiar o ID completo'"
                  @click="copyProtocol"
                >
                  <code>#{{ shortId }}</code>
                  <i :class="copiedId ? 'ri-check-line text-success' : 'ri-file-copy-line'"></i>
                </button>
              </div>

              <div class="meta-cell">
                <span class="meta-label">Departamento</span>
                <span class="dept-badge">
                  <i class="ri-building-line"></i>
                  {{ ticket?.department || 'Geral' }}
                </span>
              </div>

              <div class="meta-cell">
                <span class="meta-label">Duração</span>
                <span class="duration-badge">
                  <i class="ri-time-line"></i>
                  {{ durationStr }}
                </span>
              </div>
            </div>
          </div>

          <!-- Controle da Pesquisa de Satisfação -->
          <!-- CASO 1: É Funcionário da Empresa (nunca recebe pesquisa) -->
          <div v-if="ticket?.is_employee" class="internal-ticket-note">
            <i class="ri-information-line"></i>
            <span>Atendimento interno com funcionário da empresa. Nenhuma pesquisa será enviada.</span>
          </div>

          <!-- CASO 2: É Cliente E Administrador PERMITIU que o atendente escolha -->
          <div v-else-if="allowAgentToggle" class="survey-option-card" :class="{ disabled: !sendSurvey }">
            <label class="survey-option-label">
              <div class="survey-icon-box">
                <i class="ri-star-smile-fill"></i>
              </div>
              <div class="survey-text-content">
                <span class="survey-title">Enviar pesquisa de satisfação</span>
                <span class="survey-desc">
                  Dispara a avaliação de qualidade no WhatsApp do cliente após o encerramento.
                </span>
              </div>
              <div class="custom-switch-wrap">
                <input
                  v-model="sendSurvey"
                  type="checkbox"
                  class="custom-switch-input"
                />
                <span class="custom-switch-slider"></span>
              </div>
            </label>
          </div>

          <!-- CASO 3: É Cliente E Administrador NÃO PERMITIU escolha (Decisão automática pelo sistema) -->
          <div v-else-if="isRatingGloballyEnabled" class="survey-auto-card">
            <div class="survey-icon-box auto-icon">
              <i class="ri-shield-star-line"></i>
            </div>
            <div class="survey-text-content">
              <div class="survey-auto-header">
                <span class="survey-title">Pesquisa de satisfação</span>
                <span class="auto-badge">Automática</span>
              </div>
              <span class="survey-desc">
                A avaliação será enviada automaticamente ao cliente via WhatsApp pelo bot da empresa.
              </span>
            </div>
          </div>

          <!-- CASO 4: É Cliente, escolha desativada e avaliação desativada no sistema -->
          <div v-else class="internal-ticket-note">
            <i class="ri-information-line"></i>
            <span>Envio de pesquisa de satisfação desativado nas configurações gerais.</span>
          </div>
        </div>

        <div class="modal-footer close-modal-footer">
          <button type="button" class="btn-cancel" @click="$emit('close')">
            Voltar ao chat
          </button>
          <button
            type="button"
            class="btn-confirm-close"
            :disabled="loading"
            @click="confirmClose"
          >
            <i v-if="loading" class="ri-loader-4-line spin-icon"></i>
            <i v-else class="ri-check-line"></i>
            <span>{{ loading ? 'Concluindo...' : 'Concluir Atendimento' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTicketStore } from '@/stores/tickets.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { normalizePersonName, getInitials } from '@/utils/person-display'
import { formatPhone } from '@/utils/formatters'

const props = defineProps({
  ticket: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const ticketStore = useTicketStore()
const settingsStore = useSettingsStore()
const ui = useUiStore()
const loading = ref(false)
const copiedId = ref(false)
const avatarFailed = ref(false)
const sendSurvey = ref(true)

const botConfig = computed(() => settingsStore.settings?.bot_config || {})
const allowAgentToggle = computed(() => Boolean(botConfig.value.allow_agent_toggle_rating))
const isRatingGloballyEnabled = computed(() => botConfig.value.send_rating_request !== false)

onMounted(() => {
  if (!settingsStore.settings?.bot_config) {
    settingsStore.fetchSettings().catch(() => {})
  }
})

const clientName = computed(() => {
  return normalizePersonName(props.ticket?.clientName || props.ticket?.client_name || 'Cliente')
})

const clientInitials = computed(() => {
  return getInitials(clientName.value)
})

const clientAvatarColor = computed(() => {
  return props.ticket?.avatarColor || '#059669'
})

const shortId = computed(() => {
  if (!props.ticket?.id) return '————'
  return String(props.ticket.id).slice(0, 8)
})

const durationStr = computed(() => {
  const start = props.ticket?.assumed_at || props.ticket?.started_at || props.ticket?.created_at
  if (!start) return '00:00:00'
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000))
  const hrs = Math.floor(diffSec / 3600)
  const mins = Math.floor((diffSec % 3600) / 60)
  const secs = diffSec % 60
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})

function copyProtocol() {
  if (!props.ticket?.id) return
  navigator.clipboard.writeText(String(props.ticket.id))
  copiedId.value = true
  setTimeout(() => {
    copiedId.value = false
  }, 2000)
}

async function confirmClose() {
  if (!props.ticket) return
  loading.value = true
  try {
    const res = await ticketStore.close(props.ticket.id, {
      sendSurvey: allowAgentToggle.value ? sendSurvey.value : isRatingGloballyEnabled.value
    })
    if (res.success) {
      ui.showToast(`✅ Atendimento de ${clientName.value} encerrado com sucesso!`)
      emit('close')
    } else {
      ui.showToast(`⚠️ ${res.error}`, 'error')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.close-ticket-modal {
  max-width: 460px;
  width: 92%;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.05);
  overflow: hidden;
  animation: modalEnter 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalEnter {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Header */
.close-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 22px 16px;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-box {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border: 1px solid #a7f3d0;
  color: #059669;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 16.5px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.modal-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: #64748b;
}

.btn-close-modal {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 19px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.12s ease;
}

.btn-close-modal:hover {
  background: #f1f5f9;
  color: #334155;
}

/* Body */
.close-modal-body {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Card do Atendimento */
.ticket-summary-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.client-hero-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.client-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.client-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.client-hero-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.client-name-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.client-name {
  margin: 0;
  font-size: 14px;
  font-weight: 750;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.client-role-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.client-role-badge.employee {
  background: #fff7ed;
  color: #c2410c;
  border-color: #fed7aa;
}

.client-phone {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: #059669;
  font-weight: 600;
}

.client-phone i {
  font-size: 13px;
  color: #25d366;
}

/* Metadados */
.ticket-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #eef2f6;
}

.meta-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.protocol-copy-badge {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 8px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s ease;
  font-size: 11px;
}

.protocol-copy-badge:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.protocol-copy-badge code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  font-weight: 700;
  color: #334155;
}

.protocol-copy-badge i {
  font-size: 11px;
  color: #64748b;
}

.text-success {
  color: #059669 !important;
}

.dept-badge,
.duration-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 650;
  color: #334155;
  padding: 3px 6px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dept-badge i,
.duration-badge i {
  font-size: 11px;
  color: #059669;
}

/* Pesquisa de Satisfação */
.survey-option-card {
  background: #ffffff;
  border: 1px solid #d1fae5;
  border-radius: 12px;
  padding: 12px 14px;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(5, 150, 105, 0.05);
}

.survey-option-card.disabled {
  background: #f8fafc;
  border-color: #e2e8f0;
  box-shadow: none;
}

.survey-option-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  margin: 0;
}

.survey-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #fef3c7;
  color: #d97706;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.survey-option-card.disabled .survey-icon-box {
  background: #f1f5f9;
  color: #94a3b8;
}

.survey-text-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
}

.survey-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #0f172a;
}

.survey-desc {
  font-size: 11px;
  color: #64748b;
  line-height: 1.35;
}

/* Switch */
.custom-switch-wrap {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 22px;
  flex-shrink: 0;
}

.custom-switch-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.custom-switch-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 34px;
}

.custom-switch-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.custom-switch-input:checked + .custom-switch-slider {
  background-color: #059669;
}

.custom-switch-input:checked + .custom-switch-slider:before {
  transform: translateX(16px);
}

/* Card de Envio Automático */
.survey-auto-card {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 1px 3px rgba(5, 150, 105, 0.05);
}

.survey-icon-box.auto-icon {
  background: #dcfce7;
  color: #16a34a;
}

.survey-auto-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auto-badge {
  background: #bbf7d0;
  color: #166534;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 6px;
  letter-spacing: 0.3px;
}

/* Nota Interna */
.internal-ticket-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  font-size: 11.5px;
  color: #475569;
}

.internal-ticket-note i {
  font-size: 15px;
  color: #64748b;
}

/* Footer */
.close-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
}

.btn-cancel {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  font-size: 12.5px;
  font-weight: 650;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.btn-cancel:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #94a3b8;
}

.btn-confirm-close {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  color: #ffffff;
  font-size: 12.5px;
  font-weight: 750;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(5, 150, 105, 0.28);
  transition: all 0.15s ease;
}

.btn-confirm-close:hover:not(:disabled) {
  background: linear-gradient(135deg, #047857 0%, #065f46 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(5, 150, 105, 0.35);
}

.btn-confirm-close:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
}

.spin-icon {
  animation: spin 1s infinite linear;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
