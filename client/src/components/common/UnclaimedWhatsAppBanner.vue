<template>
  <div class="unclaimed-banner-wrapper" v-if="alerts.length > 0">
    <TransitionGroup name="unclaimed-card" tag="div" class="unclaimed-banner-list">
      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="unclaimed-card"
        @mouseenter="pauseTimer(alert)"
        @mouseleave="resumeTimer(alert)"
      >
        <!-- Ícone e Conteúdo -->
        <div class="unclaimed-card-body">
          <div class="unclaimed-badge-icon">
            <i class="fa-brands fa-whatsapp"></i>
            <span class="pulse-ring"></span>
          </div>

          <div class="unclaimed-content">
            <div class="unclaimed-top-row">
              <span class="unclaimed-tag">Atendimento no WhatsApp</span>
              <span v-if="alert.department" class="unclaimed-dept-tag">
                <i class="fa-solid fa-building"></i> {{ alert.department }}
              </span>
            </div>

            <p class="unclaimed-message">
              Conversa iniciada diretamente pelo aparelho para
              <strong class="client-name">{{ alert.clientName }}</strong>.
              Se você está realizando este atendimento, assuma-o na plataforma.
            </p>

            <div v-if="alert.preview" class="unclaimed-preview">
              <i class="fa-solid fa-quote-left"></i>
              <span>{{ alert.preview }}</span>
            </div>
          </div>

          <!-- Ações -->
          <div class="unclaimed-actions">
            <button
              type="button"
              class="btn-assume"
              :disabled="alert.isAssuming"
              @click="handleAssume(alert)"
              title="Assumir este atendimento agora"
            >
              <i class="fa-solid" :class="alert.isAssuming ? 'fa-spinner fa-spin' : 'fa-hand-pointer'"></i>
              <span>{{ alert.isAssuming ? 'Assumindo...' : 'Assumir' }}</span>
            </button>

            <button
              type="button"
              class="btn-view"
              @click="handleView(alert)"
              title="Abrir conversa"
            >
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
              <span>Ver</span>
            </button>

            <button
              type="button"
              class="btn-dismiss"
              @click="dismissAlert(alert.id)"
              title="Dispensar aviso"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Barra de Progresso do Tempo -->
        <div class="unclaimed-progress-track">
          <div
            class="unclaimed-progress-bar"
            :style="{
              animationDuration: `${alert.durationMs}ms`,
              animationPlayState: alert.isPaused ? 'paused' : 'running'
            }"
          ></div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSocket } from '@/composables/useSocket'
import { useAuthStore } from '@/stores/auth.store'
import { useTicketStore } from '@/stores/tickets.store'
import { useUiStore } from '@/stores/ui.store'
import { sharedAudioContext } from '@/utils/notification-sound'

const router = useRouter()
const socket = useSocket()
const auth = useAuthStore()
const ticketStore = useTicketStore()
const ui = useUiStore()

const alerts = ref([])
const DEFAULT_DURATION = 9000 // 9 segundos

function isRelevantForUser(alert) {
  if (auth.isAdmin) return true
  if (auth.isSupervisor && alert.departmentId && auth.departmentIds?.includes(String(alert.departmentId))) return true
  if (auth.departmentId && alert.departmentId && String(auth.departmentId) === String(alert.departmentId)) return true
  if (auth.departmentName && alert.department && auth.departmentName.toLowerCase() === alert.department.toLowerCase()) return true
  if (!alert.departmentId && !alert.department) return true
  return false
}

function playAlertChime() {
  try {
    const ctx = sharedAudioContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    const t = ctx.currentTime
    osc.frequency.setValueAtTime(880, t)
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08)
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.linearRampToValueAtTime(0.2, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11)
    osc.start(t)
    osc.stop(t + 0.12)
  } catch {}
}

function handleSocketAlert(data) {
  if (!data?.ticketId) return
  if (!isRelevantForUser(data)) return

  // Se o próprio usuário logado já estiver com este ticket assumido, ignora
  if (ticketStore.activeTicket?.id === data.ticketId && ticketStore.activeTicket?.user_id === auth.user?.id) {
    return
  }

  // Remove duplicata antiga deste ticket se já estiver na lista
  dismissAlert(data.ticketId, true)

  const alertItem = {
    id: data.ticketId,
    ticketId: data.ticketId,
    clientName: data.clientName || 'Cliente',
    department: data.department || null,
    departmentId: data.departmentId || null,
    preview: data.preview ? String(data.preview).slice(0, 80) : '',
    durationMs: DEFAULT_DURATION,
    remainingMs: DEFAULT_DURATION,
    startTime: Date.now(),
    timerId: null,
    isPaused: false,
    isAssuming: false
  }

  alertItem.timerId = setTimeout(() => {
    dismissAlert(alertItem.id)
  }, DEFAULT_DURATION)

  // Limita a 3 banners visíveis por vez
  if (alerts.value.length >= 3) {
    const oldest = alerts.value.shift()
    if (oldest?.timerId) clearTimeout(oldest.timerId)
  }

  alerts.value.push(alertItem)
  playAlertChime()
}

function pauseTimer(alert) {
  if (alert.isPaused) return
  alert.isPaused = true
  if (alert.timerId) {
    clearTimeout(alert.timerId)
    alert.timerId = null
  }
  const elapsed = Date.now() - alert.startTime
  alert.remainingMs = Math.max(1000, alert.durationMs - elapsed)
}

function resumeTimer(alert) {
  if (!alert.isPaused) return
  alert.isPaused = false
  alert.startTime = Date.now()
  alert.timerId = setTimeout(() => {
    dismissAlert(alert.id)
  }, alert.remainingMs)
}

function dismissAlert(alertId, matchTicketId = false) {
  const idx = alerts.value.findIndex(a => (matchTicketId ? a.ticketId === alertId : a.id === alertId))
  if (idx !== -1) {
    const item = alerts.value[idx]
    if (item.timerId) clearTimeout(item.timerId)
    alerts.value.splice(idx, 1)
  }
}

async function handleAssume(alert) {
  if (alert.isAssuming) return
  alert.isAssuming = true
  try {
    const res = await ticketStore.assume(alert.ticketId)
    if (res.success) {
      ui.showToast(`✅ Você assumiu o atendimento de ${alert.clientName}!`)
      dismissAlert(alert.id)
      if (router.currentRoute.value.path !== '/atendimentos') {
        await router.push({ path: '/atendimentos', query: { ticketId: alert.ticketId } })
      }
      await ticketStore.selectTicket(alert.ticketId)
    } else {
      ui.showToast(`⚠️ ${res.error || 'Não foi possível assumir o atendimento.'}`, 'error')
    }
  } catch (err) {
    ui.showToast(`⚠️ Erro ao assumir: ${err.message}`, 'error')
  } finally {
    alert.isAssuming = false
  }
}

async function handleView(alert) {
  dismissAlert(alert.id)
  if (router.currentRoute.value.path !== '/atendimentos') {
    await router.push({ path: '/atendimentos', query: { ticketId: alert.ticketId } })
  }
  await ticketStore.selectTicket(alert.ticketId)
}

let socketInstance = null

onMounted(() => {
  socketInstance = socket.getSocket()
  if (socketInstance) {
    socketInstance.on('unclaimed_whatsapp_activity', handleSocketAlert)
  }
})

onUnmounted(() => {
  if (socketInstance) {
    socketInstance.off('unclaimed_whatsapp_activity', handleSocketAlert)
  }
  alerts.value.forEach(a => {
    if (a.timerId) clearTimeout(a.timerId)
  })
  alerts.value = []
})
</script>

<style scoped>
.unclaimed-banner-wrapper {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 92%;
  max-width: 620px;
  pointer-events: none;
}

.unclaimed-banner-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.unclaimed-card {
  pointer-events: auto;
  position: relative;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  border-left: 4px solid #25d366;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.unclaimed-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 42px rgba(15, 23, 42, 0.22), 0 6px 16px rgba(0, 0, 0, 0.1);
}

.unclaimed-card-body {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.unclaimed-badge-icon {
  position: relative;
  width: 38px;
  height: 38px;
  min-width: 38px;
  background: #25d366;
  color: #ffffff;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: 0 3px 10px rgba(37, 211, 102, 0.35);
}

.pulse-ring {
  position: absolute;
  inset: -3px;
  border-radius: 12px;
  border: 2px solid rgba(37, 211, 102, 0.6);
  animation: pulseEffect 2s infinite;
}

@keyframes pulseEffect {
  0% {
    transform: scale(0.95);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.15);
    opacity: 0;
  }
  100% {
    transform: scale(0.95);
    opacity: 0;
  }
}

.unclaimed-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.unclaimed-top-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.unclaimed-tag {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #15803d;
  background: #dcfce7;
  padding: 1px 6px;
  border-radius: 4px;
}

.unclaimed-dept-tag {
  font-size: 10.5px;
  font-weight: 600;
  color: #475569;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.unclaimed-message {
  margin: 0;
  font-size: 12.5px;
  color: #334155;
  line-height: 1.35;
}

.client-name {
  color: #0f172a;
  font-weight: 700;
}

.unclaimed-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #64748b;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

.unclaimed-preview i {
  font-size: 9px;
  opacity: 0.6;
}

.unclaimed-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-assume {
  height: 32px;
  padding: 0 12px;
  background: #1f62d0;
  color: #ffffff;
  border: none;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(31, 98, 208, 0.28);
  transition: all 0.15s ease;
}

.btn-assume:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
}

.btn-assume:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.btn-view {
  height: 32px;
  padding: 0 10px;
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-view:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.btn-dismiss {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-dismiss:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* Barra de progresso decrescente */
.unclaimed-progress-track {
  width: 100%;
  height: 3.5px;
  background: #f1f5f9;
  position: relative;
  overflow: hidden;
}

.unclaimed-progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, #25d366, #10b981);
  animation-name: progressDecrease;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes progressDecrease {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

/* Transições de animação de entrada e saída */
.unclaimed-card-enter-active {
  transition: all 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}

.unclaimed-card-leave-active {
  transition: all 0.24s cubic-bezier(0.4, 0, 1, 1);
}

.unclaimed-card-enter-from {
  opacity: 0;
  transform: translateY(-26px) scale(0.94);
}

.unclaimed-card-leave-to {
  opacity: 0;
  transform: translateY(-18px) scale(0.96);
}
</style>
