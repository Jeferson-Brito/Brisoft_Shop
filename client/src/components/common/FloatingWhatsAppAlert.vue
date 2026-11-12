<template>
  <!-- Wrapper global invisível que contém a bolha e o modal -->
  <div class="floating-wa-container" v-if="hasDisconnectedAccounts && !isDismissed">
    
    <!-- 1. Bolha Flutuante do WhatsApp + Banner Informativo -->
    <div
      ref="bubbleEl"
      class="floating-wa-wrapper"
      :style="wrapperStyle"
      :class="{ 'is-dragging': isDragging, 'is-over-target': isOverDropZone }"
      @pointerdown="handlePointerDown"
    >
      <!-- Bolha Circular com Ícone do WhatsApp -->
      <button
        type="button"
        class="floating-wa-bubble"
        :title="bubbleTooltip"
        aria-label="Alerta de WhatsApp Desconectado"
      >
        <span class="wa-icon-glow"></span>
        <i class="fa-brands fa-whatsapp wa-icon"></i>
        <span class="wa-alert-badge" :class="{ count: disconnectedAccounts.length > 1 }">
          <i v-if="disconnectedAccounts.length <= 1" class="fa-solid fa-triangle-exclamation"></i>
          <span v-else>{{ disconnectedAccounts.length }}</span>
        </span>
      </button>

      <!-- Mensagem Informativa Lateral (Auto-dismiss com animação suave) -->
      <Transition name="wa-msg-slide">
        <div
          v-if="showMessage"
          class="floating-wa-message"
          :class="messageSideClass"
          @click.stop="openModal"
        >
          <div class="msg-header">
            <span class="msg-dot"></span>
            <strong>WhatsApp Desconectado</strong>
          </div>
          <p class="msg-body">{{ alertMessageText }}</p>
          <div class="msg-footer">
            <span class="msg-action-label"><i class="fa-solid fa-hand-pointer"></i> Toque para reconectar</span>
            <button
              type="button"
              class="msg-close-btn"
              title="Fechar aviso"
              @click.stop="showMessage = false"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 2. Bolinha "X" de Descarte (Surge no rodapé central enquanto arrasta) -->
    <Transition name="drop-zone-fade">
      <div
        v-if="isDragging"
        ref="dropZoneEl"
        class="floating-wa-dropzone"
        :class="{ active: isOverDropZone }"
      >
        <div class="dropzone-circle">
          <i class="fa-solid fa-xmark"></i>
        </div>
        <span class="dropzone-label">
          {{ isOverDropZone ? 'Solte para remover' : 'Arraste até aqui para fechar' }}
        </span>
      </div>
    </Transition>

    <!-- 3. Modal / Popup de Reconexão e Leitura do QR Code -->
    <Transition name="wa-modal-fade">
      <div v-if="modalOpen" class="wa-modal-backdrop" @click.self="closeModal">
        <div class="wa-modal-dialog" role="dialog" aria-modal="true">
          <!-- Cabeçalho -->
          <div class="wa-modal-header">
            <div class="header-info">
              <span class="wa-badge-icon"><i class="fa-brands fa-whatsapp"></i></span>
              <div>
                <h3>Reconexão do WhatsApp</h3>
                <p>
                  {{ auth.isAdmin
                    ? 'Gerencie e reconecte as linhas desconectadas do sistema'
                    : 'Reconecte o WhatsApp do seu setor para continuar os atendimentos'
                  }}
                </p>
              </div>
            </div>
            <button type="button" class="btn-modal-close" @click="closeModal">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Corpo do Modal -->
          <div class="wa-modal-body">
            <!-- Botão de Reconectar Todos (se houver mais de 1 conta e for admin) -->
            <div v-if="auth.isAdmin && disconnectedAccounts.length > 1" class="admin-reconnect-all">
              <div class="reconnect-all-text">
                <i class="fa-solid fa-circle-exclamation"></i>
                <span><strong>{{ disconnectedAccounts.length }} conexões</strong> estão offline.</span>
              </div>
              <button
                type="button"
                class="btn-reconnect-all"
                :disabled="isConnectingAny"
                @click="reconnectAll"
              >
                <i v-if="isConnectingAny" class="fa-solid fa-spinner fa-spin"></i>
                <i v-else class="fa-solid fa-rotate"></i>
                Reconectar Todos
              </button>
            </div>

            <!-- Lista de Contas Desconectadas -->
            <div class="accounts-grid">
              <div
                v-for="acc in disconnectedAccounts"
                :key="acc.id"
                class="account-card"
                :class="{ 'has-qr': acc.status === 'scan_qr' && acc.qrCode }"
              >
                <div class="account-card-header">
                  <div class="account-avatar">
                    <i class="fa-brands fa-whatsapp"></i>
                  </div>
                  <div class="account-meta">
                    <div class="account-title-row">
                      <h4>{{ acc.name }}</h4>
                      <span class="dept-badge" v-if="acc.departmentName || acc.fallbackDepartmentName">
                        <i class="fa-solid fa-building-user"></i>
                        {{ acc.departmentName || acc.fallbackDepartmentName }}
                      </span>
                    </div>
                    <div class="account-sub">
                      <span v-if="acc.phone" class="phone-label"><i class="fa-solid fa-phone"></i> {{ formatPhone(acc.phone) }}</span>
                      <span class="status-indicator disconnected">
                        <span class="status-dot"></span> {{ statusLabel(acc.status) }}
                      </span>
                      <small v-if="acc.disconnectReason" class="disconnect-reason">{{ disconnectReasonLabel(acc.disconnectReason) }}</small>
                    </div>
                  </div>
                </div>

                <!-- Área do QR Code (se foi gerado) -->
                <div v-if="acc.status === 'scan_qr'" class="qr-container">
                  <div v-if="acc.qrCode" class="qr-box">
                    <img :src="acc.qrCode" alt="QR Code WhatsApp" class="qr-image" />
                    <div class="qr-instructions">
                      <p><strong>1.</strong> Abra o WhatsApp no celular</p>
                      <p><strong>2.</strong> Toque em <strong>Aparelhos conectados</strong></p>
                      <p><strong>3.</strong> Toque em <strong>Conectar um aparelho</strong> e aponte a câmera</p>
                    </div>
                  </div>
                  <div v-else class="qr-loading-box">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span>Gerando novo QR Code com segurança...</span>
                  </div>
                </div>

                <!-- Área de Ações do Card -->
                <div class="account-card-actions">
                  <button
                    v-if="acc.status !== 'connected'"
                    type="button"
                    class="btn-action-connect"
                    :class="{ 'btn-refresh': acc.status === 'scan_qr' }"
                    :disabled="connectingMap[acc.id] || acc.status === 'connecting'"
                    @click="connectAccount(acc)"
                  >
                    <i v-if="connectingMap[acc.id] || acc.status === 'connecting'" class="fa-solid fa-spinner fa-spin"></i>
                    <i v-else-if="acc.status === 'scan_qr'" class="fa-solid fa-rotate-right"></i>
                    <i v-else class="fa-solid fa-qrcode"></i>
                    <span>
                      {{ connectingMap[acc.id] || acc.status === 'connecting'
                        ? 'Iniciando conexão...'
                        : acc.status === 'scan_qr'
                        ? 'Atualizar QR Code'
                        : 'Reconectar e Gerar QR Code'
                      }}
                    </span>
                  </button>
                  <div v-else class="connected-feedback">
                    <i class="fa-solid fa-circle-check"></i> Conectado com sucesso!
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Rodapé do Modal -->
          <div class="wa-modal-footer">
            <span class="footer-help">
              <i class="fa-solid fa-circle-info"></i>
              Assim que o QR Code for escaneado no celular, a conexão será restabelecida automaticamente.
            </span>
            <button type="button" class="btn-close-modal" @click="closeModal">
              Fechar
            </button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { connectionsApi } from '@/api/connections.api'

const auth = useAuthStore()
const ui = useUiStore()

// ─── Estado do Componente ───────────────────────────────────────────────────
const bubbleEl = ref(null)
const dropZoneEl = ref(null)
const modalOpen = ref(false)
const showMessage = ref(true)
const isDismissed = ref(false)
const dismissedIds = ref(new Set())
const connectingMap = ref({})

// ─── Arrastar (Drag & Drop) ─────────────────────────────────────────────────
const isDragging = ref(false)
const isOverDropZone = ref(false)
const hasMoved = ref(false)
const posX = ref(0)
const posY = ref(0)
const dragStart = { x: 0, y: 0, posX: 0, posY: 0, time: 0 }
let messageTimer = null

// ─── Contas Desconectadas Elegíveis ─────────────────────────────────────────
const accounts = computed(() => ui.whatsappAccounts || [])

const eligibleAccounts = computed(() => {
  if (auth.isAdmin) {
    return accounts.value
  }
  // Atendente: apenas contas do departamento dele
  const userDepts = auth.departmentIds || []
  return accounts.value.filter(acc => {
    const d1 = acc.departmentId ? String(acc.departmentId) : null
    const d2 = acc.fallbackDepartmentId ? String(acc.fallbackDepartmentId) : null
    return (d1 && userDepts.includes(d1)) || (d2 && userDepts.includes(d2))
  })
})

const disconnectedAccounts = computed(() => {
  return eligibleAccounts.value.filter(acc => acc.status === 'disconnected' || acc.status === 'scan_qr' || acc.status === 'connecting')
})

const hasDisconnectedAccounts = computed(() => disconnectedAccounts.value.length > 0)

const isConnectingAny = computed(() => Object.values(connectingMap.value).some(Boolean))

// ─── Mensagem e Tooltip ─────────────────────────────────────────────────────
const alertMessageText = computed(() => {
  const list = disconnectedAccounts.value
  if (!list.length) return ''
  if (list.length === 1) {
    const acc = list[0]
    const dept = acc.departmentName || acc.fallbackDepartmentName
    return dept
      ? `O WhatsApp do setor ${dept} (${acc.name}) foi desconectado!`
      : `O WhatsApp "${acc.name}" foi desconectado!`
  }
  return `${list.length} contas do WhatsApp estão desconectadas no momento.`
})

const bubbleTooltip = computed(() => {
  return `${disconnectedAccounts.value.length} WhatsApp desconectado. Clique para reconectar.`
})

// ─── Posição do Balão e Alinhamento ─────────────────────────────────────────
const wrapperStyle = computed(() => {
  return {
    transform: `translate3d(${posX.value}px, ${posY.value}px, 0)`,
    touchAction: 'none'
  }
})

const messageSideClass = computed(() => {
  // Se a bolha estiver muito próxima da direita, joga a mensagem para a esquerda
  if (typeof window !== 'undefined' && posX.value > window.innerWidth / 2) {
    return 'side-left'
  }
  return 'side-right'
})

// ─── Ciclo de Vida e Vigilância ─────────────────────────────────────────────
watch(disconnectedAccounts, (newList, oldList) => {
  // Se novos IDs desconectados apareceram que não foram dispensados, reativa
  const currentIds = newList.map(a => a.id)
  const hasNewUnseen = currentIds.some(id => !dismissedIds.value.has(id))
  if (hasNewUnseen && newList.length > 0) {
    isDismissed.value = false
    triggerMessageBanner()
  } else if (newList.length === 0) {
    isDismissed.value = false
    modalOpen.value = false
    dismissedIds.value.clear()
  }
}, { deep: true })

onMounted(() => {
  resetToDefaultPosition()
  window.addEventListener('resize', handleWindowResize)
  if (hasDisconnectedAccounts.value) {
    triggerMessageBanner()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  clearTimeout(messageTimer)
})

function resetToDefaultPosition() {
  if (typeof window === 'undefined') return
  const size = 46
  const margin = 24
  posX.value = Math.max(16, window.innerWidth - size - margin)
  posY.value = Math.max(16, window.innerHeight - size - margin - 50) // acima do rodapé
}

function handleWindowResize() {
  if (isDragging.value) return
  const size = 46
  const margin = 16
  posX.value = Math.min(Math.max(margin, posX.value), window.innerWidth - size - margin)
  posY.value = Math.min(Math.max(margin, posY.value), window.innerHeight - size - margin)
}

function triggerMessageBanner() {
  showMessage.value = true
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    showMessage.value = false
  }, 6500)
}

// ─── Lógica de Drag & Drop e Descarte na Bolinha X ──────────────────────────
function handlePointerDown(e) {
  // Ignora se o clique veio do botão fechar da mensagem
  if (e.target.closest('.msg-close-btn')) return

  dragStart.x = e.clientX
  dragStart.y = e.clientY
  dragStart.posX = posX.value
  dragStart.posY = posY.value
  dragStart.time = Date.now()
  hasMoved.value = false
  isDragging.value = true
  isOverDropZone.value = false

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
}

function handlePointerMove(e) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y

  if (!hasMoved.value && Math.hypot(dx, dy) > 5) {
    hasMoved.value = true
    // Esconde o balão de mensagem ao arrastar
    showMessage.value = false
  }

  if (hasMoved.value) {
    const size = 46
    const margin = 8
    posX.value = Math.min(Math.max(margin, dragStart.posX + dx), window.innerWidth - size - margin)
    posY.value = Math.min(Math.max(margin, dragStart.posY + dy), window.innerHeight - size - margin)

    checkDropZoneProximity()
  }
}

function checkDropZoneProximity() {
  if (!dropZoneEl.value) {
    isOverDropZone.value = false
    return
  }
  const dropRect = dropZoneEl.value.getBoundingClientRect()
  const bubbleCenter = {
    x: posX.value + 23,
    y: posY.value + 23
  }
  const dropCenter = {
    x: dropRect.left + dropRect.width / 2,
    y: dropRect.top + dropRect.height / 2
  }
  const dist = Math.hypot(bubbleCenter.x - dropCenter.x, bubbleCenter.y - dropCenter.y)
  // Limite de 85px de raio para considerar que está sobre a bolinha X
  isOverDropZone.value = dist < 85
}

function handlePointerUp() {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)

  if (isOverDropZone.value) {
    // Descarte: marca os IDs atuais como dispensados e fecha a bolha
    for (const acc of disconnectedAccounts.value) {
      dismissedIds.value.add(acc.id)
    }
    isDismissed.value = true
    ui.showToast('Alerta de WhatsApp dispensado.', 'info', 2500)
  } else if (!hasMoved.value) {
    // Não arrastou: foi um clique normal! Abre o modal
    openModal()
  }

  isDragging.value = false
  isOverDropZone.value = false
}

// ─── Modal e Reconexão ──────────────────────────────────────────────────────
function openModal() {
  modalOpen.value = true
  showMessage.value = false
}

function closeModal() {
  modalOpen.value = false
}

async function connectAccount(account) {
  if (!account?.id) return
  connectingMap.value[account.id] = true
  try {
    const { data } = await connectionsApi.connectWhatsApp(account.id)
    if (data?.success) {
      ui.showToast(`Iniciando reconexão de "${account.name}".`, 'info', 3000)
    } else {
      ui.showToast(data?.error || 'Não foi possível reconectar.', 'error')
    }
  } catch (error) {
    const msg = error.response?.data?.error || error.message || 'Falha ao conectar.'
    ui.showToast(msg, 'error')
  } finally {
    connectingMap.value[account.id] = false
  }
}

async function reconnectAll() {
  for (const acc of disconnectedAccounts.value) {
    await connectAccount(acc)
  }
}

// ─── Utilitários de Formatação ──────────────────────────────────────────────
function statusLabel(status) {
  switch (status) {
    case 'connected': return 'Conectado'
    case 'scan_qr': return 'Aguardando leitura do QR Code'
    case 'connecting': return 'Conectando...'
    default: return 'Desconectado'
  }
}

function disconnectReasonLabel(reason) {
  switch (reason) {
    case 'connection_lost': return 'Conexão perdida'
    case 'device_logout': return 'Logout no aparelho'
    case 'manual_disconnect': return 'Desconectado manualmente'
    case 'initialization_error': return 'Falha ao iniciar'
    default: return 'Motivo não informado'
  }
}

function formatPhone(phone) {
  if (!phone) return ''
  const clean = String(phone).replace(/\D/g, '')
  if (clean.length === 13) {
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`
  }
  if (clean.length === 12) {
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`
  }
  return phone
}
</script>

<style scoped>
/* ─── Container Flutuante Geral ─────────────────────────────────────────── */
.floating-wa-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 99998;
}

/* ─── Wrapper da Bolha e do Balão de Mensagem ───────────────────────────── */
.floating-wa-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 46px;
  height: 46px;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
  transition: transform 0.05s linear;
}

.floating-wa-wrapper.is-dragging {
  cursor: grabbing !important;
  transition: none;
}

.floating-wa-wrapper.is-over-target .floating-wa-bubble {
  transform: scale(0.8);
  opacity: 0.7;
  filter: grayscale(80%);
}

/* ─── Bolha Circular do WhatsApp ─────────────────────────────────────────── */
.floating-wa-bubble {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
  border: 1.5px solid #ffffff;
  box-shadow: 0 4px 12px rgba(37, 211, 102, 0.35), 0 2px 6px rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: grab;
  padding: 0;
  color: #ffffff;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
  outline: none;
}

.floating-wa-bubble:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 16px rgba(37, 211, 102, 0.45), 0 3px 10px rgba(0, 0, 0, 0.18);
}

.floating-wa-bubble:active {
  transform: scale(0.96);
}

.wa-icon {
  font-size: 17px;
  color: #ffffff;
  position: relative;
  z-index: 2;
}

.wa-icon-glow {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(239, 68, 68, 0.35) 0%, rgba(239, 68, 68, 0) 70%);
  animation: pulse-ring 2s infinite cubic-bezier(0.215, 0.61, 0.355, 1);
  z-index: 1;
}

@keyframes pulse-ring {
  0% { transform: scale(0.9); opacity: 0.9; }
  70% { transform: scale(1.35); opacity: 0; }
  100% { transform: scale(1.35); opacity: 0; }
}

/* Badge de Alerta na Bolha */
.wa-alert-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #ef4444;
  color: #ffffff;
  font-size: 7.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ffffff;
  box-shadow: 0 1px 3px rgba(239, 68, 68, 0.4);
  z-index: 3;
}

/* ─── Balão / Toast Informativo Lateral ─────────────────────────────────── */
.floating-wa-message {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 280px;
  background: #ffffff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 10px 30px -4px rgba(0, 0, 0, 0.18), 0 4px 10px rgba(0, 0, 0, 0.08);
  border: 1px solid #fecaca;
  pointer-events: auto;
  cursor: pointer;
  z-index: 10;
}

.floating-wa-message.side-left {
  right: 58px;
}

.floating-wa-message.side-right {
  left: 58px;
}

.msg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.msg-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  display: inline-block;
  animation: blink-dot 1.2s infinite ease-in-out;
}

@keyframes blink-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.msg-header strong {
  font-size: 13px;
  color: #991b1b;
  font-weight: 700;
}

.msg-body {
  margin: 0 0 8px 0;
  font-size: 12px;
  line-height: 1.4;
  color: #374151;
}

.msg-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #f3f4f6;
  padding-top: 6px;
  margin-top: 4px;
}

.msg-action-label {
  font-size: 11px;
  color: #2563eb;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.msg-close-btn {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.msg-close-btn:hover {
  color: #4b5563;
  background: #f3f4f6;
}

/* Transições da Mensagem */
.wa-msg-slide-enter-active,
.wa-msg-slide-leave-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.wa-msg-slide-enter-from,
.wa-msg-slide-leave-to {
  opacity: 0;
  transform: translateY(-50%) scale(0.85);
}

/* ─── Bolinha "X" de Descarte (Rodapé Central) ─────────────────────────── */
.floating-wa-dropzone {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  z-index: 99999;
}

.dropzone-circle {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: rgba(31, 41, 55, 0.85);
  backdrop-filter: blur(8px);
  border: 2px dashed rgba(255, 255, 255, 0.5);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dropzone-label {
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  background: rgba(17, 24, 39, 0.8);
  padding: 3px 10px;
  border-radius: 12px;
  backdrop-filter: blur(4px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.floating-wa-dropzone.active .dropzone-circle {
  background: #dc2626;
  border: 2px solid #ffffff;
  transform: scale(1.22);
  box-shadow: 0 12px 30px rgba(220, 38, 38, 0.6);
}

.floating-wa-dropzone.active .dropzone-label {
  background: #b91c1c;
}

.drop-zone-fade-enter-active,
.drop-zone-fade-leave-active {
  transition: all 0.25s ease-out;
}

.drop-zone-fade-enter-from,
.drop-zone-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px) scale(0.85);
}

/* ─── Modal / Popup de Reconexão ─────────────────────────────────────────── */
.wa-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  pointer-events: auto;
  z-index: 100000;
}

.wa-modal-dialog {
  background: #ffffff;
  width: 100%;
  max-width: 580px;
  max-height: 90vh;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.wa-modal-header {
  padding: 18px 22px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wa-badge-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #dcfce7;
  color: #16a34a;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(22, 163, 74, 0.15);
}

.header-info h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}

.header-info p {
  margin: 2px 0 0 0;
  font-size: 12.5px;
  color: #64748b;
}

.btn-modal-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.15s;
}

.btn-modal-close:hover {
  background: #e2e8f0;
  color: #334155;
}

/* Corpo do Modal */
.wa-modal-body {
  padding: 20px 22px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.admin-reconnect-all {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 10px 14px;
  border-radius: 10px;
}

.reconnect-all-text {
  font-size: 13px;
  color: #991b1b;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-reconnect-all {
  background: #ef4444;
  color: #ffffff;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-reconnect-all:hover:not(:disabled) {
  background: #dc2626;
}

/* Cards das Contas */
.accounts-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.account-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: all 0.2s ease;
}

.account-card.has-qr {
  border-color: #22c55e;
  background: #f0fdf4;
}

.account-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #f1f5f9;
  color: #25D366;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-meta {
  flex: 1;
}

.account-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.account-title-row h4 {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  color: #1e293b;
}

.dept-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #e0f2fe;
  color: #0369a1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.account-sub {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  flex-wrap: wrap;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}

.status-indicator.disconnected {
  color: #dc2626;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.disconnect-reason {
  color: #b45309;
  font-size: 10px;
  font-weight: 600;
}

/* Área do QR Code */
.qr-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #ffffff;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #bbf7d0;
}

.qr-box {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  justify-content: center;
}

.qr-image {
  width: 170px;
  height: 170px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  padding: 4px;
  background: #ffffff;
}

.qr-instructions {
  font-size: 12.5px;
  color: #334155;
  line-height: 1.6;
}

.qr-instructions p {
  margin: 4px 0;
}

.qr-loading-box {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #059669;
  font-size: 13px;
  font-weight: 600;
  padding: 24px;
}

/* Ações */
.account-card-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-action-connect {
  background: #16a34a;
  color: #ffffff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s;
}

.btn-action-connect:hover:not(:disabled) {
  background: #15803d;
}

.btn-action-connect.btn-refresh {
  background: #2563eb;
}

.btn-action-connect.btn-refresh:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-action-connect:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.connected-feedback {
  color: #16a34a;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Rodapé do Modal */
.wa-modal-footer {
  padding: 14px 22px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.footer-help {
  font-size: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-close-modal {
  background: #e2e8f0;
  border: none;
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}

.btn-close-modal:hover {
  background: #cbd5e1;
}

/* Transição do Modal */
.wa-modal-fade-enter-active,
.wa-modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.wa-modal-fade-enter-from,
.wa-modal-fade-leave-to {
  opacity: 0;
}
</style>
