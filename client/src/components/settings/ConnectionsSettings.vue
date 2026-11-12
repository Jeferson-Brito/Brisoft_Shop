<template>
  <div style="display:flex;flex-direction:column;gap:16px;">
    <section v-if="auth.isAdmin" class="connection-card">
      <button class="connection-summary" type="button" @click="toggleServer">
        <span class="connection-icon server"><i class="fa-solid fa-server"></i></span>
        <span style="flex:1;text-align:left;">
          <strong>Servidor do Brisoft Shop</strong>
          <small>Estado, consumo e registros de execução</small>
        </span>
        <span class="connection-status" :class="ui.serverOnline ? 'connected' : 'disconnected'">
          {{ ui.serverOnline ? 'Online' : 'Offline' }}
        </span>
        <i class="fa-solid fa-chevron-down" :style="{ transform: serverExpanded ? 'rotate(180deg)' : '' }"></i>
      </button>

      <div v-if="serverExpanded" class="connection-details">
        <div v-if="serverInfo" class="server-info-grid">
          <div><span>Iniciado em</span><strong>{{ formatDate(serverInfo.startedAt) }}</strong></div>
          <div><span>Tempo ativo</span><strong>{{ formatUptime(serverInfo.uptimeSeconds) }}</strong></div>
          <div><span>Memória</span><strong>{{ serverInfo.memoryMb }} MB</strong></div>
          <div><span>Node.js</span><strong>{{ serverInfo.nodeVersion }}</strong></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px;">
          <strong style="font-size:12px;">Logs do servidor</strong>
          <div style="display:flex;gap:6px;">
            <button class="btn-secondary" type="button" @click="loadServerData"><i class="fa-solid fa-rotate"></i> Atualizar</button>
            <button class="btn-secondary" type="button" @click="clearLogs"><i class="fa-solid fa-broom"></i> Limpar</button>
          </div>
        </div>
        <div class="log-viewer">
          <div v-if="logs.length === 0" class="empty-text">Nenhum log registrado nesta execução.</div>
          <div v-for="entry in logs" :key="entry.id" class="log-entry" :class="entry.level">
            <time>{{ formatLogTime(entry.timestamp) }}</time>
            <span class="log-level">{{ entry.level }}</span>
            <span>{{ entry.message }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="connection-card">
      <div class="connection-summary" style="cursor:default;">
        <span class="connection-icon whatsapp"><i class="fa-brands fa-whatsapp"></i></span>
        <span style="flex:1;">
          <strong>Contas do WhatsApp</strong>
          <small>{{ connectedCount }} conectada(s) de {{ accounts.length }} cadastrada(s)</small>
        </span>
        <button class="btn-primary" type="button" @click="showNewAccount = !showNewAccount">
          <i class="fa-solid fa-plus"></i> Adicionar WhatsApp
        </button>
      </div>

      <div class="connection-details">
        <form v-if="showNewAccount" class="new-account-form" @submit.prevent="createAccount">
          <div style="flex:1;">
            <label>Nome para identificar este número</label>
            <input v-model="newAccountName" maxlength="80" placeholder="Ex.: Comercial, Suporte ou Unidade Centro" autofocus />
          </div>
          <div style="flex:1;">
            <label>Departamento padrão deste número</label>
            <select v-model="newAccountFallbackDepartmentId">
              <option v-if="auth.isAdmin" value="">Usar o padrão geral do bot</option>
              <option v-for="dept in availableDepartments" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
            </select>
          </div>
          <button class="btn-primary" :disabled="busy" type="submit">Criar e gerar QR Code</button>
          <button class="btn-secondary" type="button" @click="showNewAccount = false">Cancelar</button>
        </form>

        <div v-if="accounts.length === 0" class="empty-accounts">
          <i class="fa-brands fa-whatsapp"></i>
          <strong>Nenhum WhatsApp configurado</strong>
          <span>Adicione uma conta para começar a receber atendimentos.</span>
        </div>

        <div v-else class="accounts-list">
          <article v-for="account in accounts" :key="account.id" class="account-item" :class="{ expanded: selectedAccountId === account.id }">
            <button class="account-summary" type="button" @click="selectAccount(account.id)">
              <span class="account-avatar"><i class="fa-brands fa-whatsapp"></i></span>
              <span style="flex:1;text-align:left;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <strong>{{ account.name }}</strong>
                  <span v-if="account.routingMode === 'department'" class="routing-badge dedicated" :title="'Vinculado ao departamento ' + (account.departmentName || 'Dedicado')">
                    <i class="fa-solid fa-building-user"></i> {{ account.departmentName || 'Dedicado' }}
                  </span>
                  <span v-else class="routing-badge general" title="Menu com opções de departamentos">
                    <i class="fa-solid fa-layer-group"></i> Geral (Menu)
                  </span>
                  <span v-if="account.routingMode !== 'department' && account.fallbackDepartmentName" class="routing-badge fallback" :title="'Conversas pelo celular: ' + account.fallbackDepartmentName">
                    <i class="fa-solid fa-mobile-screen"></i> {{ account.fallbackDepartmentName }}
                  </span>
                </div>
                <small>{{ account.phone ? formatPhone(account.phone) : accountStatusLabel(account.status) }}</small>
              </span>
              <span class="connection-status" :class="statusClass(account.status)">{{ accountStatusLabel(account.status) }}</span>
              <i class="fa-solid fa-chevron-down" :style="{ transform: selectedAccountId === account.id ? 'rotate(180deg)' : '' }"></i>
            </button>

            <div v-if="selectedAccountId === account.id" class="account-details">
              <div class="account-data">
                <div><span>Identificação</span><strong>{{ account.displayName || account.name }}</strong></div>
                <div><span>Número conectado</span><strong>{{ account.phone ? formatPhone(account.phone) : 'Ainda não conectado' }}</strong></div>
                <div><span>Última conexão</span><strong>{{ account.lastConnectedAt ? formatDate(account.lastConnectedAt) : '—' }}</strong></div>
                <div><span>Última desconexão</span><strong>{{ account.lastDisconnectedAt ? formatDate(account.lastDisconnectedAt) : '—' }}</strong></div>
                <div><span>Motivo</span><strong>{{ disconnectReasonLabel(account.disconnectReason) }}</strong></div>
                <div><span>Tentativas de reconexão</span><strong>{{ account.reconnectAttempts || 0 }}</strong></div>
              </div>

              <!-- Configuração de Roteamento / Departamento -->
              <div class="routing-settings-box">
                <div class="routing-settings-header">
                  <span class="routing-icon"><i class="fa-solid fa-route"></i></span>
                  <div>
                    <strong>Roteamento de Atendimentos deste WhatsApp</strong>
                    <small>Configure se as mensagens recebidas por este número abrem o menu geral ou caem direto em um departamento.</small>
                  </div>
                </div>

                <div v-if="routingDrafts[account.id]" class="routing-modes-grid">
                  <label class="routing-mode-card" :class="{ selected: routingDrafts[account.id].routingMode === 'general' }">
                    <input type="radio" :name="'routing_' + account.id" value="general" v-model="routingDrafts[account.id].routingMode" />
                    <div class="mode-info">
                      <div class="mode-title">
                        <i class="fa-solid fa-layer-group"></i>
                        <span>Atendimento Geral (Padrão)</span>
                      </div>
                      <p class="mode-desc">O bot envia mensagem de boas-vindas com o menu interativo para o cliente escolher o departamento.</p>
                    </div>
                  </label>

                  <label class="routing-mode-card" :class="{ selected: routingDrafts[account.id].routingMode === 'department' }">
                    <input type="radio" :name="'routing_' + account.id" value="department" v-model="routingDrafts[account.id].routingMode" />
                    <div class="mode-info">
                      <div class="mode-title">
                        <i class="fa-solid fa-building-user"></i>
                        <span>Atendimento Dedicado (Fila Direta)</span>
                      </div>
                      <p class="mode-desc">O bot identifica o cliente e encaminha para o departamento vinculado, sem pedir que ele escolha outro setor.</p>
                    </div>
                  </label>
                </div>

                <div v-if="routingDrafts[account.id]?.routingMode === 'department'" class="department-picker-row">
                  <label for="dept-select">
                    <i class="fa-solid fa-arrow-turn-down-right"></i> Departamento Destino:
                  </label>
                  <select id="dept-select" v-model="routingDrafts[account.id].departmentId" class="dept-select">
                    <option value="" disabled>Selecione um departamento...</option>
                    <option v-for="dept in availableDepartments" :key="dept.id" :value="dept.id">
                      {{ dept.name }}
                    </option>
                  </select>
                </div>
                <div v-else class="department-picker-row fallback-picker">
                  <label :for="`fallback-${account.id}`"><i class="fa-solid fa-mobile-screen"></i> Conversas feitas pelo celular:</label>
                  <select :id="`fallback-${account.id}`" v-model="routingDrafts[account.id].fallbackDepartmentId" class="dept-select">
                    <option v-if="auth.isAdmin" value="">Usar o departamento padrão geral do bot</option>
                    <option v-for="dept in availableDepartments" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
                  </select>
                  <small>Este destino é individual para este número e tem prioridade sobre o padrão do bot.</small>
                </div>

                <div class="routing-footer">
                  <button
                    class="btn-primary"
                    :disabled="savingRouting[account.id]"
                    type="button"
                    @click="saveRouting(account)"
                  >
                    <i v-if="savingRouting[account.id]" class="fa-solid fa-spinner fa-spin"></i>
                    <i v-else class="fa-solid fa-floppy-disk"></i>
                    Salvar Roteamento
                  </button>
                  <span v-if="isRoutingModified(account)" class="unsaved-badge">
                    <i class="fa-solid fa-circle-exclamation"></i> Alterações pendentes
                  </span>
                </div>
              </div>

              <div v-if="account.status === 'scan_qr'" class="qr-area">
                <img v-if="account.qrCode" :src="account.qrCode" alt="QR Code para conectar WhatsApp" />
                <div v-else class="qr-loading"><i class="fa-solid fa-spinner fa-spin"></i> Gerando QR Code...</div>
                <p>Abra o WhatsApp no celular, acesse <strong>Aparelhos conectados</strong> e escaneie o código.</p>
              </div>

              <div class="account-actions">
                <button v-if="account.status === 'connected'" class="btn-danger-soft" :disabled="busy" type="button" @click="disconnectAccount(account)">
                  <i class="fa-solid fa-link-slash"></i> Desconectar número
                </button>
                <button v-else class="btn-primary" :disabled="busy || account.status === 'connecting'" type="button" @click="connectAccount(account)">
                  <i class="fa-solid fa-qrcode"></i> {{ account.status === 'scan_qr' ? 'Gerar novo QR Code' : 'Conectar número' }}
                </button>
                <button class="btn-secondary" :disabled="busy" type="button" @click="removeAccount(account)">
                  <i class="fa-solid fa-trash"></i> Remover conta
                </button>
              </div>
              <p class="disconnect-warning">Ao desconectar, as conversas permanecerão na fila pelo tempo de retenção configurado (com envio temporariamente bloqueado até a reconexão) e serão descartadas apenas se o prazo limite for atingido.</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Seção: Regras de Desconexão e Retenção de Fila -->
    <section v-if="auth.isAdmin" class="connection-card">
      <div class="connection-summary" style="cursor:default;">
        <span class="connection-icon" style="background:#fef3c7;color:#d97706;">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </span>
        <span style="flex:1;text-align:left;">
          <strong>Regras de Desconexão e Retenção do WhatsApp</strong>
          <small>Defina quanto tempo os chats continuam na fila e quando devem ser descartados se não houver reconexão</small>
        </span>
        <button
          class="btn-primary"
          :disabled="savingDisconnectRules"
          type="button"
          @click="saveDisconnectRules"
        >
          <i v-if="savingDisconnectRules" class="fa-solid fa-spinner fa-spin"></i>
          <i v-else class="fa-solid fa-floppy-disk"></i>
          Salvar Regras
        </button>
      </div>

      <div class="connection-details">
        <div class="rules-grid">
          <div class="rule-field">
            <label>
              <i class="fa-solid fa-hourglass-half"></i> Tempo das conversas na fila após desconexão
            </label>
            <select v-model.number="disconnectRules.queue_retention_minutes" class="rule-select">
              <option :value="15">15 minutos</option>
              <option :value="30">30 minutos</option>
              <option :value="60">1 hora (Padrão)</option>
              <option :value="120">2 horas</option>
              <option :value="240">4 horas</option>
              <option :value="480">8 horas</option>
              <option :value="1440">24 horas</option>
            </select>
            <small>Durante este período, os chats continuam na fila (com envio de mensagens pausado até o WhatsApp ser reconectado).</small>
          </div>

          <div class="rule-field">
            <label>
              <i class="fa-solid fa-calendar-xmark"></i> Prazo limite para descarte definitivo
            </label>
            <select v-model.number="disconnectRules.discard_hours" class="rule-select">
              <option :value="6">6 horas</option>
              <option :value="12">12 horas</option>
              <option :value="24">24 horas (Padrão)</option>
              <option :value="48">48 horas (2 dias)</option>
              <option :value="72">72 horas (3 dias)</option>
              <option :value="168">7 dias</option>
            </select>
            <small>Após sair da fila, as conversas continuam salvas. Se a reconexão ocorrer dentro deste prazo, elas retornam atualizadas. Após este prazo, os atendimentos e grupos são encerrados definitivamente.</small>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { connectionsApi } from '@/api/connections.api'
import { departmentsApi } from '@/api/departments.api'
import { settingsApi } from '@/api/settings.api'
import { useUiStore } from '@/stores/ui.store'
import { useAuthStore } from '@/stores/auth.store'

const ui = useUiStore()
const auth = useAuthStore()
const serverExpanded = ref(false)
const serverInfo = ref(null)
const logs = ref([])
const showNewAccount = ref(false)
const newAccountName = ref('')
const newAccountFallbackDepartmentId = ref('')
const selectedAccountId = ref(null)
const busy = ref(false)
const departments = ref([])
const routingDrafts = ref({})
const savingRouting = ref({})
const savingDisconnectRules = ref(false)
const disconnectRules = ref({
  queue_retention_minutes: 60,
  discard_hours: 24
})
let refreshTimer = null

const accounts = computed(() => ui.whatsappAccounts)
const connectedCount = computed(() => accounts.value.filter(account => account.status === 'connected').length)

const availableDepartments = computed(() => {
  if (auth.isAdmin) return departments.value
  const userDepts = [
    ...(Array.isArray(auth.user?.department_ids) ? auth.user.department_ids : []),
    auth.user?.department_id
  ].filter(Boolean).map(String)
  if (!userDepts.length) return departments.value
  return departments.value.filter(d => userDepts.includes(String(d.id)))
})

watch(accounts, (newAccounts) => {
  if (selectedAccountId.value && !newAccounts.some(account => account.id === selectedAccountId.value)) {
    selectedAccountId.value = null
  }
  // Sincroniza rascunhos de roteamento para contas novas ou que não foram editadas
  for (const account of newAccounts) {
    if (!routingDrafts.value[account.id]) {
      initDraft(account)
    }
  }
}, { deep: true })

function initDraft(account) {
  const defaultDept = availableDepartments.value[0]?.id || departments.value[0]?.id || ''
  routingDrafts.value[account.id] = {
    routingMode: account.routingMode || 'general',
    departmentId: account.departmentId || defaultDept,
    fallbackDepartmentId: account.fallbackDepartmentId || ''
  }
}

async function loadDepartments() {
  try {
    const { data } = await departmentsApi.list()
    if (data?.departments) {
      departments.value = data.departments
    }
  } catch (error) {
    console.warn('Falha ao carregar departamentos:', error)
  }
}

async function loadAccounts({ forceDraftSync = false } = {}) {
  const modifiedDraftIds = new Set(
    accounts.value.filter(account => isRoutingModified(account)).map(account => String(account.id))
  )
  const { data } = await connectionsApi.listWhatsApp()
  if (data.success) {
    ui.whatsappAccounts = data.accounts || []
    for (const account of ui.whatsappAccounts) {
      if (forceDraftSync || !routingDrafts.value[account.id] || !modifiedDraftIds.has(String(account.id))) initDraft(account)
    }
  }
}

async function toggleServer() {
  serverExpanded.value = !serverExpanded.value
  if (serverExpanded.value) await loadServerData()
}

async function loadServerData() {
  try {
    const [statusResponse, logsResponse] = await Promise.all([connectionsApi.serverStatus(), connectionsApi.serverLogs()])
    serverInfo.value = statusResponse.data
    logs.value = logsResponse.data.logs || []
  } catch { ui.showToast('Não foi possível carregar os dados do servidor.', 'error') }
}

async function clearLogs() {
  await connectionsApi.clearServerLogs()
  await loadServerData()
}

function selectAccount(id) {
  selectedAccountId.value = selectedAccountId.value === id ? null : id
  const target = accounts.value.find(a => a.id === id)
  if (target && !routingDrafts.value[id]) {
    initDraft(target)
  }
}

function isRoutingModified(account) {
  const draft = routingDrafts.value[account.id]
  if (!draft) return false
  const currentMode = account.routingMode || 'general'
  const currentDept = account.departmentId || ''
  if (draft.routingMode !== currentMode) return true
  if (draft.routingMode === 'department' && draft.departmentId !== currentDept) return true
  if (draft.routingMode !== 'department' && draft.fallbackDepartmentId !== (account.fallbackDepartmentId || '')) return true
  return false
}

async function saveRouting(account) {
  const draft = routingDrafts.value[account.id]
  if (!draft) return
  if (draft.routingMode === 'department' && !draft.departmentId) {
    return ui.showToast('Selecione um departamento para o modo dedicado.', 'error')
  }
  savingRouting.value[account.id] = true
  try {
    const selectedDeptObj = departments.value.find(d => String(d.id) === String(draft.departmentId))
    const fallbackDeptObj = departments.value.find(d => String(d.id) === String(draft.fallbackDepartmentId))
    const payload = {
      routing_mode: draft.routingMode,
      department_id: draft.routingMode === 'department' ? draft.departmentId : null,
      department_name: draft.routingMode === 'department' ? (selectedDeptObj?.name || null) : null,
      fallback_department_id: draft.routingMode === 'department' ? null : (draft.fallbackDepartmentId || null),
      fallback_department_name: draft.routingMode === 'department' ? null : (fallbackDeptObj?.name || null)
    }
    const { data } = await connectionsApi.updateWhatsApp(account.id, payload)
    if (data.success) {
      ui.showToast('Roteamento do WhatsApp atualizado com sucesso!')
      await loadAccounts({ forceDraftSync: true })
    }
  } catch (error) {
    ui.showToast(error.response?.data?.error || 'Erro ao atualizar roteamento do WhatsApp.', 'error')
  } finally {
    savingRouting.value[account.id] = false
  }
}

async function createAccount() {
  if (!newAccountName.value.trim()) return ui.showToast('Informe um nome para a conta.', 'error')
  busy.value = true
  try {
    const fallbackDept = departments.value.find(d => String(d.id) === String(newAccountFallbackDepartmentId.value))
    const { data } = await connectionsApi.createWhatsApp({
      name: newAccountName.value.trim(),
      fallback_department_id: newAccountFallbackDepartmentId.value || null,
      fallback_department_name: fallbackDept?.name || null
    })
    await loadAccounts()
    selectedAccountId.value = data.account.id
    newAccountName.value = ''
    newAccountFallbackDepartmentId.value = ''
    showNewAccount.value = false
    ui.showToast('Conta criada. Escaneie o QR Code para conectar.')
  } catch (error) { ui.showToast(error.response?.data?.error || 'Erro ao criar conta.', 'error') }
  finally { busy.value = false }
}

async function connectAccount(account) {
  busy.value = true
  try { await connectionsApi.connectWhatsApp(account.id); await loadAccounts(); selectedAccountId.value = account.id }
  catch (error) { ui.showToast(error.response?.data?.error || 'Erro ao conectar conta.', 'error') }
  finally { busy.value = false }
}

async function disconnectAccount(account) {
  if (!confirm(`Desconectar o número ${account.phone ? formatPhone(account.phone) : account.name}?`)) return
  busy.value = true
  try { await connectionsApi.disconnectWhatsApp(account.id); await loadAccounts(); ui.showToast('WhatsApp desconectado.') }
  catch (error) { ui.showToast(error.response?.data?.error || 'Erro ao desconectar conta.', 'error') }
  finally { busy.value = false }
}

async function removeAccount(account) {
  if (!confirm(`Remover a conta “${account.name}”? Os históricos serão preservados.`)) return
  busy.value = true
  try { await connectionsApi.removeWhatsApp(account.id); await loadAccounts(); ui.showToast('Conta removida.') }
  catch (error) { ui.showToast(error.response?.data?.error || 'Erro ao remover conta.', 'error') }
  finally { busy.value = false }
}

function accountStatusLabel(status) {
  return ({ connected: 'Conectado', scan_qr: 'Aguardando QR Code', connecting: 'Conectando', disconnected: 'Desconectado' })[status] || 'Desconectado'
}
function disconnectReasonLabel(reason) {
  return ({ connection_lost: 'Conexão perdida', device_logout: 'Logout no aparelho', manual_disconnect: 'Desconectado manualmente', initialization_error: 'Falha ao iniciar' })[reason] || '—'
}
function statusClass(status) { return status === 'connected' ? 'connected' : status === 'scan_qr' || status === 'connecting' ? 'pending' : 'disconnected' }
function formatDate(value) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
function formatLogTime(value) { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) }
function formatUptime(seconds = 0) { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); return `${h}h ${m}min` }
function formatPhone(phone = '') { const digits = String(phone).replace(/\D/g, ''); return digits.length > 10 ? `+${digits}` : digits }

async function saveDisconnectRules() {
  savingDisconnectRules.value = true
  try {
    const res = await settingsApi.save('whatsapp_disconnect_rules', disconnectRules.value)
    if (res.data?.success) {
      ui.showToast('Regras de desconexão salvas com sucesso.', 'success')
    } else {
      ui.showToast(res.data?.error || 'Erro ao salvar regras.', 'error')
    }
  } catch (err) {
    ui.showToast(err.response?.data?.error || 'Falha ao salvar regras de desconexão.', 'error')
  } finally {
    savingDisconnectRules.value = false
  }
}

async function loadDisconnectRules() {
  try {
    const res = await settingsApi.get()
    if (res.data?.settings?.whatsapp_disconnect_rules) {
      disconnectRules.value = {
        queue_retention_minutes: Number(res.data.settings.whatsapp_disconnect_rules.queue_retention_minutes) || 60,
        discard_hours: Number(res.data.settings.whatsapp_disconnect_rules.discard_hours) || 24
      }
    }
  } catch (err) {
    console.warn('Falha ao carregar regras de desconexão:', err)
  }
}

onMounted(async () => {
  try {
    await Promise.all([loadDepartments(), loadAccounts(), loadDisconnectRules()])
  } catch {
    ui.showToast('Não foi possível carregar as configurações.', 'error')
  }
  refreshTimer = setInterval(() => {
    if (serverExpanded.value) loadServerData()
    loadAccounts().catch(() => {})
  }, 10000)
})

onBeforeUnmount(() => clearInterval(refreshTimer))
</script>

<style scoped>
.rules-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 6px 0;
}
.rule-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rule-field label {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}
.rule-field label i {
  color: #d97706;
}
.rule-select {
  padding: 8px 10px;
  font-size: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #1e293b;
  outline: none;
  cursor: pointer;
}
.rule-select:focus {
  border-color: #d97706;
  box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.15);
}
.rule-field small {
  font-size: 10.5px;
  color: #64748b;
  line-height: 1.4;
}
@media (max-width: 768px) {
  .rules-grid {
    grid-template-columns: 1fr;
  }
}
.connection-card{border:1px solid #e2e8f0;border-radius:10px;background:#fff;overflow:hidden}.connection-summary,.account-summary{width:100%;border:0;background:#fff;padding:14px;display:flex;align-items:center;gap:12px;color:#1e293b}.connection-summary{cursor:pointer}.connection-summary small,.account-summary small{display:block;color:#64748b;font-size:11px;margin-top:2px}.connection-icon,.account-avatar{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}.connection-icon.server{background:#eff6ff;color:#2563eb}.connection-icon.whatsapp,.account-avatar{background:#ecfdf5;color:#16a34a}.connection-status{font-size:10.5px;font-weight:700;border-radius:20px;padding:4px 9px}.connection-status.connected{background:#dcfce7;color:#15803d}.connection-status.pending{background:#fef3c7;color:#b45309}.connection-status.disconnected{background:#fee2e2;color:#b91c1c}.connection-details{border-top:1px solid #e2e8f0;padding:14px}.server-info-grid,.account-data{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.server-info-grid div,.account-data div{padding:10px;background:#f8fafc;border-radius:7px}.server-info-grid span,.account-data span{display:block;color:#64748b;font-size:10px;margin-bottom:3px}.server-info-grid strong,.account-data strong{font-size:11.5px}.log-viewer{background:#0f172a;color:#cbd5e1;border-radius:8px;max-height:340px;overflow:auto;padding:10px;font:11px/1.5 Consolas,monospace}.log-entry{display:grid;grid-template-columns:68px 45px 1fr;gap:7px;padding:3px 0;border-bottom:1px solid rgba(148,163,184,.08)}.log-entry time{color:#64748b}.log-entry.error{color:#fca5a5}.log-entry.warn{color:#fde68a}.log-level{text-transform:uppercase;font-size:9px;font-weight:700}.new-account-form{display:flex;align-items:flex-end;gap:8px;padding:12px;background:#f8fafc;border-radius:8px;margin-bottom:12px}.new-account-form label{display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px}.new-account-form input{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px}.accounts-list{display:flex;flex-direction:column;gap:8px}.account-item{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;transition:border-color .15s}.account-item.expanded{border-color:#86efac}.account-details{border-top:1px solid #e2e8f0;padding:14px;background:#fcfdfd}.account-data{grid-template-columns:repeat(3,minmax(0,1fr))}.qr-area{text-align:center;padding:16px}.qr-area img{width:220px;height:220px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px}.qr-area p{font-size:11px;color:#64748b}.qr-loading{padding:60px;color:#64748b}.account-actions{display:flex;gap:8px;margin-top:14px}.btn-danger-soft{border:1px solid #fecaca;background:#fff1f2;color:#be123c;border-radius:6px;padding:7px 11px;font-size:11.5px;font-weight:700}.disconnect-warning{font-size:10.5px;color:#94a3b8;margin:9px 0 0}.empty-accounts,.empty-text{padding:28px;text-align:center;color:#64748b}.empty-accounts{display:flex;flex-direction:column;gap:5px}.empty-accounts i{font-size:28px;color:#86efac}

/* Routing styles */
.routing-badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:12px}.routing-badge.general{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1}.routing-badge.dedicated{background:#ede9fe;color:#6d28d9;border:1px solid #ddd6fe}
.routing-settings-box{margin-top:12px;padding:14px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;display:flex;flex-direction:column;gap:12px}
.routing-settings-header{display:flex;align-items:flex-start;gap:10px}
.routing-icon{width:28px;height:28px;border-radius:6px;background:#f5f3ff;color:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;margin-top:2px}
.routing-settings-header strong{font-size:12px;color:#1e293b;display:block}
.routing-settings-header small{font-size:11px;color:#64748b;display:block;margin-top:2px}
.routing-modes-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.routing-mode-card{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1.5px solid #e2e8f0;border-radius:8px;cursor:pointer;background:#fafafa;transition:all .15s ease}
.routing-mode-card:hover{border-color:#cbd5e1;background:#f8fafc}
.routing-mode-card.selected{border-color:#7c3aed;background:#faf5ff;box-shadow:0 0 0 1px #7c3aed}
.routing-mode-card input[type="radio"]{margin-top:3px;accent-color:#7c3aed;cursor:pointer}
.mode-info{flex:1}
.mode-title{font-size:11.5px;font-weight:700;color:#1e293b;display:flex;align-items:center;gap:6px;margin-bottom:4px}
.routing-mode-card.selected .mode-title{color:#6d28d9}
.mode-desc{font-size:10.5px;color:#64748b;line-height:1.4;margin:0}
.department-picker-row{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px}
.department-picker-row label{font-size:11px;font-weight:700;color:#6d28d9;white-space:nowrap;display:flex;align-items:center;gap:5px}
.dept-select{flex:1;padding:6px 10px;font-size:11.5px;font-weight:500;border:1px solid #c4b5fd;border-radius:6px;background:#fff;color:#1e293b;cursor:pointer;outline:none}
.dept-select:focus{border-color:#7c3aed;box-shadow:0 0 0 2px rgba(124,58,237,.2)}
.routing-footer{display:flex;align-items:center;gap:12px;padding-top:4px}
.btn-save-routing{padding:6px 14px;font-size:11px}
.unsaved-badge{font-size:10.5px;font-weight:600;color:#d97706;display:inline-flex;align-items:center;gap:4px}
.new-account-form select{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff}
.routing-badge.fallback{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
.fallback-picker{background:#eff6ff;border-color:#bfdbfe;flex-wrap:wrap}.fallback-picker label{color:#1d4ed8}.fallback-picker small{width:100%;color:#64748b;font-size:10.5px}
@media(max-width:900px){.server-info-grid,.account-data,.routing-modes-grid{grid-template-columns:1fr}.new-account-form{align-items:stretch;flex-direction:column}.new-account-form .btn-primary{width:100%;justify-content:center}.account-summary{align-items:flex-start}.connection-status{margin-left:auto}.account-actions,.routing-footer{flex-wrap:wrap}.department-picker-row{align-items:stretch;flex-direction:column}.dept-select{width:100%;box-sizing:border-box}}
@media(max-width:520px){.connection-summary,.account-summary{padding:11px;gap:9px}.connection-summary>div:nth-child(2),.account-summary>div:nth-child(2){min-width:0}.connection-summary strong,.account-summary strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-actions>*{flex:1;justify-content:center}.log-entry{grid-template-columns:54px 37px minmax(0,1fr);font-size:9.5px}.qr-area img{width:min(220px,100%);height:auto}.routing-settings-box,.account-details,.connection-details{padding:11px}}
</style>
