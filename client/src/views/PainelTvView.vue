<template>
  <main class="tv-dashboard" :class="[`health-${health.level}`, { 'new-ticket': newTicketAlert }]">
    <header class="tv-header">
      <div class="tv-brand">
        <img :src="logoUrl" alt="Brisoft Shop" />
        <div><span>Central de atendimento</span><strong>Painel operacional</strong></div>
      </div>

      <div class="tv-department">
        <span>Departamento</span>
        <select v-if="auth.isAdmin || auth.isSupervisor" v-model="selectedDepartmentId" @change="changeDepartment">
          <option v-for="department in departments" :key="department.id" :value="department.id">{{ department.name }}</option>
        </select>
        <strong v-else>{{ data?.department?.name || auth.departmentName || 'Departamento' }}</strong>
      </div>

      <div class="tv-header-status">
        <div class="tv-clock"><strong>{{ clock }}</strong><span>{{ dateLabel }}</span></div>
        <button type="button" class="tv-control" :class="{ active: audioReady }" @click="enableAudio" :title="audioReady ? 'Alertas sonoros ativos' : 'Ativar alertas sonoros'">
          <i :class="audioReady ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark'"></i>
          <span>{{ audioReady ? 'Alarme ativo' : 'Ativar alarme' }}</span>
        </button>
        <button v-if="auth.isAdmin" type="button" class="tv-icon-btn" title="Configurar painel" @click="openSettings"><i class="fa-solid fa-sliders"></i></button>
        <button type="button" class="tv-icon-btn" title="Tela cheia" @click="toggleFullscreen"><i :class="isFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand'"></i></button>
        <RouterLink to="/" class="tv-icon-btn" title="Voltar ao sistema"><i class="fa-solid fa-arrow-right-from-bracket"></i></RouterLink>
      </div>
    </header>

    <div v-if="error || !serverConnected" class="tv-offline-banner">
      <i class="fa-solid fa-triangle-exclamation"></i>
      {{ error || 'Conexão em tempo real interrompida. Tentando reconectar…' }}
    </div>

    <section v-if="loading && !data" class="tv-loading"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Preparando o painel do departamento…</span></section>

    <template v-else-if="data">
      <section class="tv-hero-row">
        <article class="tv-health-card">
          <span class="tv-health-icon"><i :class="healthIcon"></i></span>
          <div><small>Saúde do departamento</small><strong>{{ health.label }}</strong><p>{{ health.reason }}</p></div>
          <span class="tv-live"><i></i> AO VIVO</span>
        </article>

        <article class="tv-hero-metric waiting" :class="{ pulse: realtime.waiting > 0 }">
          <span><i class="fa-solid fa-users-line"></i> Na fila agora</span><strong>{{ realtime.waiting }}</strong><small>Mais antigo: {{ realtime.oldestWait }}</small>
        </article>
        <article class="tv-hero-metric handling"><span><i class="fa-solid fa-headset"></i> Em atendimento</span><strong>{{ realtime.handling }}</strong><small>{{ realtime.connectedUsers }} usuário(s) conectado(s)</small></article>
        <article class="tv-hero-metric sla"><span><i class="fa-solid fa-shield-halved"></i> SLA no mês</span><strong>{{ month.slaPercent }}%</strong><small>{{ realtime.slaAtRisk }} em risco · {{ realtime.slaBreached }} vencido(s)</small></article>
      </section>

      <section class="tv-kpi-row">
        <article><i class="fa-regular fa-comments blue"></i><div><span>Recebidos hoje</span><strong>{{ today.received }}</strong></div></article>
        <article><i class="fa-regular fa-circle-check green"></i><div><span>Concluídos hoje</span><strong>{{ today.completed }}</strong></div></article>
        <article><i class="fa-solid fa-calendar-days purple"></i><div><span>Recebidos no mês</span><strong>{{ month.received }}</strong></div></article>
        <article><i class="fa-solid fa-check-double teal"></i><div><span>Concluídos no mês</span><strong>{{ month.completed }}</strong></div></article>
        <article><i class="fa-regular fa-clock orange"></i><div><span>TMA no mês</span><strong>{{ compactTime(month.tma) }}</strong></div></article>
        <article><i class="fa-solid fa-hourglass-half cyan"></i><div><span>TME no mês</span><strong>{{ compactTime(month.tme) }}</strong></div></article>
        <article><i class="fa-solid fa-star yellow"></i><div><span>Avaliação média</span><strong>{{ month.ratingAverage == null ? '—' : `${month.ratingAverage} ★` }}</strong></div></article>
      </section>

      <section class="tv-content-grid">
        <article class="tv-panel tv-queue-panel">
          <div class="tv-panel-head"><div><span>Fila de espera</span><small>Clientes aguardando atendimento</small></div><strong>{{ realtime.waiting }}</strong></div>
          <div v-if="!realtime.queue.length" class="tv-empty queue-empty">
            <i class="fa-solid fa-circle-check"></i><strong>Nenhum cliente aguardando</strong><span>A fila está em dia.</span>
          </div>
          <div v-else class="tv-queue-list">
            <div v-for="(item, index) in realtime.queue" :key="item.protocol" class="tv-queue-item" :class="item.state">
              <span class="tv-queue-position">{{ index + 1 }}</span>
              <div><strong :title="item.clientName">{{ item.clientName }}</strong><small>Chamado #{{ item.protocol }} · {{ item.state === 'critical' ? 'SLA vencido' : item.state === 'warning' ? 'Próximo do SLA' : 'Dentro do prazo' }}</small></div>
              <span class="tv-queue-time">{{ item.wait }}</span>
              <div class="tv-sla-track"><i :style="{ width: `${Math.min(100, item.slaProgress)}%` }"></i></div>
            </div>
          </div>
          <p v-if="realtime.waiting > realtime.queue.length" class="tv-more">+ {{ realtime.waiting - realtime.queue.length }} atendimento(s) na fila</p>
        </article>

        <article class="tv-panel tv-volume-panel">
          <div class="tv-panel-head"><div><span>Movimento recente</span><small>Últimos 14 dias</small></div><div class="tv-legend"><i></i>Recebidos<i></i>Concluídos</div></div>
          <div class="tv-chart">
            <div v-for="point in trend" :key="point.day" class="tv-chart-column" :title="`Dia ${point.day}: ${point.created} recebidos e ${point.completed} concluídos`">
              <div>
                <b v-if="point.created" class="tv-chart-value received" :style="{ bottom: `calc(${chartHeight(point.created)} + 3px)` }">{{ point.created }}</b>
                <b v-if="point.completed" class="tv-chart-value completed" :style="{ bottom: `calc(${chartHeight(point.completed)} + 3px)` }">{{ point.completed }}</b>
                <i class="received" :style="{ height: chartHeight(point.created) }"></i><i class="completed" :style="{ height: chartHeight(point.completed) }"></i>
              </div>
              <span>{{ point.day }}</span>
            </div>
          </div>
          <div class="tv-chart-summary"><span><strong>{{ month.tme }}</strong>espera média</span><span><strong>{{ month.satisfactionPercent }}%</strong>satisfação</span><span><strong>{{ month.ratingCount }}</strong>avaliações</span></div>
        </article>

        <article class="tv-panel tv-goal-panel">
          <div class="tv-panel-head"><div><span>Ordens de serviço</span><small>Integração futura</small></div></div>
          <div class="tv-os-placeholder"><i class="fa-solid fa-screwdriver-wrench"></i><div><strong>—</strong><span>OSs abertas</span></div><small>Ainda não há uma fonte de ordens de serviço integrada.</small></div>
          <div class="tv-ranking">
            <div class="tv-ranking-title"><span>Ranking de atendentes</span><small>Hoje · atend. / nota</small></div>
            <div v-if="!agents.length" class="tv-ranking-empty">Sem atendimentos concluídos no período.</div>
            <div v-for="(agent, index) in agents.slice(0, 5)" :key="agent.id" class="tv-ranking-row">
              <b>{{ index + 1 }}º</b>
              <span class="tv-ranking-avatar"><img v-if="agent.avatarUrl" :src="agent.avatarUrl" :alt="`Foto de ${agent.name}`" /><b v-else>{{ agentInitials(agent.name) }}</b></span>
              <span class="tv-ranking-name" :title="agent.name">{{ agent.name }}</span>
              <span class="tv-ranking-rating" :title="agent.ratingCount ? `${agent.ratingCount} avaliação(ões) recebida(s) hoje` : 'Nenhuma avaliação recebida hoje'"><i class="fa-solid fa-star"></i>{{ agent.ratingAverage == null ? '—' : agent.ratingAverage }}</span>
              <strong :title="`${agent.completed} atendimento(s) concluído(s) hoje`">{{ agent.completed }}</strong>
            </div>
          </div>
          <div class="tv-whatsapp-status" :class="{ connected: realtime.whatsapp.connected }"><i class="fa-brands fa-whatsapp"></i><span><strong>{{ realtime.whatsapp.connected ? 'WhatsApp conectado' : 'WhatsApp desconectado' }}</strong><small>{{ realtime.whatsapp.connectedCount }} de {{ realtime.whatsapp.configuredCount }} conta(s) disponível(is)</small></span></div>
        </article>
      </section>

      <footer class="tv-footer">
        <span><i class="fa-solid fa-lock"></i> Painel protegido · acesso restrito à equipe</span>
        <span :class="{ stale: dataIsStale }"><i class="fa-solid fa-arrows-rotate" :class="{ 'fa-spin': refreshing }"></i> Atualizado {{ updatedAgo }}</span>
      </footer>
    </template>

    <div v-if="newTicketAlert" class="tv-new-ticket-alert"><i class="fa-solid fa-bell"></i><div><strong>Novo atendimento na fila</strong><span>Alarme acionado para o departamento.</span></div></div>

    <div v-if="showSettings" class="tv-modal-backdrop" @click.self="showSettings = false">
      <form class="tv-settings-modal" @submit.prevent="saveSettings">
        <div class="tv-settings-head"><div><strong>Configurar Painel TV</strong><span>{{ data?.department?.name }}</span></div><button type="button" @click="showSettings = false"><i class="fa-solid fa-xmark"></i></button></div>
        <label><span>Meta mensal de atendimentos concluídos</span><input v-model.number="settings.monthlyTarget" type="number" min="0" max="1000000" /></label>
        <label><span>Avisar quando atingir esta porcentagem do SLA</span><div class="tv-range"><input v-model.number="settings.warningSlaPercent" type="range" min="30" max="95" /><strong>{{ settings.warningSlaPercent }}%</strong></div></label>
        <label><span>Fila crítica a partir de</span><input v-model.number="settings.criticalQueueSize" type="number" min="1" max="1000" /></label>
        <label><span>Intervalo mínimo entre sons (segundos)</span><input v-model.number="settings.soundCooldownSeconds" type="number" min="3" max="120" /></label>
        <label class="tv-switch-label"><span><strong>Alarme de novos atendimentos</strong><small>Tocar um despertador sempre que a fila aumentar.</small></span><input v-model="settings.soundEnabled" type="checkbox" /></label>
        <div class="tv-settings-actions"><button type="button" @click="showSettings = false">Cancelar</button><button type="submit" :disabled="savingSettings"><i class="fa-solid fa-floppy-disk"></i> Salvar configurações</button></div>
      </form>
    </div>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { useSocket } from '@/composables/useSocket'
import { ticketsApi } from '@/api/tickets.api'
import { departmentsApi } from '@/api/departments.api'
import logoUrl from '@/assets/img/logo_tema_claro.png'

const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const { getSocket } = useSocket()
const data = ref(null)
const departments = ref([])
const selectedDepartmentId = ref(String(route.query.departmentId || auth.departmentId || ''))
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const serverConnected = ref(true)
const audioReady = ref(false)
const newTicketAlert = ref(false)
const isFullscreen = ref(Boolean(document.fullscreenElement))
const showSettings = ref(false)
const savingSettings = ref(false)
const now = ref(new Date())
const settings = reactive({ monthlyTarget: 0, soundEnabled: true, soundCooldownSeconds: 10, warningSlaPercent: 70, criticalQueueSize: 5 })
let pollTimer = null
let clockTimer = null
let refreshTimer = null
let alertTimer = null
let lastSoundAt = 0
let wakeLock = null
let audioContext = null
let waitingSnapshotReady = false
let lastWaitingCount = 0
let avatarDepartmentId = ''
let lastAvatarSyncAt = 0
const agentAvatarCache = new Map()

const health = computed(() => data.value?.health || { level: 'warning', label: 'Carregando', reason: 'Atualizando indicadores' })
const realtime = computed(() => data.value?.realtime || { waiting: 0, handling: 0, oldestWait: '00:00', slaAtRisk: 0, slaBreached: 0, connectedUsers: 0, queue: [], whatsapp: {} })
const today = computed(() => data.value?.today || { received: 0, completed: 0 })
const month = computed(() => data.value?.month || { received: 0, completed: 0, slaPercent: 0, ratingAverage: null, ratingCount: 0, satisfactionPercent: 0, target: 0, targetProgress: 0 })
const trend = computed(() => data.value?.trend || [])
const agents = computed(() => data.value?.agents || [])
const chartMaximum = computed(() => Math.max(1, ...trend.value.flatMap(point => [point.created, point.completed])))
const healthIcon = computed(() => health.value.level === 'healthy' ? 'fa-solid fa-heart-pulse' : health.value.level === 'warning' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-exclamation')
const clock = computed(() => now.value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
const dateLabel = computed(() => now.value.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))
const updatedAgo = computed(() => { const seconds = Math.max(0, Math.floor((now.value - new Date(data.value?.generatedAt || now.value)) / 1000)); return seconds < 5 ? 'agora' : `há ${seconds}s` })
const dataIsStale = computed(() => now.value - new Date(data.value?.generatedAt || now.value) > 60000)

function compactTime(value = '00:00:00') { const parts = value.split(':'); return parts[0] === '00' ? `${parts[1]}:${parts[2]}` : value }
function chartHeight(value) { return `${Math.max(value ? 8 : 2, (Number(value) / chartMaximum.value) * 100)}%` }
function agentInitials(name = '') { return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AT' }
function matchesDepartment(ticket) { return String(ticket?.department_id || '') === String(selectedDepartmentId.value) || String(ticket?.department || '').toLocaleLowerCase('pt-BR') === String(data.value?.department?.name || '').toLocaleLowerCase('pt-BR') }

async function loadDepartments() {
  if (!auth.isAdmin && !auth.isSupervisor) return
  const { data: response } = await departmentsApi.list()
  departments.value = response.departments || []
  if (!selectedDepartmentId.value && departments.value[0]) selectedDepartmentId.value = String(departments.value[0].id)
}

async function fetchData(force = false) {
  if (!selectedDepartmentId.value) return
  if (refreshing.value && !force) return
  refreshing.value = true
  try {
    const departmentKey = String(selectedDepartmentId.value)
    const includeAvatars = avatarDepartmentId !== departmentKey || Date.now() - lastAvatarSyncAt >= 60000
    const { data: response } = await ticketsApi.wallboard({ departmentId: selectedDepartmentId.value, force, includeAvatars })
    if (!response.success) throw new Error(response.error || 'Não foi possível carregar o painel.')
    for (const agent of response.wallboard?.agents || []) {
      const cacheKey = `${departmentKey}:${agent.id}`
      if (Object.prototype.hasOwnProperty.call(agent, 'avatarUrl')) {
        if (agent.avatarUrl) agentAvatarCache.set(cacheKey, agent.avatarUrl)
        else agentAvatarCache.delete(cacheKey)
      } else {
        agent.avatarUrl = agentAvatarCache.get(cacheKey) || null
      }
    }
    if (includeAvatars) {
      avatarDepartmentId = departmentKey
      lastAvatarSyncAt = Date.now()
    }
    const nextWaitingCount = Number(response.wallboard?.realtime?.waiting || 0)
    const queueIncreased = waitingSnapshotReady && nextWaitingCount > lastWaitingCount
    lastWaitingCount = nextWaitingCount
    waitingSnapshotReady = true
    data.value = response.wallboard
    if (queueIncreased) showNewTicket()
    error.value = ''
    serverConnected.value = true
  } catch (requestError) {
    error.value = requestError.response?.data?.error || requestError.message || 'Painel temporariamente indisponível.'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function changeDepartment() {
  await router.replace({ name: 'painel_tv', query: { departmentId: selectedDepartmentId.value } })
  loading.value = true
  waitingSnapshotReady = false
  lastWaitingCount = 0
  await fetchData(true)
}

function scheduleRefresh(force = true) {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => fetchData(force), 500)
}

function showNewTicket() {
  newTicketAlert.value = true
  clearTimeout(alertTimer)
  alertTimer = setTimeout(() => { newTicketAlert.value = false }, 7000)
  playAlert()
}

function playAlert(preview = false) {
  if (!audioReady.value || data.value?.config?.soundEnabled === false) return
  const cooldown = Number(data.value?.config?.soundCooldownSeconds || 10) * 1000
  if (!preview && Date.now() - lastSoundAt < cooldown) return
  if (!preview) lastSoundAt = Date.now()
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    audioContext ||= new AudioContext()
    const context = audioContext
    context.resume?.().catch(() => {})
    const tone = (frequency, start, duration = 0.28) => {
      const oscillator = context.createOscillator(); const gain = context.createGain()
      oscillator.connect(gain); gain.connect(context.destination)
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.025)
      gain.gain.setValueAtTime(0.5, start + duration - 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      oscillator.start(start); oscillator.stop(start + duration + 0.02)
    }
    const cycles = preview ? 1 : 6
    const start = context.currentTime + 0.04
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const offset = start + cycle * 1.05
      tone(880, offset)
      tone(660, offset + 0.36)
    }
  } catch (_) {}
}

async function enableAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    audioContext ||= new AudioContext()
    await audioContext.resume()
    audioReady.value = true
    playAlert(true)
    ui.showToast('Alarme ativado. Mantenha o volume da TV ligado.')
    await requestWakeLock()
  } catch (_) { ui.showToast('O navegador bloqueou o áudio. Verifique as permissões da página.', 'error') }
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen') } catch (_) {}
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    else await document.exitFullscreen()
  } catch (_) {}
}

function openSettings() { Object.assign(settings, data.value?.config || {}); showSettings.value = true }
async function saveSettings() {
  savingSettings.value = true
  try {
    await ticketsApi.saveWallboardConfig(selectedDepartmentId.value, { ...settings })
    showSettings.value = false
    await fetchData(true)
    ui.showToast('Configurações do painel salvas.')
  } catch (requestError) { ui.showToast(requestError.response?.data?.error || 'Não foi possível salvar as configurações.', 'error') }
  finally { savingSettings.value = false }
}

function bindSocket() {
  const socket = getSocket()
  if (!socket) return
  serverConnected.value = socket.connected
  socket.on('connect', onConnect); socket.on('disconnect', onDisconnect)
  socket.on('ticket_created', onTicketCreated)
  socket.on('ticket_updated', onTicketChanged); socket.on('queue_updated', onTicketChanged)
  socket.on('tickets_updated', onTicketChanged); socket.on('whatsapp_account_reconnected', onTicketChanged)
  socket.on('kpis_updated', onKpisUpdated); socket.on('whatsapp_status', onWhatsappStatus)
}
function unbindSocket() {
  const socket = getSocket(); if (!socket) return
  socket.off('connect', onConnect); socket.off('disconnect', onDisconnect)
  socket.off('ticket_created', onTicketCreated); socket.off('ticket_updated', onTicketChanged); socket.off('queue_updated', onTicketChanged)
  socket.off('tickets_updated', onTicketChanged); socket.off('whatsapp_account_reconnected', onTicketChanged)
  socket.off('kpis_updated', onKpisUpdated); socket.off('whatsapp_status', onWhatsappStatus)
}
function onConnect() { serverConnected.value = true; scheduleRefresh(true) }
function onDisconnect() { serverConnected.value = false }
function onTicketCreated({ ticket }) {
  if (!matchesDepartment(ticket)) return
  if (ticket.status === 'aguardando') {
    lastWaitingCount += 1
    showNewTicket()
  }
  scheduleRefresh(true)
}
function onTicketChanged({ ticket }) { if (matchesDepartment(ticket)) scheduleRefresh(true) }
function onKpisUpdated() { scheduleRefresh(true) }
function onWhatsappStatus() { scheduleRefresh(false) }
function onFullscreenChange() { isFullscreen.value = Boolean(document.fullscreenElement) }
async function onVisibilityChange() { if (document.visibilityState === 'visible' && audioReady.value) await requestWakeLock() }

onMounted(async () => {
  try { await loadDepartments(); await fetchData(true); bindSocket() }
  catch (mountError) { error.value = mountError.message; loading.value = false }
  clockTimer = setInterval(() => { now.value = new Date() }, 1000)
  pollTimer = setInterval(() => fetchData(false), 10000)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  unbindSocket(); clearInterval(clockTimer); clearInterval(pollTimer); clearTimeout(refreshTimer); clearTimeout(alertTimer)
  document.removeEventListener('fullscreenchange', onFullscreenChange); document.removeEventListener('visibilitychange', onVisibilityChange)
  wakeLock?.release?.().catch(() => {}); wakeLock = null
  audioContext?.close?.().catch(() => {}); audioContext = null
})
</script>
