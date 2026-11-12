const { supabase, isSupabaseConfigured } = require('../config/supabase');
const performanceService = require('./performance.service');
const { isAdmin, isSupervisor, departmentIds, canAccessDepartment } = require('./access-control.service');

const SETTINGS_KEY = 'wallboard_config';
const performanceCache = new Map();
const CACHE_TTL_MS = 10000;

const DEFAULT_CONFIG = Object.freeze({
  monthlyTarget: 0,
  soundEnabled: true,
  soundCooldownSeconds: 10,
  warningSlaPercent: 70,
  criticalQueueSize: 5
});

function normalizeConfig(value = {}) {
  return {
    monthlyTarget: Math.max(0, Math.min(1000000, Number.parseInt(value.monthlyTarget, 10) || 0)),
    soundEnabled: value.soundEnabled !== false,
    soundCooldownSeconds: Math.max(3, Math.min(120, Number.parseInt(value.soundCooldownSeconds, 10) || 10)),
    warningSlaPercent: Math.max(30, Math.min(95, Number.parseInt(value.warningSlaPercent, 10) || 70)),
    criticalQueueSize: Math.max(1, Math.min(1000, Number.parseInt(value.criticalQueueSize, 10) || 5))
  };
}

function secondsSince(value, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / 1000)) : 0;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function calculateQueueState(tickets, slaMinutes, config, now = Date.now()) {
  const waiting = (tickets || []).filter(ticket => ticket.status === 'aguardando');
  const handling = (tickets || []).filter(ticket => ticket.status === 'em_atendimento');
  const queue = waiting.map(ticket => {
    const waitSeconds = secondsSince(ticket.queued_at || ticket.created_at, now);
    const targetSeconds = Math.max(60, Number(ticket.sla_minutes_target || slaMinutes || 15) * 60);
    const progress = Math.round((waitSeconds / targetSeconds) * 100);
    const protocol = String(ticket.protocol || ticket.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
    return {
      protocol,
      clientName: String(ticket.client_name || '').trim() || `Cliente ${protocol}`,
      waitSeconds,
      wait: formatDuration(waitSeconds),
      slaProgress: progress,
      state: progress >= 100 ? 'critical' : progress >= config.warningSlaPercent ? 'warning' : 'normal'
    };
  }).sort((a, b) => b.waitSeconds - a.waitSeconds);

  return {
    waiting: waiting.length,
    handling: handling.length,
    oldestWaitSeconds: queue[0]?.waitSeconds || 0,
    oldestWait: queue[0]?.wait || '00:00',
    slaAtRisk: queue.filter(item => item.state === 'warning').length,
    slaBreached: queue.filter(item => item.state === 'critical').length,
    queue: queue.slice(0, 8)
  };
}

function calculateHealth({ queueState, whatsappConnected, config }) {
  if (!whatsappConnected) return { level: 'critical', label: 'Crítica', reason: 'WhatsApp desconectado' };
  if (queueState.slaBreached > 0) return { level: 'critical', label: 'Crítica', reason: `${queueState.slaBreached} atendimento(s) fora do SLA` };
  if (queueState.waiting >= config.criticalQueueSize) return { level: 'critical', label: 'Crítica', reason: 'Fila acima do limite configurado' };
  if (queueState.slaAtRisk > 0) return { level: 'warning', label: 'Atenção', reason: `${queueState.slaAtRisk} atendimento(s) próximo(s) do SLA` };
  if (queueState.waiting > 0) return { level: 'warning', label: 'Atenção', reason: 'Há clientes aguardando atendimento' };
  return { level: 'healthy', label: 'Saudável', reason: 'Operação dentro dos limites' };
}

class WallboardService {
  async resolveDepartment(user, requestedDepartmentId) {
    const allowed = departmentIds(user);
    const departmentId = isAdmin(user) ? requestedDepartmentId : (requestedDepartmentId || user?.department_id || allowed[0]);
    if (!departmentId) throw new Error('Selecione um departamento para abrir o painel.');
    if (!canAccessDepartment(user, departmentId)) throw new Error('Departamento fora do seu escopo de supervisão.');
    const { data, error } = await supabase.from('departments').select('id, name, color, sla_target_minutes').eq('id', departmentId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Departamento não encontrado.');
    return data;
  }

  async loadConfigs() {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
    if (error) return {};
    return data?.value && typeof data.value === 'object' ? data.value : {};
  }

  async getConfig(departmentId) {
    const configs = await this.loadConfigs();
    return normalizeConfig({ ...DEFAULT_CONFIG, ...(configs[String(departmentId)] || {}) });
  }

  async saveConfig(departmentId, value) {
    const { data: department, error: departmentError } = await supabase.from('departments').select('id').eq('id', departmentId).maybeSingle();
    if (departmentError) throw departmentError;
    if (!department) throw new Error('Departamento não encontrado.');
    const configs = await this.loadConfigs();
    const config = normalizeConfig(value);
    configs[String(departmentId)] = config;
    const { error } = await supabase.from('system_settings').upsert({ key: SETTINGS_KEY, value: configs, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return config;
  }

  async getPerformance(user, departmentId, force = false) {
    const key = `${departmentId}`;
    const cached = performanceCache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await performanceService.getPerformance(
      (isAdmin(user) || isSupervisor(user)) ? user : { ...user, department_id: departmentId },
      { departmentId }
    );
    performanceCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  async connectedUsers(io, departmentId) {
    if (!io) return 0;
    try {
      const sockets = await io.in(`department:${departmentId}`).fetchSockets();
      return new Set(sockets.map(socket => socket.user?.id).filter(Boolean)).size;
    } catch (_) {
      return 0;
    }
  }

  whatsappState(whatsappService, department) {
    const accounts = whatsappService?.getAccounts?.(false) || [];
    const relevant = accounts.filter(account => account.routingMode !== 'department' ||
      String(account.departmentId || '') === String(department.id) ||
      String(account.departmentName || '').toLocaleLowerCase('pt-BR') === String(department.name || '').toLocaleLowerCase('pt-BR'));
    return {
      connected: relevant.some(account => account.status === 'connected'),
      connectedCount: relevant.filter(account => account.status === 'connected').length,
      configuredCount: relevant.length
    };
  }

  async getData(user, { departmentId, force = false, includeAvatars = false } = {}, io = null, whatsappService = null) {
    if (!isSupabaseConfigured()) throw new Error('Supabase não configurado.');
    const department = await this.resolveDepartment(user, departmentId);
    const config = await this.getConfig(department.id);
    let [activeResult, performance, connectedUsers] = await Promise.all([
      supabase.from('tickets')
        .select('id, client_name, status, created_at, queued_at')
        .eq('department_id', department.id)
        .in('status', ['aguardando', 'em_atendimento'])
        .order('created_at', { ascending: true })
        .limit(1000),
      this.getPerformance(user, department.id, force),
      this.connectedUsers(io, department.id)
    ]);
    if (activeResult.error && /queued_at|schema cache|does not exist/i.test(String(activeResult.error.message || ''))) {
      activeResult = await supabase.from('tickets')
        .select('id, client_name, status, created_at')
        .eq('department_id', department.id)
        .in('status', ['aguardando', 'em_atendimento'])
        .order('created_at', { ascending: true })
        .limit(1000);
    }
    if (activeResult.error) throw activeResult.error;
    const activeTickets = activeResult.data || [];

    const queueState = calculateQueueState(activeTickets, department.sla_target_minutes, config);
    const whatsapp = this.whatsappState(whatsappService, department);
    const health = calculateHealth({ queueState, whatsappConnected: whatsapp.connected, config });
    const metrics = performance?.metrics || {};
    const today = performance?.today || {};
    const monthlyProgress = config.monthlyTarget > 0 ? Math.min(100, Math.round((Number(metrics.completed || 0) / config.monthlyTarget) * 100)) : null;

    return {
      department: { id: department.id, name: department.name, color: department.color || '#2563eb', slaMinutes: department.sla_target_minutes || 15 },
      config,
      health,
      realtime: { ...queueState, connectedUsers, whatsapp, serverOnline: true },
      today: { received: today.departmentReceived || 0, completed: today.agentCompleted || 0 },
      month: {
        key: performance?.month,
        received: metrics.total || 0,
        completed: metrics.completed || 0,
        tma: metrics.tma || '00:00:00',
        tme: metrics.tme || '00:00:00',
        slaPercent: metrics.slaPercent || 0,
        ratingAverage: metrics.ratingAverage,
        ratingCount: metrics.ratingCount || 0,
        satisfactionPercent: metrics.satisfactionPercent || 0,
        target: config.monthlyTarget,
        targetProgress: monthlyProgress
      },
      agents: (performance?.agents || [])
        .map(agent => ({
          id: agent.id,
          name: agent.name,
          ...(includeAvatars ? { avatarUrl: agent.avatarUrl || null } : {}),
          completed: agent.todayCompleted || 0,
          ratingAverage: agent.todayRatingAverage,
          ratingCount: agent.todayRatingCount || 0,
          active: agent.active,
          slaPercent: agent.slaPercent
        }))
        .sort((a, b) => b.completed - a.completed || (b.ratingAverage || 0) - (a.ratingAverage || 0) || a.name.localeCompare(b.name, 'pt-BR'))
        .slice(0, 8),
      trend: (performance?.trend || []).slice(-14),
      generatedAt: new Date().toISOString()
    };
  }
}

const wallboardService = new WallboardService();
wallboardService._test = { normalizeConfig, calculateQueueState, calculateHealth, formatDuration };

module.exports = wallboardService;
