<template>
  <div class="performance-view">
    <section class="performance-toolbar">
      <div>
        <span class="performance-eyebrow"><i class="fa-solid fa-chart-line"></i> Gestão de desempenho</span>
        <h2>Indicadores mensais da operação</h2>
        <p>Acompanhe produtividade, tempos, SLA e satisfação sem perder o histórico dos meses anteriores.</p>
      </div>
      <div class="performance-filters">
        <label><span>Mês</span><input v-model="filters.month" type="month" :max="currentMonth" @change="fetchPerformance" /></label>
        <label v-if="auth.canManageTeam"><span>Departamento</span><select v-model="filters.departmentId" @change="onDepartmentChange"><option value="">{{ auth.isAdmin ? 'Todos' : 'Selecione' }}</option><option v-for="department in filterOptions.departments" :key="department.id" :value="department.id">{{ department.name }}</option></select></label>
        <label v-if="auth.canManageTeam"><span>Atendente</span><select v-model="filters.agentId" @change="fetchPerformance"><option value="">Todos</option><option v-for="agent in availableAgents" :key="agent.id" :value="agent.id">{{ normalizePersonName(agent.name) }}</option></select></label>
        <button class="performance-refresh" :disabled="loading" @click="fetchPerformance"><i class="fa-solid fa-rotate-right" :class="{ 'fa-spin': loading }"></i> Atualizar</button>
      </div>
    </section>

    <div v-if="error" class="performance-error"><i class="fa-solid fa-triangle-exclamation"></i> {{ error }}</div>

    <section class="performance-kpis" :class="{ loading }">
      <article v-for="card in metricCards" :key="card.key" class="performance-kpi-card">
        <div class="performance-kpi-head">
          <span class="performance-kpi-icon" :style="{ color: card.color, background: card.background }"><i :class="card.icon"></i></span>
          <span class="performance-comparison" :class="comparisonClass(card.change)"><i :class="comparisonIcon(card.change)"></i> {{ comparisonText(card.change, card.unit) }}</span>
        </div>
        <strong>{{ card.value }}</strong><span>{{ card.label }}</span><small>comparado a {{ previousMonthLabel }}</small>
      </article>
    </section>

    <section class="performance-main-grid">
      <article class="performance-panel performance-trend-panel">
        <div class="performance-panel-head"><div><h3>Volume diário</h3><p>Chats recebidos e atendimentos concluídos em {{ selectedMonthLabel }}.</p></div><div class="performance-legend"><span><i class="received"></i>Recebidos</span><span><i class="completed"></i>Concluídos</span></div></div>
        <div v-if="trendPoints.length" class="performance-chart">
          <div v-for="point in trendPoints" :key="point.day" class="performance-chart-day" :title="`Dia ${point.day}: ${point.created} recebidos, ${point.completed} concluídos`">
            <div class="performance-bars"><i class="received" :style="{ height: barHeight(point.created) }"></i><i class="completed" :style="{ height: barHeight(point.completed) }"></i></div><span>{{ point.day }}</span>
          </div>
        </div>
        <div v-else class="performance-empty">Ainda não há movimento neste período.</div>
      </article>

      <article class="performance-panel performance-summary-panel">
        <div class="performance-panel-head"><div><h3>Saúde da operação</h3><p>Leitura rápida do período selecionado.</p></div></div>
        <div class="health-row"><div><span>Conversão em atendimentos</span><strong>{{ completionRate }}%</strong></div><div class="health-track"><i :style="{ width: `${completionRate}%` }"></i></div></div>
        <div class="health-row"><div><span>Satisfação (4–5 estrelas)</span><strong>{{ metrics.satisfactionPercent }}%</strong></div><div class="health-track green"><i :style="{ width: `${metrics.satisfactionPercent}%` }"></i></div></div>
        <div class="health-row"><div><span>Resolvidos no mesmo dia</span><strong>{{ metrics.resolutionPercent }}%</strong></div><div class="health-track purple"><i :style="{ width: `${metrics.resolutionPercent}%` }"></i></div></div>
        <div class="performance-facts"><div><i class="fa-regular fa-clock"></i><span>Espera média</span><strong>{{ metrics.tme }}</strong></div><div><i class="fa-solid fa-bolt"></i><span>Conclusões/dia</span><strong>{{ metrics.productivityPerDay }}</strong></div><div><i class="fa-regular fa-star"></i><span>Avaliações</span><strong>{{ metrics.ratingCount }}</strong></div></div>
      </article>
    </section>

    <section class="performance-panel performance-table-panel">
      <div class="performance-panel-head"><div><h3>Desempenho por atendente</h3><p>Resultados individuais do período e evolução em relação ao mês anterior.</p></div><span class="performance-count">{{ agents.length }} atendente(s)</span></div>
      <div class="performance-table-wrap"><table class="performance-table">
        <thead><tr><th>#</th><th>Atendente</th><th>Concluídos</th><th>TMA</th><th>SLA</th><th>Nota</th><th>Satisfação</th><th>Evolução</th></tr></thead>
        <tbody>
          <tr v-if="!agents.length"><td colspan="8" class="performance-empty">Nenhum atendimento encontrado para os filtros selecionados.</td></tr>
          <tr v-for="(agent, index) in agents" :key="agent.id">
            <td><span class="rank-pill">{{ index + 1 }}</span></td><td><div class="agent-cell"><span class="agent-avatar">{{ initials(agent.name) }}</span><div><strong>{{ normalizePersonName(agent.name) }}</strong><small>{{ departmentName(agent.departmentId) }}</small></div></div></td>
            <td><strong>{{ agent.completed }}</strong></td><td>{{ agent.tma }}</td><td><span class="sla-pill" :class="{ warning: agent.slaPercent < 90 }">{{ agent.slaPercent }}%</span></td><td>{{ agent.ratingAverage == null ? '—' : `${agent.ratingAverage} ★` }}</td><td>{{ agent.satisfactionPercent }}%</td><td><span class="performance-comparison" :class="comparisonClass(agent.comparison.completed)"><i :class="comparisonIcon(agent.comparison.completed)"></i> {{ comparisonText(agent.comparison.completed) }}</span></td>
          </tr>
        </tbody>
      </table></div>
    </section>

    <section v-if="auth.canManageTeam" class="performance-departments">
      <article v-for="department in departments" :key="department.id" class="department-performance-card" :style="{ '--dept-color': department.color || '#059669' }">
        <div class="department-performance-title"><i class="fa-solid fa-users"></i><div><strong>{{ department.name }}</strong><small>{{ department.headcount }} atendente(s) ativo(s)</small></div></div>
        <div class="department-performance-grid"><div><span>Concluídos</span><strong>{{ department.completed }}</strong></div><div><span>Média/atendente</span><strong>{{ department.averagePerAgent }}</strong></div><div><span>SLA</span><strong>{{ department.slaPercent }}%</strong></div><div><span>Nota</span><strong>{{ department.ratingAverage == null ? '—' : department.ratingAverage }}</strong></div></div>
      </article>
    </section>
    <p class="performance-footnote"><i class="fa-solid fa-shield-halved"></i> Os períodos anteriores permanecem disponíveis nos filtros e o fechamento consolidado é preservado automaticamente a cada virada de mês.</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ticketsApi } from '@/api/tickets.api'
import { useAuthStore } from '@/stores/auth.store'
import { normalizePersonName } from '@/utils/person-display'

const auth = useAuthStore()
const now = new Date()
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const filters = ref({ month: currentMonth, departmentId: '', agentId: '' })
const performance = ref(null)
const filterOptions = ref({ departments: [], agents: [] })
const loading = ref(false)
const error = ref('')
const metrics = computed(() => performance.value?.metrics || { total: 0, completed: 0, tma: '00:00:00', tme: '00:00:00', slaPercent: 0, ratingAverage: null, ratingCount: 0, satisfactionPercent: 0, resolutionPercent: 0, productivityPerDay: 0 })
const comparison = computed(() => performance.value?.comparison || {})
const agents = computed(() => performance.value?.agents || [])
const departments = computed(() => performance.value?.departments || [])
const trendPoints = computed(() => performance.value?.trend || [])
const maxTrend = computed(() => Math.max(1, ...trendPoints.value.flatMap(point => [point.created, point.completed])))
const availableAgents = computed(() => filterOptions.value.agents.filter(agent => !filters.value.departmentId || String(agent.department_id) === String(filters.value.departmentId)))
const completionRate = computed(() => metrics.value.total ? Math.min(100, Math.round((metrics.value.completed / metrics.value.total) * 100)) : 0)
const metricCards = computed(() => [
  { key: 'total', label: 'Chats recebidos', value: metrics.value.total, change: comparison.value.total, icon: 'fa-regular fa-comments', color: '#059669', background: '#ecfdf5' },
  { key: 'completed', label: 'Atendimentos concluídos', value: metrics.value.completed, change: comparison.value.completed, icon: 'fa-solid fa-circle-check', color: '#059669', background: '#ecfdf5' },
  { key: 'tma', label: 'Tempo médio de atendimento', value: metrics.value.tma, change: comparison.value.tma, icon: 'fa-regular fa-clock', color: '#7c3aed', background: '#f5f3ff' },
  { key: 'tme', label: 'Tempo médio de espera', value: metrics.value.tme, change: comparison.value.tme, icon: 'fa-solid fa-hourglass-half', color: '#ea580c', background: '#fff7ed' },
  { key: 'sla', label: 'SLA cumprido', value: `${metrics.value.slaPercent}%`, change: comparison.value.sla, unit: 'pp', icon: 'fa-solid fa-gauge-high', color: '#0891b2', background: '#ecfeff' },
  { key: 'rating', label: 'Média de avaliação', value: metrics.value.ratingAverage == null ? '—' : `${metrics.value.ratingAverage} ★`, change: comparison.value.rating, unit: 'pt', icon: 'fa-solid fa-star', color: '#ca8a04', background: '#fefce8' }
])
const selectedMonthLabel = computed(() => monthLabel(filters.value.month))
const previousMonthLabel = computed(() => monthLabel(performance.value?.previousMonth))

function monthLabel(value) { if (!value) return 'mês anterior'; const [year, month] = value.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)) }
function comparisonClass(value) { return Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : 'neutral' }
function comparisonIcon(value) { return Number(value) > 0 ? 'fa-solid fa-arrow-trend-up' : Number(value) < 0 ? 'fa-solid fa-arrow-trend-down' : 'fa-solid fa-minus' }
function comparisonText(value, unit = '%') { return `${Math.abs(Number(value) || 0).toFixed(1)}${unit}` }
function barHeight(value) { return `${Math.max(value ? 6 : 2, (Number(value) / maxTrend.value) * 100)}%` }
function initials(name = '') { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AT' }
function departmentName(id) { return filterOptions.value.departments.find(item => String(item.id) === String(id))?.name || 'Sem departamento' }
function onDepartmentChange() { filters.value.agentId = ''; fetchPerformance() }
async function fetchPerformance() {
  loading.value = true; error.value = ''
  try {
    const params = Object.fromEntries(Object.entries(filters.value).filter(([, value]) => value))
    const { data } = await ticketsApi.performance(params)
    if (!data.success || !data.performance) throw new Error(data.error || 'Não foi possível carregar os indicadores.')
    performance.value = data.performance
    filterOptions.value = data.performance.filters || filterOptions.value
  } catch (requestError) { error.value = requestError.response?.data?.error || requestError.message || 'Não foi possível carregar os indicadores.' }
  finally { loading.value = false }
}
onMounted(fetchPerformance)
</script>
