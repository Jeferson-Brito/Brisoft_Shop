const { supabase, isSupabaseConfigured } = require('../config/supabase');
const { isAdmin, isSupervisor, departmentIds, canAccessDepartment } = require('./access-control.service');

const PAGE_SIZE = 1000;
const MAX_FETCH_ROWS = 8000;
let snapshotTableAvailable = null;
let snapshotFallbackAvailable = null;
const savedSnapshotKeys = new Set();
const PERFORMANCE_CACHE_TTL_MS = 30 * 1000;
const PAST_MONTH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const performanceResultCache = new Map();
const periodDataCache = new Map();

function clearPerformanceCache() {
  performanceResultCache.clear();
  periodDataCache.clear();
}

function clearCurrentMonthCache() {
  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  for (const key of performanceResultCache.keys()) {
    if (key.startsWith(currentMonthPrefix)) performanceResultCache.delete(key);
  }
  for (const key of periodDataCache.keys()) {
    if (key.startsWith(currentMonthPrefix)) periodDataCache.delete(key);
  }
}

function parseMonth(value, fallback = new Date()) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : fallback.getFullYear();
  const month = match ? Number(match[2]) : fallback.getMonth() + 1;
  if (month < 1 || month > 12) throw new Error('Mês inválido. Use o formato AAAA-MM.');
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const startDate = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
  const endDate = new Date(Date.UTC(nextYear, nextMonth - 1, 1, 3, 0, 0));
  return {
    key,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    previousKey: `${previousYear}-${String(previousMonth).padStart(2, '0')}`,
    days: new Date(year, month, 0).getDate(),
    isCurrent: year === fallback.getFullYear() && month === fallback.getMonth() + 1
  };
}

// Paginação por blocos: evita depender do count do PostgREST, que pode vir null
// quando o builder já contém order/select encadeados.
async function fetchAll(buildQuery) {
  const results = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = data || [];
    results.push(...page);
    if (results.length >= MAX_FETCH_ROWS) {
      console.warn(`Consulta de desempenho limitada a ${MAX_FETCH_ROWS} linhas.`);
      return results.slice(0, MAX_FETCH_ROWS);
    }
    if (page.length < PAGE_SIZE) return results;
    from += PAGE_SIZE;
  }
}

function secondsBetween(start, end) {
  const value = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function average(values) {
  const valid = values.filter(value => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function round(value, precision = 1) {
  const multiplier = 10 ** precision;
  return Math.round((Number(value) || 0) * multiplier) / multiplier;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function percentChange(current, previous, lowerIsBetter = false) {
  if (!previous) return current ? 100 : 0;
  const raw = ((current - previous) / Math.abs(previous)) * 100;
  return round(lowerIsBetter ? -raw : raw, 1);
}

function ticketMatchesAgent(ticket, agent) {
  if (!agent) return true;
  return Boolean(
    (agent.id && ticket.user_id && String(ticket.user_id) === String(agent.id)) ||
    (agent.name && (ticket.agent_name === agent.name || ticket.encerrado_por === agent.name))
  );
}

function isCustomerTicket(ticket) {
  return ticket?.is_employee !== true && ticket?.is_group !== true;
}

function calculateDailyAgentStats({ closedTickets = [], ratings = [], agent, dateKey = localDateKey() }) {
  const agentCustomerTickets = closedTickets
    .filter(isCustomerTicket)
    .filter(ticket => ticketMatchesAgent(ticket, agent));
  const eligibleTicketIds = new Set(agentCustomerTickets.map(ticket => String(ticket.id)).filter(Boolean));
  const completed = agentCustomerTickets
    .filter(ticket => localDateKey(ticket.closed_at || ticket.updated_at) === dateKey).length;
  const scores = ratings
    .filter(rating => localDateKey(rating.created_at) === dateKey)
    .filter(rating => rating.ticket_id
      ? eligibleTicketIds.has(String(rating.ticket_id))
      : Boolean(agent?.name && rating.agent_name === agent.name))
    .map(rating => Number(rating.score))
    .filter(Number.isFinite);

  return {
    completed,
    ratingAverage: scores.length ? round(average(scores), 1) : null,
    ratingCount: scores.length
  };
}

function ticketDepartment(ticket) {
  return ticket.departments || {
    id: ticket.department_id || null,
    name: ticket.department || 'Sem departamento',
    color: '#64748b',
    sla_target_minutes: ticket.sla_minutes_target || 15
  };
}

function localDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo'
  }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function calculateMetrics({ createdTickets, closedTickets, activeTickets, ratings, period, agent = null }) {
  const created = createdTickets.filter(isCustomerTicket).filter(ticket => ticketMatchesAgent(ticket, agent));
  const closed = closedTickets.filter(isCustomerTicket).filter(ticket => ticketMatchesAgent(ticket, agent));
  const active = activeTickets.filter(isCustomerTicket).filter(ticket => ticketMatchesAgent(ticket, agent));
  const agentNames = new Set(closed.flatMap(ticket => [ticket.agent_name, ticket.encerrado_por]).filter(Boolean));
  const customerTicketIds = new Set([...created, ...closed, ...active].map(ticket => String(ticket.id)).filter(Boolean));
  if (agent?.name) agentNames.add(agent.name);
  const visibleRatings = ratings.filter(rating => (!rating.ticket_id || customerTicketIds.has(String(rating.ticket_id))) && (!agent || agentNames.has(rating.agent_name)));

  const handlingSeconds = closed.map(ticket => secondsBetween(
    ticket.assumed_at || ticket.started_at || ticket.created_at,
    ticket.closed_at || ticket.finished_at || ticket.updated_at
  )).filter(value => value !== null);
  const waitSeconds = closed.map(ticket => secondsBetween(
    ticket.queued_at || ticket.created_at,
    ticket.first_response_at || ticket.assumed_at
  )).filter(value => value !== null);
  const slaResults = closed.map(ticket => {
    const wait = secondsBetween(ticket.queued_at || ticket.created_at, ticket.first_response_at || ticket.assumed_at);
    if (wait === null) return null;
    const target = Number(ticket.sla_minutes_target || ticketDepartment(ticket).sla_target_minutes || 15) * 60;
    return wait <= target;
  }).filter(value => value !== null);
  const ratingScores = visibleRatings.map(item => Number(item.score)).filter(Number.isFinite);
  const solvedSameDay = closed.filter(ticket => {
    const start = new Date(ticket.queued_at || ticket.created_at);
    const end = new Date(ticket.closed_at || ticket.finished_at || ticket.updated_at);
    return start.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) === end.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }).length;

  return {
    total: created.length,
    completed: closed.length,
    active: active.filter(ticket => ticket.status === 'em_atendimento').length,
    waiting: active.filter(ticket => ticket.status === 'aguardando').length,
    tmaSeconds: round(average(handlingSeconds), 0),
    tma: formatDuration(average(handlingSeconds)),
    tmeSeconds: round(average(waitSeconds), 0),
    tme: formatDuration(average(waitSeconds)),
    slaPercent: slaResults.length ? round((slaResults.filter(Boolean).length / slaResults.length) * 100, 1) : 0,
    ratingAverage: ratingScores.length ? round(average(ratingScores), 1) : null,
    ratingCount: ratingScores.length,
    satisfactionPercent: ratingScores.length ? round((ratingScores.filter(score => score >= 4).length / ratingScores.length) * 100, 1) : 0,
    resolutionPercent: closed.length ? round((solvedSameDay / closed.length) * 100, 1) : 0,
    productivityPerDay: round(closed.length / Math.max(1, period.isCurrent ? new Date().getDate() : period.days), 1)
  };
}

function buildComparison(current, previous) {
  return {
    total: percentChange(current.total, previous.total),
    completed: percentChange(current.completed, previous.completed),
    tma: percentChange(current.tmaSeconds, previous.tmaSeconds, true),
    tme: percentChange(current.tmeSeconds, previous.tmeSeconds, true),
    sla: round(current.slaPercent - previous.slaPercent, 1),
    rating: round((current.ratingAverage || 0) - (previous.ratingAverage || 0), 1),
    satisfaction: round(current.satisfactionPercent - previous.satisfactionPercent, 1)
  };
}

function buildTrend(tickets, period) {
  const values = Array.from({ length: period.days }, (_, index) => ({ day: index + 1, created: 0, completed: 0 }));
  for (const ticket of tickets.created.filter(isCustomerTicket)) {
    const day = Number(new Intl.DateTimeFormat('pt-BR', { day: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(ticket.queued_at || ticket.created_at)));
    if (values[day - 1]) values[day - 1].created += 1;
  }
  for (const ticket of tickets.closed.filter(isCustomerTicket)) {
    const day = Number(new Intl.DateTimeFormat('pt-BR', { day: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(ticket.closed_at || ticket.updated_at)));
    if (values[day - 1]) values[day - 1].completed += 1;
  }
  return values;
}

let performanceColumnsAvailable = null;
const FULL_SELECT = 'id, user_id, department_id, department, agent_name, encerrado_por, status, is_employee, is_group, created_at, queued_at, updated_at, started_at, assumed_at, first_response_at, finished_at, closed_at, sla_minutes_target, sla_met, departments(id, name, color, sla_target_minutes)';
const SAFE_SELECT = 'id, user_id, department_id, department, agent_name, encerrado_por, status, is_employee, is_group, created_at, updated_at, assumed_at, closed_at, departments(id, name, color, sla_target_minutes)';

class PerformanceService {
  async loadPeriod(period, departmentId = null, force = false) {
    const scopeKey = Array.isArray(departmentId)
      ? departmentId.slice().sort().join(',')
      : (departmentId ? String(departmentId) : 'all');
    const cacheKey = `${period.key}:${scopeKey}`;

    if (!force) {
      const cached = periodDataCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    const useFull = performanceColumnsAvailable !== false;
    const select = useFull ? FULL_SELECT : SAFE_SELECT;
    const applyDepartment = query => Array.isArray(departmentId)
      ? (departmentId.length ? query.in('department_id', departmentId) : query.is('id', null))
      : (departmentId ? query.eq('department_id', departmentId) : query);
    
    try {
      const loadCreated = async () => {
        if (!useFull) return fetchAll(() => applyDepartment(supabase.from('tickets').select(select).neq('status', 'fora_horario').gte('created_at', period.start).lt('created_at', period.end).order('created_at')));
        const [queued, legacy] = await Promise.all([
          fetchAll(() => applyDepartment(supabase.from('tickets').select(select).gte('queued_at', period.start).lt('queued_at', period.end).order('queued_at'))),
          fetchAll(() => applyDepartment(supabase.from('tickets').select(select).is('queued_at', null).neq('status', 'fora_horario').gte('created_at', period.start).lt('created_at', period.end).order('created_at')))
        ]);
        return [...queued, ...legacy];
      };
      const closedQuery = () => applyDepartment(
        supabase.from('tickets').select(select).eq('status', 'finalizado')
          .gte('updated_at', period.start).lt('updated_at', period.end)
          .order('updated_at')
      );

      const [created, closed, active, ratings] = await Promise.all([
        loadCreated(),
        fetchAll(closedQuery),
        fetchAll(() => applyDepartment(supabase.from('tickets').select(select).in('status', ['aguardando', 'em_atendimento']).order('created_at'))),
        fetchAll(() => supabase.from('ratings').select('id, ticket_id, agent_name, score, created_at').gte('created_at', period.start).lt('created_at', period.end).order('created_at')).catch(() => [])
      ]);
      if (useFull) performanceColumnsAvailable = true;
      const result = { created, closed, active, ratings: ratings || [] };
      const ttl = period.isCurrent ? PERFORMANCE_CACHE_TTL_MS : PAST_MONTH_CACHE_TTL_MS;
      periodDataCache.set(cacheKey, { data: result, expiresAt: Date.now() + ttl });
      if (periodDataCache.size > 12) {
        const oldestKey = periodDataCache.keys().next().value;
        if (oldestKey && oldestKey !== cacheKey) periodDataCache.delete(oldestKey);
      }
      return result;
    } catch (err) {
      if (useFull && (err.code === '42703' || err.code === 'PGRST204' || /does not exist|schema cache|queued_at|started_at|first_response_at|finished_at|sla_minutes_target|sla_met/i.test(String(err.message || '')))) {
        performanceColumnsAvailable = false;
        return this.loadPeriod(period, departmentId, force);
      }
      console.warn('Erro ao carregar período de desempenho:', err.message || err);
      return { created: [], closed: [], active: [], ratings: [] };
    }
  }

  async getPerformance(user, filters = {}) {
    if (!isSupabaseConfigured()) return null;
    const force = filters.force === true;
    const requestedPeriod = parseMonth(filters.month);
    const previousPeriod = parseMonth(requestedPeriod.previousKey);

    const userScope = isAdmin(user) ? 'admin' : (isSupervisor(user) ? `sup:${user?.id}` : `agent:${user?.id}`);
    const filterScope = `dept:${filters.departmentId || 'all'}:agent:${filters.agentId || 'all'}`;
    const cacheKey = `${requestedPeriod.key}:${userScope}:${filterScope}`;

    if (!force) {
      const cached = performanceResultCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }
    const [{ data: users }, { data: departments }, supervisorLinksResult] = await Promise.all([
      supabase.from('users').select('id, name, role, department_id, avatar_url, is_active').order('name'),
      supabase.from('departments').select('id, name, color, sla_target_minutes').order('name'),
      supabase.from('supervisor_departments').select('user_id, department_id')
    ]);
    const supervisorLinks = supervisorLinksResult.error ? [] : (supervisorLinksResult.data || []);
    const memberDepartmentIds = member => [...new Set([
      member?.department_id,
      ...supervisorLinks.filter(link => String(link.user_id) === String(member?.id)).map(link => link.department_id)
    ].filter(Boolean).map(String))];

    const admin = isAdmin(user);
    const supervisor = isSupervisor(user);
    const allowedDepartmentIds = departmentIds(user);
    if (!admin && filters.departmentId && !canAccessDepartment(user, filters.departmentId)) throw new Error('Departamento fora do seu escopo de supervisão.');
    const enforcedDepartmentId = admin
      ? (filters.departmentId || null)
      : supervisor ? (filters.departmentId || null) : (user?.department_id || null);
    const requestedUser = (users || []).find(item => String(item.id) === String(filters.agentId || '')) || null;
    if (supervisor && requestedUser && !memberDepartmentIds(requestedUser).some(id => allowedDepartmentIds.includes(id))) throw new Error('Atendente fora do seu escopo de supervisão.');
    const selectedUser = admin
      ? requestedUser
      : supervisor ? requestedUser : { id: user?.id, name: user?.name, department_id: user?.department_id };
    const departmentId = selectedUser?.department_id || enforcedDepartmentId;
    const departmentScope = departmentId || (supervisor ? allowedDepartmentIds : null);
    const [currentData, previousData] = await Promise.all([
      this.loadPeriod(requestedPeriod, departmentScope),
      this.loadPeriod(previousPeriod, departmentScope)
    ]);

    const currentMetrics = calculateMetrics({
      createdTickets: currentData.created,
      closedTickets: currentData.closed,
      activeTickets: requestedPeriod.isCurrent ? currentData.active : [],
      ratings: currentData.ratings,
      period: requestedPeriod,
      agent: selectedUser
    });
    const previousMetrics = calculateMetrics({
      createdTickets: previousData.created,
      closedTickets: previousData.closed,
      activeTickets: [],
      ratings: previousData.ratings,
      period: previousPeriod,
      agent: selectedUser
    });

    const relevantClosed = currentData.closed.filter(isCustomerTicket).filter(ticket => ticketMatchesAgent(ticket, selectedUser));
    const relevantCreated = currentData.created.filter(isCustomerTicket).filter(ticket => ticketMatchesAgent(ticket, selectedUser));
    const todayKey = localDateKey();
    const today = requestedPeriod.isCurrent ? {
      departmentReceived: currentData.created.filter(isCustomerTicket).filter(ticket => localDateKey(ticket.queued_at || ticket.created_at) === todayKey).length,
      agentCompleted: relevantClosed.filter(ticket => localDateKey(ticket.closed_at || ticket.updated_at) === todayKey).length
    } : { departmentReceived: 0, agentCompleted: 0 };
    const agentRows = (users || [])
      .filter(item => item.is_active !== false && item.role !== 'Administrador'
        && (!departmentId || memberDepartmentIds(item).includes(String(departmentId)))
        && (!supervisor || memberDepartmentIds(item).some(id => allowedDepartmentIds.includes(id))))
      .map(agent => {
        const metrics = calculateMetrics({ ...{ createdTickets: currentData.created, closedTickets: currentData.closed, activeTickets: currentData.active, ratings: currentData.ratings, period: requestedPeriod }, agent });
        const oldMetrics = calculateMetrics({ ...{ createdTickets: previousData.created, closedTickets: previousData.closed, activeTickets: [], ratings: previousData.ratings, period: previousPeriod }, agent });
        const daily = requestedPeriod.isCurrent
          ? calculateDailyAgentStats({ closedTickets: currentData.closed, ratings: currentData.ratings, agent, dateKey: todayKey })
          : { completed: 0, ratingAverage: null, ratingCount: 0 };
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          avatarUrl: agent.avatar_url,
          departmentId: departmentId || agent.department_id,
          departmentIds: memberDepartmentIds(agent),
          todayCompleted: daily.completed,
          todayRatingAverage: daily.ratingAverage,
          todayRatingCount: daily.ratingCount,
          ...metrics,
          comparison: buildComparison(metrics, oldMetrics)
        };
      })
      .filter(item => !selectedUser || String(item.id) === String(selectedUser.id))
      .sort((a, b) => b.completed - a.completed);

    const departmentRows = (departments || []).filter(dept => (!departmentId || String(dept.id) === String(departmentId)) && (!supervisor || allowedDepartmentIds.includes(String(dept.id)))).map(dept => {
      const createdTickets = currentData.created.filter(ticket => String(ticket.department_id) === String(dept.id));
      const closedTickets = currentData.closed.filter(ticket => String(ticket.department_id) === String(dept.id));
      const activeTickets = currentData.active.filter(ticket => String(ticket.department_id) === String(dept.id));
      const names = new Set(closedTickets.flatMap(ticket => [ticket.agent_name, ticket.encerrado_por]).filter(Boolean));
      const ratings = currentData.ratings.filter(rating => names.has(rating.agent_name));
      const metrics = calculateMetrics({ createdTickets, closedTickets, activeTickets, ratings, period: requestedPeriod });
      const headcount = (users || []).filter(item => item.role !== 'Administrador' && item.is_active !== false && memberDepartmentIds(item).includes(String(dept.id))).length;
      return { id: dept.id, name: dept.name, color: dept.color, headcount, averagePerAgent: headcount ? round(metrics.completed / headcount, 1) : 0, ...metrics };
    });

    if (requestedPeriod.isCurrent && !(supervisor && !departmentId)) {
      // Fire-and-forget: não bloqueia a resposta ao cliente
      this.saveSnapshot(previousPeriod, selectedUser, departmentId, previousMetrics).catch(err =>
        console.warn('Erro ao salvar snapshot em background:', err?.message || err)
      );
    }

    const result = {
      month: requestedPeriod.key,
      previousMonth: previousPeriod.key,
      isCurrentMonth: requestedPeriod.isCurrent,
      scope: { agentId: selectedUser?.id || null, departmentId: departmentId || null },
      metrics: currentMetrics,
      previousMetrics,
      comparison: buildComparison(currentMetrics, previousMetrics),
      today,
      trend: buildTrend({ created: relevantCreated, closed: relevantClosed }, requestedPeriod),
      agents: agentRows,
      departments: departmentRows,
      filters: {
        departments: admin ? (departments || []) : (departments || []).filter(item => allowedDepartmentIds.includes(String(item.id))),
        agents: (admin || supervisor) ? (users || []).filter(item => item.role === 'Analista' && item.is_active !== false && (admin || memberDepartmentIds(item).some(id => allowedDepartmentIds.includes(id)))) : []
      },
      snapshotEnabled: snapshotTableAvailable === true || snapshotFallbackAvailable === true,
      snapshotStorage: snapshotTableAvailable === true ? 'monthly_table' : (snapshotFallbackAvailable === true ? 'system_settings' : 'pending_migration')
    };

    const ttl = requestedPeriod.isCurrent ? PERFORMANCE_CACHE_TTL_MS : PAST_MONTH_CACHE_TTL_MS;
    performanceResultCache.set(cacheKey, { data: result, expiresAt: Date.now() + ttl });
    return result;
  }

  async saveSnapshot(period, agent, departmentId, metrics) {
    const scopeType = agent ? 'agent' : (departmentId ? 'department' : 'company');
    const scopeId = agent?.id || departmentId || 'company';
    const snapshotKey = `${period.key}:${scopeType}:${scopeId}`;
    if (savedSnapshotKeys.has(snapshotKey)) return true;
    const payload = {
      month_start: `${period.key}-01`,
      scope_type: scopeType,
      scope_id: String(scopeId),
      scope_name: agent?.name || null,
      department_id: departmentId || null,
      metrics,
      updated_at: new Date().toISOString()
    };
    if (snapshotTableAvailable !== false) {
      const { error } = await supabase.from('performance_monthly_snapshots')
        .upsert(payload, { onConflict: 'month_start,scope_type,scope_id' });
      if (!error) {
        snapshotTableAvailable = true;
        savedSnapshotKeys.add(snapshotKey);
        return true;
      }
      snapshotTableAvailable = false;
      if (!/performance_monthly_snapshots|schema cache/i.test(error.message || '')) console.warn(`Falha ao salvar fechamento mensal: ${error.message}`);
    }

    // Compatibilidade imediata para bancos que ainda não executaram a nova
    // migração. O histórico fica preservado no system_settings até a tabela
    // dedicada estar disponível.
    const settingKey = 'performance_monthly_snapshots_fallback';
    const { data: existing, error: readError } = await supabase.from('system_settings').select('value').eq('key', settingKey).maybeSingle();
    if (readError && !/0 rows/i.test(readError.message || '')) return false;
    const value = existing?.value && typeof existing.value === 'object' ? existing.value : {};
    value[snapshotKey] = payload;
    const { error: fallbackError } = await supabase.from('system_settings').upsert({ key: settingKey, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    snapshotFallbackAvailable = !fallbackError;
    if (!fallbackError) savedSnapshotKeys.add(snapshotKey);
    return !fallbackError;
  }

  clearCache() {
    clearPerformanceCache();
  }

  clearCurrentMonthCache() {
    clearCurrentMonthCache();
  }
}

const performanceService = new PerformanceService();
performanceService._test = {
  parseMonth,
  calculateMetrics,
  calculateDailyAgentStats,
  buildComparison,
  formatDuration,
  localDateKey,
  isCustomerTicket,
  fetchAll,
  clearPerformanceCache,
  clearCurrentMonthCache
};

module.exports = performanceService;
