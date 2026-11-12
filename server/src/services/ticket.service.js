// ==========================================================================
// BRISOFT SHOP - TICKET & SLA SERVICE (SUPABASE VERSION)
// ==========================================================================

const { supabase, isSupabaseConfigured } = require('../config/supabase');
const fs = require('fs');
const path = require('path');
const { isAdmin, isSupervisor, departmentIds, canAccessDepartment } = require('./access-control.service');
const crypto = require('crypto');
const { getBotConfig, renderBotMessage, departmentOptions } = require('./bot-config.service');
const {
  normalizeBotInput,
  matchesCustomerCancellation,
  matchesHumanHandoff,
  matchesMenuRequest,
  matchesNewServiceRequest,
  matchesExternalClosureMessage,
  resolveDepartmentIntent,
  resolveNameConfirmation,
  resolveResumeChoice,
  messageWasSentBeforePrompt,
  whatsappTimestampMs
} = require('./bot-intent.service');
const { normalizeOutgoingMedia } = require('./media-transcode.service');
const cloudStorage = require('./cloud-storage.service');
const { getDepartmentAvailability } = require('./business-hours.service');
const {
  isGeneratedCustomerName,
  extractAndValidateName,
  findContactByPhone,
  saveConfirmedContact,
  ensureWhatsAppContact
} = require('./customer-identification.service');

// Janela de avaliacao: 30 minutos
const RATING_WINDOW_MS = 30 * 60 * 1000;

const TICKETS_FILE = path.join(__dirname, '../../data/tickets.json');
const MEDIA_DIR = path.join(__dirname, '../../public/media');
const MEDIA_TICKET_CACHE_MAX = 5000;
const mediaTicketCache = new Map();
const mediaSizeCache = new Map();
let remoteMessageColumnsAvailable = null;
let conversationTrackingColumnsAvailable = null;
let messageUserIdColumnAvailable = null;
let messageInteractionColumnsAvailable = null;
let ticketTimingColumnsAvailable = null;
let conversationTrackingCheckPromise = null;
const DEPARTMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Sao_Paulo';
const appTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const DEFAULT_DEPARTMENTS = Object.freeze([
  { id: '1', name: 'B3 Eletrônica' },
  { id: '2', name: 'Comercial' },
  { id: '3', name: 'Comercial eletrônica' },
  { id: '4', name: 'Financeiro' },
  { id: '5', name: 'Operacional' },
  { id: '6', name: 'Recursos Humanos' },
  { id: '7', name: 'Suporte Técnico' },
  { id: '8', name: 'Suprimentos' }
]);
let departmentCache = null;
let departmentCacheExpiresAt = 0;
let departmentLoadPromise = null;
let ticketBackupTimer = null;
let kpiUpdateTimer = null;

// Regras de retenção na fila e descarte configuráveis pelo Administrador
const DISCONNECT_RULES_KEY = 'whatsapp_disconnect_rules';
const DEFAULT_DISCONNECT_RULES = {
  queue_retention_minutes: 60, // 1 hora na fila após desconexão
  discard_hours: 24             // 24 horas até descarte definitivo se não reconectado
};
let disconnectRulesCache = null;
let disconnectRulesCacheExpiresAt = 0;

// Mapa de contas do WhatsApp desconectadas: accountId -> { disconnected_at, reason }
const DISCONNECTED_ACCOUNTS_KEY = 'whatsapp_disconnected_accounts';
let disconnectedAccountsMap = new Map();
let disconnectedAccountsLoaded = false;
let knownWhatsAppAccountsCache = null;
let knownWhatsAppAccountsExpiresAt = 0;

async function initDisconnectedAccounts() {
  if (!isSupabaseConfigured()) return;
  try {
    const [savedDisc, savedAccounts] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', DISCONNECTED_ACCOUNTS_KEY).maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'whatsapp_accounts').maybeSingle()
    ]);

    if (savedDisc.data?.value && typeof savedDisc.data.value === 'object') {
      for (const [accId, info] of Object.entries(savedDisc.data.value)) {
        if (info && info.disconnected_at) {
          disconnectedAccountsMap.set(String(accId), {
            disconnected_at: info.disconnected_at,
            reason: info.reason || 'connection_lost'
          });
        }
      }
    }

    const accounts = Array.isArray(savedAccounts.data?.value) ? savedAccounts.data.value : [];
    for (const acc of accounts) {
      const key = String(acc.id);
      const isDisconnected = !acc.phone || acc.status === 'disconnected';
      const discAt = acc.last_disconnected_at || acc.lastDisconnectedAt || null;
      if (isDisconnected && discAt && !disconnectedAccountsMap.has(key)) {
        disconnectedAccountsMap.set(key, {
          disconnected_at: discAt,
          reason: acc.disconnect_reason || acc.disconnectReason || 'connection_lost'
        });
      }
    }

    disconnectedAccountsLoaded = true;
    await persistDisconnectedAccounts();
  } catch (e) {
    console.warn('Falha ao carregar contas desconectadas salvas:', e.message);
  }
}

// Inicializa logo na inicialização do módulo
initDisconnectedAccounts().catch(() => {});

async function getDisconnectRules() {
  if (!disconnectedAccountsLoaded) {
    await initDisconnectedAccounts();
  }
  if (disconnectRulesCache && Date.now() < disconnectRulesCacheExpiresAt) {
    return disconnectRulesCache;
  }
  if (!isSupabaseConfigured()) return DEFAULT_DISCONNECT_RULES;
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', DISCONNECT_RULES_KEY)
      .maybeSingle();
    const rules = {
      queue_retention_minutes: Math.max(1, Number(data?.value?.queue_retention_minutes) || DEFAULT_DISCONNECT_RULES.queue_retention_minutes),
      discard_hours: Math.max(1, Number(data?.value?.discard_hours) || DEFAULT_DISCONNECT_RULES.discard_hours)
    };
    disconnectRulesCache = rules;
    disconnectRulesCacheExpiresAt = Date.now() + 30000;
    return rules;
  } catch (_) {
    return DEFAULT_DISCONNECT_RULES;
  }
}

let globalWhatsAppService = null;

async function getKnownWhatsAppAccounts(whatsappService = null) {
  const ws = whatsappService || globalWhatsAppService;
  if (ws?.getAccounts) {
    try {
      const accs = ws.getAccounts(false);
      if (accs && accs.length) return accs;
    } catch (_) {}
  }
  if (knownWhatsAppAccountsCache && Date.now() < knownWhatsAppAccountsExpiresAt) {
    return knownWhatsAppAccountsCache;
  }
  if (!isSupabaseConfigured()) return [];
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'whatsapp_accounts')
      .maybeSingle();
    const accounts = Array.isArray(data?.value) ? data.value : [];
    knownWhatsAppAccountsCache = accounts;
    knownWhatsAppAccountsExpiresAt = Date.now() + 15000;
    return accounts;
  } catch (_) {
    return [];
  }
}

async function persistDisconnectedAccounts() {
  if (!isSupabaseConfigured()) return;
  try {
    const value = Object.fromEntries(disconnectedAccountsMap.entries());
    await supabase
      .from('system_settings')
      .upsert({ key: DISCONNECTED_ACCOUNTS_KEY, value, updated_at: new Date() }, { onConflict: 'key' });
  } catch (e) {
    console.warn('Erro ao salvar contas desconectadas:', e.message);
  }
}

function getChannelAccountId(channel) {
  if (!channel) return 'default';
  if (channel.startsWith('whatsapp:')) return channel.slice('whatsapp:'.length);
  if (channel === 'whatsapp') return 'default';
  return channel;
}

function isChannelDisconnected(channel) {
  const accountId = getChannelAccountId(channel);
  return disconnectedAccountsMap.has(String(accountId));
}

function recordedDisconnectAt(account) {
  return account?.last_disconnected_at || account?.lastDisconnectedAt || null;
}

function accountLooksConnected(account) {
  if (!account) return false;
  return account.status !== 'disconnected' && Boolean(account.phone);
}

function getChannelDisconnectInfo(channel, whatsappAccounts = null) {
  const accountId = getChannelAccountId(channel);
  const key = String(accountId);
  const inMap = disconnectedAccountsMap.get(key);

  if (Array.isArray(whatsappAccounts)) {
    const matchedAccount = whatsappAccounts.find(a => String(a.id) === key);
    if (matchedAccount && accountLooksConnected(matchedAccount)) return null;
    if (!matchedAccount) return inMap?.disconnected_at ? inMap : null;
    const disconnectedAt = inMap?.disconnected_at || recordedDisconnectAt(matchedAccount);
    if (!disconnectedAt) return null;
    return {
      disconnected_at: disconnectedAt,
      reason: inMap?.reason || matchedAccount.disconnect_reason || matchedAccount.disconnectReason || 'connection_lost'
    };
  }

  if (inMap?.disconnected_at) return inMap;
  return null;
}


function isMissingMessageUserIdColumn(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /user_id/i.test(error?.message || '');
}

function isMissingRemoteMessageColumns(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /remote_message_id|whatsapp_account_id/i.test(error?.message || '');
}

function isMissingConversationTrackingColumns(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /sender_type|sender_name|message_context|handled_via|direct_whatsapp_messages|platform_messages/i.test(error?.message || '');
}

function isMissingTicketTimingColumns(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /assumed_at|first_response_at|started_at|finished_at|sla_minutes_target|sla_met/i.test(error?.message || '');
}

function mergeHandledVia(current, next) {
  const normalized = String(current || 'pending').toLowerCase();
  if (normalized === 'mixed' || normalized === next) return normalized;
  if (normalized === 'pending' || !normalized) return next;
  return 'mixed';
}

async function ensureConversationTrackingColumns() {
  if (conversationTrackingColumnsAvailable !== null && messageUserIdColumnAvailable !== null) {
    return conversationTrackingColumnsAvailable;
  }
  if (!conversationTrackingCheckPromise) {
    conversationTrackingCheckPromise = Promise.all([
      supabase.from('messages').select('sender_type, sender_name, message_context').limit(1),
      supabase.from('tickets').select('handled_via, direct_whatsapp_messages, platform_messages').limit(1),
      supabase.from('messages').select('user_id').limit(1)
    ]).then(([msgTracking, ticketTracking, msgUserId]) => {
      conversationTrackingColumnsAvailable = !msgTracking?.error && !ticketTracking?.error;
      messageUserIdColumnAvailable = !msgUserId?.error;
      return conversationTrackingColumnsAvailable;
    }).catch(() => {
      conversationTrackingColumnsAvailable = false;
      messageUserIdColumnAvailable = false;
      return false;
    }).finally(() => {
      conversationTrackingCheckPromise = null;
    });
  }
  return conversationTrackingCheckPromise;
}

async function wasRemoteMessageProcessed(whatsappAccountId, messageId) {
  if (!whatsappAccountId || !messageId || remoteMessageColumnsAvailable === false) return false;
  const { data, error } = await supabase
    .from('messages')
    .select('id')
    .eq('whatsapp_account_id', whatsappAccountId)
    .eq('remote_message_id', messageId)
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingRemoteMessageColumns(error)) {
      remoteMessageColumnsAvailable = false;
      return false;
    }
    console.warn(`Falha ao verificar mensagem duplicada: ${error.message}`);
    return false;
  }
  remoteMessageColumnsAvailable = true;
  return Boolean(data);
}

function rememberMediaTicket(mediaUrl, ticketId) {
  const filename = String(mediaUrl || '').split('/').pop();
  if (!filename || !ticketId) return;
  mediaTicketCache.delete(filename);
  mediaTicketCache.set(filename, ticketId);
  if (mediaTicketCache.size > MEDIA_TICKET_CACHE_MAX) {
    mediaTicketCache.delete(mediaTicketCache.keys().next().value);
  }
}

function rememberMediaSize(mediaUrl, size) {
  const filename = String(mediaUrl || '').split('/').pop()?.split('?')[0];
  if (!filename || typeof size !== 'number' || size < 0) return;
  mediaSizeCache.delete(filename);
  mediaSizeCache.set(filename, size);
  if (mediaSizeCache.size > MEDIA_TICKET_CACHE_MAX) {
    mediaSizeCache.delete(mediaSizeCache.keys().next().value);
  }
}

function saveTicketsToDisk(tickets) {
  clearTimeout(ticketBackupTimer);
  ticketBackupTimer = setTimeout(async () => {
    try {
      await fs.promises.mkdir(path.dirname(TICKETS_FILE), { recursive: true });
      await fs.promises.writeFile(TICKETS_FILE, JSON.stringify(tickets, null, 2), 'utf8');
    } catch (e) {
      console.warn('Erro ao salvar tickets no disco:', e.message);
    }
  }, 250);
  ticketBackupTimer.unref?.();
}

async function getCachedDepartments() {
  if (departmentCache && Date.now() < departmentCacheExpiresAt) return departmentCache;
  if (!departmentLoadPromise) {
    departmentLoadPromise = (async () => {
      try {
        let { data, error } = await supabase
          .from('departments')
          .select('id, name, sort_order, business_hours, after_hours_message')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });
        if (error && /sort_order|schema cache|column .* does not exist/i.test(`${error.message || ''} ${error.details || ''}`)) {
          const fallback = await supabase.from('departments').select('id, name').order('name');
          data = fallback.data;
          error = fallback.error;
        }
        if (error) throw error;
        return data?.length ? data : [...DEFAULT_DEPARTMENTS];
      } catch (_) {
        return [...DEFAULT_DEPARTMENTS];
      }
    })();
  }
  try {
    departmentCache = await departmentLoadPromise;
    departmentCacheExpiresAt = Date.now() + DEPARTMENT_CACHE_TTL_MS;
    return departmentCache;
  } finally {
    departmentLoadPromise = null;
  }
}

function scheduleKpiUpdate(io) {
  try {
    require('./performance.service').clearCache?.();
  } catch (_) {}
  if (!io || kpiUpdateTimer) return;
  kpiUpdateTimer = setTimeout(() => {
    io.emit('kpis_updated');
    kpiUpdateTimer = null;
  }, 500);
  kpiUpdateTimer.unref?.();
}

function makeTimeStr(date) {
  const d = date || new Date();
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return appTimeFormatter.format(d);
}

function preferredWhatsAppJid(phone, fallbackJid = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 15) return `${digits}@s.whatsapp.net`;
  return String(fallbackJid || '');
}

function messageMutationWhatsAppJid(ticket, sentFromConnectedDevice = false) {
  if (ticket?.is_group) return String(ticket.group_jid || ticket.raw_jid || ticket.jid || '');
  if (sentFromConnectedDevice && ticket?.raw_jid) return String(ticket.raw_jid);
  return preferredWhatsAppJid(ticket?.phone, ticket?.jid || ticket?.raw_jid);
}

async function departmentAllowsDeviceMessageMutations(departmentId) {
  if (!departmentId) return false;
  const { data, error } = await supabase
    .from('departments')
    .select('allow_device_message_mutations')
    .eq('id', departmentId)
    .maybeSingle();
  if (error) {
    if (/allow_device_message_mutations|schema cache|column .* does not exist/i.test(error.message || '')) return false;
    throw error;
  }
  return data?.allow_device_message_mutations === true;
}

function phoneFromWhatsAppIdentity(phone, fallbackJid = '') {
  const explicitDigits = String(phone || '').replace(/\D/g, '');
  if (explicitDigits.length >= 10 && explicitDigits.length <= 15) return explicitDigits;
  const fallback = String(fallbackJid || '').replace(/:\d+@/, '@').replace(/:\d+$/, '');
  if (!fallback || fallback.includes('@lid')) return '';
  const fallbackDigits = fallback.replace(/@(?:s\.whatsapp\.net|c\.us)$/, '').replace(/\D/g, '');
  return fallbackDigits.length >= 10 && fallbackDigits.length <= 15 ? fallbackDigits : '';
}

function uuidOrNull(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')) ? value : null;
}

function safeUploadedFileName(value) {
  const decoded = String(value || 'arquivo').trim();
  const extension = path.extname(decoded).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  const base = path.basename(decoded, path.extname(decoded)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'arquivo';
  return { displayName: `${base}${extension}`, extension };
}

function canUserAccessTicket(user, ticket) {
  if (!user || !ticket) return false;
  if (isAdmin(user)) return true;
  if (isSupervisor(user)) return departmentIds(user).includes(String(ticket.department_id || ''));

  // Se o atendimento está em andamento com outro atendente, apenas o próprio atendente tem acesso direto
  if (ticket.status === 'em_atendimento' && (ticket.user_id || ticket.agent_name)) {
    const isOwner = (user.id && ticket.user_id && String(ticket.user_id) === String(user.id)) ||
                    (user.name && ticket.agent_name === user.name);
    return isOwner;
  }

  return Boolean(
    (ticket.agent_name && ticket.agent_name === user.name) ||
    (ticket.department_id && String(ticket.department_id) === String(user.department_id)) ||
    (ticket.department && user.department && ticket.department.toLowerCase() === user.department.toLowerCase())
  );
}

function scopeTicketQuery(query, user) {
  if (!user || isAdmin(user)) return query;
  if (isSupervisor(user)) {
    const ids = departmentIds(user);
    return ids.length ? query.in('department_id', ids) : query.is('id', null);
  }
  const filters = [];
  if (user.name) filters.push(`agent_name.eq.${user.name}`);
  if (user.department_id) filters.push(`department_id.eq.${user.department_id}`);
  if (user.department) filters.push(`department.eq.${user.department}`);
  return filters.length ? query.or(filters.join(',')) : query.is('id', null);
}

function historyTicketVisibleToUser(user, ticket, participatedTicketIds = new Set()) {
  if (!user || !ticket) return false;
  if (isAdmin(user)) return true;
  if (isSupervisor(user)) return departmentIds(user).includes(String(ticket.department_id || ''));
  return Boolean(
    (user.id && ticket.user_id && String(ticket.user_id) === String(user.id)) ||
    (user.name && ticket.agent_name === user.name) ||
    (user.name && ticket.encerrado_por === user.name) ||
    participatedTicketIds.has(String(ticket.id))
  );
}

async function analystParticipatedInTicket(user, ticketId) {
  if (!user || !ticketId || isAdmin(user) || isSupervisor(user)) return false;
  const queries = [];
  const validUserId = uuidOrNull(user.id);
  if (validUserId && messageUserIdColumnAvailable !== false) {
    queries.push(supabase.from('messages').select('id').eq('ticket_id', ticketId).eq('user_id', validUserId).limit(1).maybeSingle());
  }
  if (user.name) {
    queries.push(supabase.from('messages').select('id').eq('ticket_id', ticketId).eq('sender_name', user.name).limit(1).maybeSingle());
  }
  const results = await Promise.all(queries);
  return results.some(result => !result.error && Boolean(result.data));
}

function isMissingMessageInteractionColumns(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /reply_to_message_id|reply_to_remote_message_id|reply_preview|reply_sender|edited_at|deleted_at/i.test(error?.message || '');
}

function messagePreview(message, maxLength = 180) {
  const mediaFallback = ({
    image: '📷 Imagem', sticker: '🖼️ Figurinha', video: '🎥 Vídeo',
    audio: '🎙️ Áudio', document: `📄 ${message?.file_name || 'Documento'}`
  })[message?.type];
  return String(message?.text || mediaFallback || 'Mensagem')
    .replace(/^\*[^*]+:\*\s*/s, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength) || 'Mensagem';
}

async function ensureMessageInteractionColumns() {
  if (messageInteractionColumnsAvailable === true) return true;
  const result = await supabase.from('messages')
    .select('reply_to_message_id, reply_to_remote_message_id, reply_preview, reply_sender, edited_at, deleted_at')
    .limit(1);
  messageInteractionColumnsAvailable = !result.error;
  return messageInteractionColumnsAvailable;
}

async function isTicketCollaborator(userId, ticketId) {
  if (!userId || !ticketId || !isSupabaseConfigured()) return false;
  const { data, error } = await supabase.from('ticket_collaborators').select('user_id').eq('ticket_id', ticketId).eq('user_id', userId).maybeSingle();
  if (error) return false; // implantação continua funcional antes da migration
  return Boolean(data);
}

async function canUserAccessTicketDetails(user, ticket) {
  if (!user || !ticket) return false;
  if (await isTicketCollaborator(user.id, ticket.id)) return true;
  if (ticket.status !== 'finalizado') return canUserAccessTicket(user, ticket);
  if (historyTicketVisibleToUser(user, ticket)) return true;
  if (user.department_id && ticket.department_id && String(user.department_id) === String(ticket.department_id)) return true;
  if (user.department && ticket.department && user.department.toLowerCase() === ticket.department.toLowerCase()) return true;
  return analystParticipatedInTicket(user, ticket.id);
}

function selectOutboundWhatsAppAccount(accounts, department) {
  const connected = (accounts || []).filter(account => account?.status === 'connected');
  const departmentId = String(department?.id || '');
  const departmentName = String(department?.name || '').trim().toLocaleLowerCase('pt-BR');
  return connected.find(account => account.routingMode === 'department' && (
    String(account.departmentId || '') === departmentId ||
    String(account.departmentName || '').trim().toLocaleLowerCase('pt-BR') === departmentName
  )) || connected.find(account => account.routingMode !== 'department') || null;
}

function emitTicketEvent(io, event, payload, ticket) {
  if (!io || !ticket) return;
  let target = io.to('admins');
  if (ticket.department_id) {
    target = target.to(`department:${ticket.department_id}`);
  } else {
    target = target.to('company:general');
  }
  if (ticket.user_id) {
    target = target.to(`user:${ticket.user_id}`);
  }
  target.emit(event, payload);
}

const unclaimedActivityThrottle = new Map();

function emitUnclaimedWhatsAppActivity(io, ticket, previewText) {
  if (!io || !ticket) return;
  const now = Date.now();
  const lastAlert = unclaimedActivityThrottle.get(ticket.id) || 0;
  if (now - lastAlert < 20000) {
    return;
  }
  unclaimedActivityThrottle.set(ticket.id, now);
  if (unclaimedActivityThrottle.size > 1000) {
    for (const [key, time] of unclaimedActivityThrottle) {
      if (now - time > 60000) unclaimedActivityThrottle.delete(key);
    }
  }

  const payload = {
    ticketId: ticket.id,
    ticket,
    clientName: ticket.client_name || 'Cliente',
    department: ticket.department || null,
    departmentId: ticket.department_id || null,
    channel: ticket.channel,
    preview: previewText || ticket.preview || 'Mensagem enviada pelo WhatsApp',
    timestamp: now
  };

  if (ticket.department_id) {
    io.to('admins').to(`department:${ticket.department_id}`).emit('unclaimed_whatsapp_activity', payload);
  } else {
    io.emit('unclaimed_whatsapp_activity', payload);
  }
}

function assertSupabase(result, context) {
  if (result && result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result ? result.data : null;
}

function makeInitials(name, fallback = 'GR') {
  if (!name) return fallback;
  const words = String(name)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return Array.from(String(name).trim()).slice(0, 2).join('').toUpperCase() || fallback;
  }
  if (words.length === 1) {
    return Array.from(words[0]).slice(0, 2).join('').toUpperCase() || fallback;
  }
  return words.slice(0, 2).map(w => Array.from(w)[0]).join('').toUpperCase() || fallback;
}

function parseRatingInput(text) {
  if (typeof text !== 'string') return null;
  const clean = text.trim();
  const match = clean.match(/^([1-5])\s*(?:estrelas?|⭐|\*)?$/i);
  if (match) return parseInt(match[1], 10);
  if (clean.length <= 2) {
    const raw = parseInt(clean, 10);
    if (!isNaN(raw) && raw >= 1 && raw <= 5) return raw;
  }
  return null;
}

function isRatingEligibleTicket(ticket, ratingWindowMinutes, nowMs = Date.now()) {
  if (!ticket || ticket.is_employee || ticket.status !== 'finalizado') return false;
  const upTime = new Date(ticket.updated_at || ticket.closed_at).getTime();
  if (isNaN(upTime)) return false;
  const elapsedMs = Math.max(0, nowMs - upTime);
  const configuredMs = (Number(ratingWindowMinutes) || 45) * 60 * 1000;
  const withinConfiguredWindow = elapsedMs < configuredMs;
  // Se o atendimento foi encerrado aguardando avaliação e o cliente ainda não avaliou,
  // aceitamos a avaliação com tolerância estendida de até 24 horas.
  const isAwaitingRating = Boolean(ticket.awaiting_rating) && elapsedMs < (24 * 60 * 60 * 1000);
  return withinConfiguredWindow || isAwaitingRating;
}

// O Supabase limita respostas a 1.000 linhas. Sem paginação, os tickets fora
// da primeira página pareciam não possuir mensagens no histórico.
async function fetchAllMessagesForTicketIds(ticketIds = []) {
  const ids = [...new Set(ticketIds.filter(Boolean).map(String))];
  const allMessages = [];
  const batchSize = 40;
  const pageSize = 1000;
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batch = ids.slice(offset, offset + batchSize);
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('ticket_id', batch)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      allMessages.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
  }
  return allMessages;
}

async function fetchAllTicketPages(buildQuery) {
  const pageSize = 1000;
  const maxPages = 20;
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    if (page === maxPages - 1) console.warn(`Listagem de tickets limitada a ${rows.length} linhas.`);
  }
  return rows;
}

async function fetchRatingsForTicketIds(ticketIds = []) {
  const ids = [...new Set(ticketIds.filter(Boolean).map(String))];
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const { data, error } = await supabase.from('ratings').select('ticket_id, score').in('ticket_id', ids.slice(offset, offset + 50));
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

class TicketService {
  setWhatsAppService(service) {
    globalWhatsAppService = service;
  }

  invalidateDepartmentCache() {
    departmentCache = null;
    departmentCacheExpiresAt = 0;
    departmentLoadPromise = null;
  }

  canUserAccessTicket(user, ticket) {
    return canUserAccessTicket(user, ticket);
  }

  canUserAccessTicketDetails(user, ticket) {
    return canUserAccessTicketDetails(user, ticket);
  }

  getMediaSize(mediaUrl, fileName) {
    const rawUrl = String(mediaUrl || '');
    const filename = rawUrl.split('/').pop()?.split('?')[0] || String(fileName || '');
    if (!filename) return null;
    if (mediaSizeCache.has(filename)) return mediaSizeCache.get(filename);
    try {
      const localPath = path.join(MEDIA_DIR, path.basename(filename));
      if (fs.existsSync(localPath)) {
        const stats = fs.statSync(localPath);
        const size = stats.size;
        rememberMediaSize(rawUrl, size);
        return size;
      }
    } catch (_) {}
    return null;
  }

  async processIncomingMessage(msgData, io, whatsappService) {
    const {
      from,
      rawJid,
      phone: rawPhone,
      senderName,
      text,
      whatsappAccountId,
      whatsappRoutingMode,
      whatsappDepartmentId,
      whatsappDepartmentName,
      whatsappFallbackDepartmentId,
      whatsappFallbackDepartmentName
    } = msgData;
    const targetJid = rawJid || from;
    if (!targetJid || targetJid === 'undefined') {
      console.warn('Mensagem recebida sem JID válido:', msgData);
      return null;
    }
    const phone = phoneFromWhatsAppIdentity(rawPhone, targetJid);
    const outboundJid = preferredWhatsAppJid(phone, targetJid);
    const whatsappChannel = whatsappAccountId ? `whatsapp:${whatsappAccountId}` : 'whatsapp';
    let cleanName = senderName || (phone ? `Cliente ${phone.slice(-4)}` : 'Cliente');
    console.log(`Processando mensagem de ${cleanName} | Tel: ${phone} | JID: ${targetJid}`);
    if (!isSupabaseConfigured()) return null;
    try {
      await ensureConversationTrackingColumns();
      if (await wasRemoteMessageProcessed(whatsappAccountId, msgData.messageId)) {
        console.log(`[WhatsApp:${whatsappAccountId}] mensagem duplicada ignorada (${msgData.messageId}).`);
        return { type: 'duplicate', messageId: msgData.messageId };
      }
      const now = new Date();
      const incomingTimestamp = whatsappTimestampMs(msgData.timestamp);
      const incomingDate = incomingTimestamp ? new Date(incomingTimestamp) : now;
      const t = makeTimeStr(incomingDate);

      const deptList = await getCachedDepartments();

      const botConfig = await getBotConfig();
      let forceDepartmentMenu = false;
      const knownContact = await findContactByPhone(phone);
      const isEmployee = Boolean(knownContact?.is_employee);
      const needsCustomerName = !knownContact || isGeneratedCustomerName(knownContact.name);
      if (knownContact?.name && !isGeneratedCustomerName(knownContact.name)) cleanName = knownContact.name;
      const scopeWhatsAppChannel = query => whatsappAccountId === 'default'
        ? query.in('channel', ['whatsapp', whatsappChannel])
        : query.eq('channel', whatsappChannel);
      const optionsText = departmentOptions(deptList);
      const accountFallbackDepartment = deptList.find(dept =>
        String(dept.id) === String(whatsappFallbackDepartmentId || '') ||
        (whatsappFallbackDepartmentName && normalizeBotInput(dept.name) === normalizeBotInput(whatsappFallbackDepartmentName))
      ) || null;
      const dedicatedDepartment = whatsappRoutingMode === 'department'
        ? deptList.find(dept => String(dept.id) === String(whatsappDepartmentId || '')
          || (whatsappDepartmentName && normalizeBotInput(dept.name) === normalizeBotInput(whatsappDepartmentName))) || null
        : null;
      // Padrão individual do número tem prioridade. O padrão global do bot é
      // usado somente quando a conta não possui um destino próprio.
      const defaultDepartment = dedicatedDepartment
        || accountFallbackDepartment
        || deptList.find(dept => dept.id === botConfig.default_department_id)
        || deptList[0] || null;
      const botVariables = (extra = {}) => ({
        nome: cleanName,
        departamento: defaultDepartment?.name || 'fila de atendimento',
        opcoes: optionsText,
        limite: botConfig.invalid_attempt_limit,
        ...extra
      });
      const sendBotText = async (ticketId, template, extra = {}) => {
        const rendered = renderBotMessage(template, botVariables(extra)).trim();
        if (!rendered || !whatsappService) return false;
        const sent = await whatsappService.sendMessage(outboundJid, rendered);
        if (sent && ticketId) {
          const botMessagePayload = {
            ticket_id: ticketId,
            sender: 'bot',
            text: `*Bot:*

${rendered}`,
            time: makeTimeStr(new Date()),
            remote_message_id: sent?.key?.id || null,
            whatsapp_account_id: whatsappAccountId || null
          };
          if (conversationTrackingColumnsAvailable === true) Object.assign(botMessagePayload, {
            sender_type: 'bot', sender_name: 'Bot', message_context: 'bot'
          });
          const result = await supabase.from('messages').insert(botMessagePayload);
          if (result.error) console.warn(`Falha ao registrar mensagem enviada pelo bot: ${result.error.message}`);
        }
        return sent;
      };
      const holdOutsideBusinessHours = async (targetTicket, department, incomingText, storeIncomingMessage = false) => {
        const availability = getDepartmentAvailability(department, now);
        if (availability.isOpen) return null;
        const scheduledQueueAt = availability.nextOpenAt?.toISOString() || null;
        const updatePayload = {
          status: 'fora_horario',
          assumed: false,
          user_id: null,
          agent_name: null,
          assumed_at: null,
          queued_at: null,
          scheduled_queue_at: scheduledQueueAt,
          department: department.name,
          department_id: department.id,
          time: t,
          preview: String(incomingText || targetTicket.preview || '').slice(0, 50),
          unread_count: Math.max(1, Number(targetTicket.unread_count || 0) + 1),
          updated_at: now.toISOString()
        };
        assertSupabase(await supabase.from('tickets').update(updatePayload).eq('id', targetTicket.id), 'Falha ao reservar atendimento fora do expediente');
        if (storeIncomingMessage) {
          assertSupabase(await supabase.from('messages').insert(incomingMessagePayload(targetTicket.id, 'bot')), 'Falha ao registrar mensagem recebida');
        }
        Object.assign(targetTicket, updatePayload);
        await supabase.from('messages').insert({
          ticket_id: targetTicket.id,
          sender: 'system',
          type: 'divider',
          text: `[Chatbot] Atendimento reservado fora do expediente • ${department.name}`,
          time: t
        });
        const template = department.after_hours_message || '🕒 *Estamos fora do horário de atendimento*\n\nOlá, {nome}! Infelizmente o departamento *{departamento}* não está disponível no momento.\n\n📅 *Horários de atendimento:*\n{horario}\n\nSua conversa ficou reservada e entrará automaticamente na fila em *{proxima_abertura}*.\n\nVocê não precisa enviar outra mensagem. Entraremos em contato assim que o atendimento for retomado. ✅';
        await sendBotText(targetTicket.id, template, {
          departamento: department.name,
          horario: availability.scheduleLabel,
          proxima_abertura: availability.nextOpenLabel
        });
        return { type: 'after_hours_held', ticket: targetTicket, scheduledQueueAt };
      };
      const incomingMessagePayload = (ticketId, messageContext = 'service') => {
        const payload = { ticket_id: ticketId, sender: 'client', text, time: t };
        if (conversationTrackingColumnsAvailable === true) {
          payload.sender_type = 'customer';
          payload.message_context = messageContext;
        }
        const messageTimestamp = whatsappTimestampMs(msgData.timestamp);
        if (messageTimestamp) payload.created_at = new Date(messageTimestamp).toISOString();
        if (msgData.mediaType) payload.type = msgData.mediaType;
        if (remoteMessageColumnsAvailable === true) {
          payload.remote_message_id = msgData.messageId || null;
          payload.whatsapp_account_id = whatsappAccountId || null;
          payload.file_name = msgData.fileName || null;
        }
        if (msgData.mediaUrl) {
          payload.media_url = msgData.mediaUrl;
          rememberMediaTicket(msgData.mediaUrl, ticketId);
        }
        return payload;
      };
      const routeWithoutBot = async (targetTicket, incomingText, storeIncomingMessage = true, noticeTemplate = botConfig.disabled_routing_message) => {
        if (!defaultDepartment) throw new Error('Nenhum departamento disponível para o roteamento automático.');
        const held = await holdOutsideBusinessHours(targetTicket, defaultDepartment, incomingText, storeIncomingMessage);
        if (held) return held;
        const updatePayload = {
          status: 'aguardando',
          assumed: false,
          user_id: null,
          agent_name: null,
          assumed_at: null,
          queued_at: now.toISOString(),
          scheduled_queue_at: null,
          department: defaultDepartment.name,
          department_id: defaultDepartment.id,
          time: t,
          preview: incomingText.slice(0, 50),
          unread_count: Math.max(1, (targetTicket.unread_count || 0) + 1),
          updated_at: now.toISOString()
        };
        assertSupabase(await supabase.from('tickets').update(updatePayload).eq('id', targetTicket.id), 'Falha ao encaminhar ticket');
        if (storeIncomingMessage) {
          assertSupabase(await supabase.from('messages').insert(incomingMessagePayload(targetTicket.id)), 'Falha ao registrar mensagem recebida');
        }
        Object.assign(targetTicket, updatePayload);
        await sendBotText(targetTicket.id, noticeTemplate, { departamento: defaultDepartment.name });
        const fullTicket = await this.getFullTicket(targetTicket.id);
        if (io && fullTicket) {
          emitTicketEvent(io, 'ticket_created', { ticket: fullTicket }, fullTicket);
          scheduleKpiUpdate(io);
        }
        return { type: 'bot_disabled_routed', ticket: fullTicket || targetTicket };
      };
      const botStatePrefix = '[Chatbot][State] ';
      const saveBotState = async (ticketId, state) => {
        const statePayload = {
          ticket_id: ticketId,
          sender: 'system',
          type: 'divider',
          text: `${botStatePrefix}${JSON.stringify(state)}`,
          time: t
        };
        if (conversationTrackingColumnsAvailable === true) Object.assign(statePayload, {
          sender_type: 'bot', sender_name: 'Bot', message_context: 'bot'
        });
        assertSupabase(await supabase.from('messages').insert(statePayload), 'Falha ao registrar estado do bot');
      };
      const getLatestBotState = async ticketId => {
        const { data, error } = await supabase
          .from('messages')
          .select('text')
          .eq('ticket_id', ticketId)
          .like('text', `${botStatePrefix}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !data?.text) return null;
        try { return JSON.parse(data.text.slice(botStatePrefix.length)); } catch (_) { return null; }
      };
      const askForCustomerName = async (targetTicket, attempt = 1, template = botConfig.ask_customer_name_message) => {
        await saveBotState(targetTicket.id, { step: 'awaiting_name', attempt, promptedAt: new Date().toISOString() });
        await sendBotText(targetTicket.id, template, { tentativa: attempt, limite: botConfig.customer_name_attempt_limit });
        return { type: 'chatbot_asking_name', ticket: targetTicket };
      };
      const startDepartmentRouting = async targetTicket => {
        // O número dedicado define o destino, mas continua passando pelo bot e
        // chega à fila sem responsável. Somente grupos são permanentes/assumidos.
        if (dedicatedDepartment) {
          const held = await holdOutsideBusinessHours(targetTicket, dedicatedDepartment, text);
          if (held) return held;
          const updatePayload = {
            status: 'aguardando',
            assumed: false,
            user_id: null,
            agent_name: null,
            assumed_at: null,
            queued_at: now.toISOString(),
            scheduled_queue_at: null,
            department: dedicatedDepartment.name,
            department_id: dedicatedDepartment.id,
            time: t,
            preview: String(targetTicket.preview || text || '').slice(0, 50),
            unread_count: Math.max(1, Number(targetTicket.unread_count || 0)),
            updated_at: now.toISOString()
          };
          assertSupabase(await supabase.from('tickets').update(updatePayload).eq('id', targetTicket.id), 'Falha ao encaminhar ticket dedicado');
          Object.assign(targetTicket, updatePayload);
          await supabase.from('messages').insert({
            ticket_id: targetTicket.id,
            sender: 'system',
            type: 'divider',
            text: `[Chatbot] Atendimento encaminhado para: ${dedicatedDepartment.name}`,
            time: t
          });
          if (botConfig.send_queue_confirmation) {
            await sendBotText(targetTicket.id, botConfig.queue_confirmation_message, { departamento: dedicatedDepartment.name });
          }
          const fullTicket = await this.getFullTicket(targetTicket.id);
          if (io && fullTicket) {
            emitTicketEvent(io, 'ticket_created', { ticket: fullTicket }, fullTicket);
            scheduleKpiUpdate(io);
          }
          return { type: 'dedicated_routed', ticket: fullTicket || targetTicket };
        }

        const since = new Date(Date.now() - botConfig.resume_window_hours * 60 * 60 * 1000).toISOString();
        let lastClosedTicket = null;
        try {
          let recentTicketQuery = supabase
            .from('tickets')
            .select('id, department, department_id, agent_name, updated_at')
            .or(`phone.eq.${phone},jid.eq.${from}`)
            .eq('status', 'finalizado')
            .gte('updated_at', since);
          recentTicketQuery = scopeWhatsAppChannel(recentTicketQuery);
          const result = await recentTicketQuery.order('updated_at', { ascending: false }).limit(1).maybeSingle();
          if (!result.error && result.data?.department) lastClosedTicket = result.data;
        } catch (_) {}

        if (!forceDepartmentMenu && botConfig.resume_recent_enabled && lastClosedTicket) {
          const previousDepartment = lastClosedTicket.department;
          await saveBotState(targetTicket.id, {
            step: 'awaiting_resume',
            department: previousDepartment,
            promptedAt: new Date().toISOString()
          });
          assertSupabase(await supabase.from('messages').insert({
            ticket_id: targetTicket.id,
            sender: 'system',
            type: 'divider',
            text: `[Chatbot] Menu 24h enviado: Retomar ${previousDepartment}`,
            time: t
          }), 'Falha ao registrar menu de retomada');
          await sendBotText(targetTicket.id, botConfig.resume_message, { departamento: previousDepartment });
          return { type: 'chatbot_resume_prompt', ticket: targetTicket };
        }

        if (deptList.length > 0) {
          await saveBotState(targetTicket.id, { step: 'awaiting_department', promptedAt: new Date().toISOString() });
          await sendBotText(targetTicket.id, botConfig.greeting_message, { opcoes: botConfig.show_department_menu ? optionsText : '' });
        }
        return { type: 'chatbot_greeting', ticket: targetTicket };
      };

      // 1. Verifica se o cliente já possui um ticket ATIVO (chatbot, aguardando ou em_atendimento)
      const lookupConditions = [];
      if (phone) lookupConditions.push(`phone.eq.${phone}`);
      if (from) lookupConditions.push(`jid.eq.${from}`);
      if (outboundJid && outboundJid !== from) lookupConditions.push(`jid.eq.${outboundJid}`);
      if (rawJid && rawJid !== from) {
        lookupConditions.push(`raw_jid.eq.${rawJid}`);
        lookupConditions.push(`jid.eq.${rawJid}`);
      }
      const rawLidNum = rawJid ? rawJid.replace('@lid', '').replace(/:\d+$/, '') : null;
      if (rawLidNum && rawLidNum !== phone && /^\d+$/.test(rawLidNum)) {
        lookupConditions.push(`phone.eq.${rawLidNum}`);
      }

      let activeTicketQuery = supabase
        .from('tickets')
        .select('*')
        .or(lookupConditions.join(','))
        .in('status', ['aguardando', 'em_atendimento', 'chatbot', 'fora_horario']);
      activeTicketQuery = scopeWhatsAppChannel(activeTicketQuery);
      let { data: ticket } = await activeTicketQuery
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ticket && phone && phone.length <= 15 && (ticket.phone !== phone || ticket.jid !== outboundJid || ticket.raw_jid !== rawJid)) {
        await supabase.from('tickets').update({ phone, jid: outboundJid, raw_jid: rawJid || from }).eq('id', ticket.id);
        ticket.phone = phone;
        ticket.jid = outboundJid;
        ticket.raw_jid = rawJid || from;
        if (ticket.contact_id) {
          await supabase.from('contacts').update({ phone }).eq('id', ticket.contact_id);
        }
      }

      if (ticket && knownContact && (isGeneratedCustomerName(ticket.client_name) || Boolean(ticket.is_employee) !== isEmployee || ticket.contact_id !== knownContact.id)) {
        const updatedIdentity = {
          contact_id: knownContact.id,
          is_employee: isEmployee,
          ...(knownContact.avatar_url ? { avatar_url: knownContact.avatar_url } : {}),
          ...(knownContact.name && isGeneratedCustomerName(ticket.client_name) ? {
            client_name: knownContact.name,
            initials: knownContact.name.substring(0, 2).toUpperCase()
          } : {})
        };
        const result = await supabase.from('tickets').update(updatedIdentity).eq('id', ticket.id);
        if (!result.error) Object.assign(ticket, updatedIdentity);
      }

      // Uma conversa atendida pelo celular permanece humana enquanto estiver
      // ativa. Ela volta ao bot somente por encerramento, inatividade ou quando
      // o próprio cliente pede explicitamente um novo atendimento/menu.
      const legacyUnassignedExternalTicket = ticket && ticket.status === 'em_atendimento'
        && !ticket.user_id
        && (['whatsapp_device', 'mixed'].includes(ticket.handled_via) || String(ticket.agent_name || '').startsWith('WhatsApp ('));
      if (legacyUnassignedExternalTicket) {
        const waitingPayload = { status: 'aguardando', assumed: false, assumed_at: null, agent_name: null, user_id: null };
        const resetResult = await supabase.from('tickets').update(waitingPayload).eq('id', ticket.id);
        if (!resetResult.error) Object.assign(ticket, waitingPayload);
      }

      const isExternalHumanTicket = ticket && ticket.status === 'em_atendimento'
        && Boolean(ticket.user_id)
        && (['whatsapp_device', 'mixed'].includes(ticket.handled_via) || String(ticket.agent_name || '').startsWith('WhatsApp ('));
      if (isExternalHumanTicket) {
        const inactiveForMs = Date.now() - new Date(ticket.updated_at || ticket.created_at || now).getTime();
        const expired = botConfig.auto_close_external_service
          && inactiveForMs >= botConfig.external_service_idle_minutes * 60 * 1000;
        const requestedRestart = matchesNewServiceRequest(text, botConfig.restart_service_keywords);
        if (expired || requestedRestart) {
          forceDepartmentMenu = requestedRestart;
          await this.finalizeExternalTicket(ticket, {
            io,
            whatsappService,
            botConfig,
            sendRating: expired && botConfig.send_rating_on_external_inactivity,
            reason: requestedRestart ? 'Novo atendimento solicitado pelo cliente' : 'Inatividade no WhatsApp'
          });
          ticket = null;
        }
      }

      // 2. Se NÃO houver ticket ativo, verifica se é uma resposta de avaliação (1 a 5) para um ticket finalizado
      if (!ticket) {
        const rawRating = parseRatingInput(text);
        if (rawRating !== null) {
          let ratingTicketQuery = supabase
            .from('tickets')
            .select('id, status, phone, jid, raw_jid, encerrado_por, agent_name, department_id, updated_at, closed_at, is_employee, awaiting_rating')
            .or(`phone.eq.${phone},jid.eq.${from}`)
            .eq('status', 'finalizado');
          ratingTicketQuery = scopeWhatsAppChannel(ratingTicketQuery);
          const { data: closedTickets } = await ratingTicketQuery
            .order('updated_at', { ascending: false })
            .limit(3);

          if (closedTickets && closedTickets.length > 0) {
            const nowMs = Date.now();
            const targetTicket = closedTickets.find(ct => isRatingEligibleTicket(ct, botConfig.rating_window_minutes, nowMs));

            if (targetTicket) {
              console.log(`⭐ Avaliação confirmada: ${rawRating} estrelas | Ticket ${targetTicket.id}`);

              try {
                await supabase.from('tickets').update({ awaiting_rating: false, updated_at: new Date().toISOString() }).eq('id', targetTicket.id);
              } catch (_) {}

              try {
                const ratingResult = await supabase.from('ratings').insert({
                  id: crypto.randomUUID(),
                  ticket_id: targetTicket.id,
                  agent_name: targetTicket.encerrado_por || targetTicket.agent_name || 'Atendente',
                  score: rawRating,
                  phone: phone,
                  jid: from
                });
                if (ratingResult.error) {
                  assertSupabase(await supabase.from('avaliacoes').insert({
                    id: crypto.randomUUID(),
                    ticket_id: targetTicket.id,
                    agent_name: targetTicket.encerrado_por || targetTicket.agent_name || 'Atendente',
                    rating: rawRating,
                    phone,
                    jid: from
                  }), 'Falha ao salvar avaliação');
                }
              } catch(errRating) { console.error(errRating.message); }

              try {
                await supabase.from('messages').insert({
                  ticket_id: targetTicket.id,
                  sender: 'system',
                  type: 'divider',
                  text: `⭐ Avaliação do cliente recebida: ${rawRating} de 5 estrelas`,
                  time: makeTimeStr(new Date())
                });
              } catch(e) {}

              if (io) {
                emitTicketEvent(io, 'rating_received', {
                  ticketId: targetTicket.id,
                  rating: rawRating,
                  agentName: targetTicket.encerrado_por || targetTicket.agent_name
                }, targetTicket);
                scheduleKpiUpdate(io);
              }

              // Envia mensagem de agradecimento ao cliente
              if (whatsappService) {
                const stars = '⭐'.repeat(rawRating);
                try {
                  await sendBotText(targetTicket.id, botConfig.rating_thank_you_message, { estrelas: stars, nome: cleanName });
                } catch(e) {}
              }

              return { type: 'rating', rating: rawRating, ticketId: targetTicket.id };
            }
          }
        }
      }

      // 3. Se ainda não tem ticket ativo, cria o atendimento e inicia a identificação/roteamento.
      if (!ticket) {
        const { data: insertedTicket, error: insertError } = await supabase.from('tickets').insert({
          id: crypto.randomUUID(),
          client_name: cleanName,
          initials: cleanName.substring(0, 2).toUpperCase(),
          phone,
          jid: outboundJid,
          raw_jid: rawJid,
          time: t,
          preview: text.slice(0, 50),
          status: botConfig.enabled ? 'chatbot' : 'aguardando',
          assumed: false,
          user_id: null,
          agent_name: null,
          assumed_at: null,
          channel: whatsappChannel,
          unread_count: 0,
          avatar_url: knownContact?.avatar_url || null,
          is_employee: isEmployee
        }).select().single();
        if (insertError) throw insertError;
        ticket = insertedTicket;

        // Auto-salva o contato no banco se ainda não existe cadastro e o nome não for genérico
        if (!knownContact && !isGeneratedCustomerName(cleanName)) {
          try {
            const saved = await saveConfirmedContact(phone, cleanName);
            if (saved?.id) {
              await supabase.from('tickets').update({ contact_id: saved.id }).eq('id', ticket.id);
              ticket.contact_id = saved.id;
            }
          } catch (_) {}
        }

        if (!botConfig.enabled) return routeWithoutBot(ticket, text);

        assertSupabase(await supabase.from('messages').insert(incomingMessagePayload(ticket.id, 'bot')), 'Falha ao registrar mensagem inicial');

        if (botConfig.collect_customer_name && needsCustomerName) return askForCustomerName(ticket);
        return startDepartmentRouting(ticket);
      }

      if (ticket.status === 'fora_horario') {
        assertSupabase(await supabase.from('messages').insert(incomingMessagePayload(ticket.id, 'bot')), 'Falha ao registrar mensagem fora do expediente');
        const updatePayload = {
          preview: text.slice(0, 50),
          unread_count: Math.max(1, Number(ticket.unread_count || 0) + 1),
          updated_at: now.toISOString()
        };
        await supabase.from('tickets').update(updatePayload).eq('id', ticket.id);
        Object.assign(ticket, updatePayload);
        return { type: 'after_hours_message_saved', ticket };
      }

      // Processa resposta ao Chatbot
      if (ticket.status === 'chatbot') {
         if (!botConfig.enabled) return routeWithoutBot(ticket, text);
         const cleanText = text.trim();
         assertSupabase(await supabase.from('messages').insert(incomingMessagePayload(ticket.id, 'bot')), 'Falha ao registrar resposta ao bot');

         const botState = await getLatestBotState(ticket.id);
         const arrivedBeforePrompt = state => messageWasSentBeforePrompt(
           msgData.timestamp,
           state?.promptedAt,
           botConfig.rapid_message_grace_seconds
         );
         const ignoreEarlyMessage = state => {
           console.log(`[Chatbot] Mensagem recebida antes do prompt foi preservada e não contou como erro (ticket ${ticket.id}, etapa ${state?.step || 'desconhecida'}).`);
           return { type: 'chatbot_early_message_ignored', ticket };
         };

         // Verifica se o cliente solicitou cancelamento/encerramento do atendimento
         if (botConfig.allow_customer_cancel && matchesCustomerCancellation(cleanText, botConfig.cancel_keywords)) {
           console.log(`🚫 Atendimento cancelado pelo cliente no bot: Ticket ${ticket.id} (${cleanName})`);
           const encerradoEm = makeTimeStr(now);
           const closePayload = {
             status: 'finalizado',
             assumed: false,
             encerrado_em: encerradoEm,
             encerrado_por: 'Cliente',
             closed_at: now.toISOString(),
             unread_count: 0,
             updated_at: now.toISOString()
           };
           await supabase.from('tickets').update(closePayload).eq('id', ticket.id);
           Object.assign(ticket, closePayload);

           await supabase.from('messages').insert({
             ticket_id: ticket.id,
             sender: 'system',
             type: 'divider',
             text: '🚫 [Chatbot] Atendimento cancelado pelo cliente',
             time: encerradoEm
           });

           try {
             await sendBotText(ticket.id, botConfig.customer_cancel_message, { nome: cleanName });
           } catch (_) {}

           if (io) {
             emitTicketEvent(io, 'ticket_closed', { ticketId: ticket.id, status: 'finalizado', closed_at: now.toISOString(), encerrado_por: 'Cliente' }, ticket);
             emitTicketEvent(io, 'queue_updated', { ticket }, ticket);
             scheduleKpiUpdate(io);
           }

           return { type: 'customer_cancelled', ticket };
         }

         if (botConfig.human_handoff_enabled && matchesHumanHandoff(cleanText, botConfig.human_handoff_keywords)) {
           return routeWithoutBot(ticket, text, false, botConfig.human_handoff_message);
         }

         if (msgData.mediaType && !botConfig.accept_media_during_routing) {
           try { await sendBotText(ticket.id, botConfig.media_during_routing_message); } catch(e) {}
           return { type: 'chatbot_media_blocked', ticket };
         }
         if (msgData.mediaType) {
           if (arrivedBeforePrompt(botState)) return ignoreEarlyMessage(botState);
           try {
             if (botConfig.collect_customer_name && botState?.step === 'confirming_name') {
               await sendBotText(ticket.id, botConfig.confirm_customer_name_message, { nome: botState.candidate });
             } else if (botConfig.collect_customer_name && botState?.step === 'awaiting_name') {
               await sendBotText(ticket.id, botConfig.ask_customer_name_message);
             } else {
               await sendBotText(ticket.id, botConfig.greeting_message, { opcoes: botConfig.show_department_menu ? optionsText : '' });
             }
           } catch(e) {}
           return { type: 'chatbot_media_received', ticket };
         }

         // Fluxo de coleta de nome — só entra se a opção estiver ativada
         if (botConfig.collect_customer_name && botState?.step === 'awaiting_name') {
           if (arrivedBeforePrompt(botState)) return ignoreEarlyMessage(botState);
           const validation = extractAndValidateName(cleanText, botConfig, deptList);
           if (!validation.valid) {
             const nextAttempt = (botState.attempt || 1) + 1;
             if (nextAttempt > botConfig.customer_name_attempt_limit) {
               await saveBotState(ticket.id, { step: 'name_skipped' });
               await sendBotText(ticket.id, botConfig.customer_name_skipped_message);
               return startDepartmentRouting(ticket);
             }
             return askForCustomerName(ticket, nextAttempt, botConfig.invalid_customer_name_message);
           }

           await saveBotState(ticket.id, {
             step: 'confirming_name',
             candidate: validation.name,
             attempt: botState.attempt || 1,
             promptedAt: new Date().toISOString()
           });
           await sendBotText(ticket.id, botConfig.confirm_customer_name_message, {
             nome: validation.name,
             tentativa: botState.attempt || 1,
             limite: botConfig.customer_name_attempt_limit
           });
           return { type: 'chatbot_confirming_name', ticket, candidate: validation.name };
         }

         if (botConfig.collect_customer_name && botState?.step === 'confirming_name') {
           const nameDecision = resolveNameConfirmation(cleanText);
           if (nameDecision === 'confirm') {
             let contactId = null;
             try {
               const contact = await saveConfirmedContact(phone, botState.candidate);
               contactId = contact?.id || null;
             } catch (errContact) {
               console.warn('Aviso: falha ao salvar contato após confirmação de nome:', errContact.message);
             }
             cleanName = botState.candidate;
             const identity = {
               client_name: cleanName,
               initials: cleanName.substring(0, 2).toUpperCase(),
               ...(contactId ? { contact_id: contactId } : {})
             };
             try {
               assertSupabase(await supabase.from('tickets').update(identity).eq('id', ticket.id), 'Falha ao vincular contato ao ticket');
             } catch (_) {}
             Object.assign(ticket, identity);
             await saveBotState(ticket.id, { step: 'name_complete' });
             await sendBotText(ticket.id, botConfig.customer_name_saved_message, { nome: cleanName });
             return startDepartmentRouting(ticket);
           }
           if (nameDecision === 'correct') return askForCustomerName(ticket, botState.attempt || 1);
           if (arrivedBeforePrompt(botState)) return ignoreEarlyMessage(botState);
           await saveBotState(ticket.id, { ...botState, promptedAt: new Date().toISOString() });
           await sendBotText(ticket.id, botConfig.confirm_customer_name_message, { nome: botState.candidate });
           return { type: 'chatbot_confirming_name', ticket, candidate: botState.candidate };
         }

         // Só pede o nome novamente se collect_customer_name está ativado e nenhum estado de nome existe ainda
         if (botConfig.collect_customer_name && needsCustomerName && isGeneratedCustomerName(ticket.client_name) && !botState) {
           return askForCustomerName(ticket);
         }

         // Estado estruturado é a fonte principal; a busca textual mantém compatibilidade
         // com tickets que já estavam abertos antes desta versão.
         let isWaitingResume = botState?.step === 'awaiting_resume';
         let resumeTargetDept = isWaitingResume ? botState.department : null;
         if (!isWaitingResume) {
           const { data: chatbotMsgs } = await supabase
             .from('messages')
             .select('text')
             .eq('ticket_id', ticket.id)
             .like('text', '[Chatbot]%')
             .order('created_at', { ascending: false })
             .limit(1);
           isWaitingResume = chatbotMsgs?.[0]?.text?.startsWith('[Chatbot] Menu 24h enviado: Retomar') || false;
           if (isWaitingResume) {
             const match = chatbotMsgs[0].text.match(/\[Chatbot\] Menu 24h enviado: Retomar (.+)/);
             if (match) resumeTargetDept = match[1].trim();
           }
         }

         let selectedDept = null;

         // Se estava aguardando resposta do menu de 24 horas:
         if (isWaitingResume && resumeTargetDept) {
           const resumeChoice = resolveResumeChoice(cleanText);

           if (resumeChoice === 'resume') {
             selectedDept = deptList.find(d => d.name.toLowerCase() === resumeTargetDept.toLowerCase()) || { name: resumeTargetDept };
           } else if (resumeChoice === 'other') {
             // Cliente optou por outro departamento -> envia menu padrão com todos os setores
             // Registra que o cliente escolheu ver outro departamento
             await supabase.from('messages').insert({
               ticket_id: ticket.id,
               sender: 'system',
               type: 'divider',
               text: `[Chatbot] Cliente escolheu outro departamento`,
               time: t
             });

             await saveBotState(ticket.id, { step: 'awaiting_department', promptedAt: new Date().toISOString() });
             try { await sendBotText(ticket.id, botConfig.greeting_message, { opcoes: botConfig.show_department_menu ? optionsText : '' }); } catch(e) {}
             return { type: 'chatbot_menu_sent', ticket };
           } else if (arrivedBeforePrompt(botState)) {
             return ignoreEarlyMessage(botState);
           } else {
             // Nesta etapa somente 1 ou 2 são válidos. Números de departamentos
             // só podem ser interpretados depois que o menu completo for aberto.
             await saveBotState(ticket.id, { step: 'awaiting_resume', department: resumeTargetDept, promptedAt: new Date().toISOString() });
             await sendBotText(ticket.id, botConfig.resume_message, { departamento: resumeTargetDept });
             return { type: 'chatbot_resume_invalid', ticket };
           }
         }

         // Reconhece número, nome, siglas, frases naturais e pequenos erros de digitação.
         if (!selectedDept && !(isWaitingResume && resumeTargetDept)) {
           selectedDept = resolveDepartmentIntent(cleanText, deptList, {
             acceptDepartmentName: botConfig.accept_department_name
           })?.department || null;
         }

         if (selectedDept) {
            const held = await holdOutsideBusinessHours(ticket, selectedDept, text);
            if (held) return held;
            let updatePayload = {
              status: 'aguardando',
              assumed: false,
              user_id: null,
              agent_name: null,
              assumed_at: null,
              queued_at: now.toISOString(),
              scheduled_queue_at: null,
              time: t,
              preview: text.slice(0, 50),
              updated_at: now.toISOString(),
              unread_count: 1
            };
            // Só adiciona department_id se for um UUID real (length > 10)
            if (selectedDept.id && selectedDept.id.length > 10) {
                updatePayload.department_id = selectedDept.id;
            }
            if (selectedDept.name) {
                updatePayload.department = selectedDept.name;
            }
            const { error: updErr } = await supabase.from('tickets').update(updatePayload).eq('id', ticket.id);
            if (updErr) console.error("Erro ao atualizar ticket para aguardando:", updErr.message);

            ticket.status = 'aguardando';
            ticket.department = selectedDept.name;
            ticket.unread_count = 1;
            ticket.preview = text.slice(0, 50);
            
            // Registra a escolha como uma mensagem do sistema
            await supabase.from('messages').insert({ ticket_id: ticket.id, sender: 'system', type: 'divider', text: `[Chatbot] Cliente escolheu: ${selectedDept.name}`, time: t });

            // Envia confirmação
            if (whatsappService && botConfig.send_queue_confirmation) {
              try { await sendBotText(ticket.id, botConfig.queue_confirmation_message, { departamento: selectedDept.name }); } catch(e) {}
            }

            const fullTicket = await this.getFullTicket(ticket.id);
            // Notifica o frontend com dados completos do ticket e departamento real
            if (io && fullTicket) {
              emitTicketEvent(io, 'ticket_created', { ticket: fullTicket }, fullTicket);
              scheduleKpiUpdate(io);
            }
            
            return { type: 'chatbot_routed', ticket: fullTicket || ticket };
         } else {
             // Se o cliente digitou uma saudação ou comando para reiniciar menu
             const isGreeting = matchesMenuRequest(cleanText, botConfig.menu_keywords);

             if (whatsappService) {
                if (isGreeting || deptList.length === 0) {
                  await saveBotState(ticket.id, { step: 'awaiting_department', promptedAt: new Date().toISOString() });
                  try { await sendBotText(ticket.id, botConfig.greeting_message, { opcoes: botConfig.show_department_menu ? optionsText : '' }); } catch(e) {}
                } else {
                  if (arrivedBeforePrompt(botState)) return ignoreEarlyMessage(botState);
                  const { count: previousInvalidAttempts } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('ticket_id', ticket.id)
                    .eq('sender', 'system')
                    .eq('text', '[Chatbot] Opção inválida');
                  const attempt = (previousInvalidAttempts || 0) + 1;
                  await supabase.from('messages').insert({ ticket_id: ticket.id, sender: 'system', type: 'divider', text: '[Chatbot] Opção inválida', time: t });

                  if (botConfig.auto_route_after_invalid && attempt >= botConfig.invalid_attempt_limit) {
                    return routeWithoutBot(ticket, text, false, botConfig.fallback_routing_message);
                  }

                  await saveBotState(ticket.id, { step: isWaitingResume ? 'awaiting_resume' : 'awaiting_department', department: resumeTargetDept, promptedAt: new Date().toISOString() });
                  try { await sendBotText(ticket.id, botConfig.invalid_option_message, { tentativa: attempt }); } catch(e) {}
                }
             }
             return { type: 'chatbot_invalid', ticket };
          }
      }

      // Ticket em andamento (aguardando ou em_atendimento)
       if (ticket.status === 'aguardando') {
         if (botConfig.allow_customer_cancel && matchesCustomerCancellation(text, botConfig.cancel_keywords)) {
           console.log(`🚫 Atendimento na fila cancelado pelo cliente: Ticket ${ticket.id} (${cleanName})`);
           const encerradoEm = makeTimeStr(now);
           const closePayload = {
             status: 'finalizado',
             assumed: false,
             encerrado_em: encerradoEm,
             encerrado_por: 'Cliente',
             closed_at: now.toISOString(),
             unread_count: 0,
             updated_at: now.toISOString()
           };
           await supabase.from('tickets').update(closePayload).eq('id', ticket.id);
           Object.assign(ticket, closePayload);

           await supabase.from('messages').insert({
             ticket_id: ticket.id,
             sender: 'system',
             type: 'divider',
             text: '🚫 Atendimento cancelado pelo cliente na fila de espera',
             time: encerradoEm
           });

           try {
             await sendBotText(ticket.id, botConfig.customer_cancel_message, { nome: cleanName });
           } catch (_) {}

           if (io) {
             emitTicketEvent(io, 'ticket_closed', { ticketId: ticket.id, status: 'finalizado', closed_at: now.toISOString(), encerrado_por: 'Cliente' }, ticket);
             emitTicketEvent(io, 'queue_updated', { ticket }, ticket);
             scheduleKpiUpdate(io);
           }

           return { type: 'customer_cancelled', ticket };
         }
       }

      const newUnread = (ticket.unread_count || 0) + 1;
      await supabase.from('tickets').update({ preview: text.slice(0, 50), time: t, updated_at: now.toISOString(), unread_count: newUnread }).eq('id', ticket.id);
      ticket.preview = text.slice(0, 50); ticket.time = t; ticket.unread_count = newUnread;
      
      const { mediaType, mediaUrl } = msgData;
      let savedMsg = null;

      try {
        const msgPayload = incomingMessagePayload(ticket.id);

        const { data: insertedMsg, error: msgError } = await supabase.from('messages').insert(msgPayload).select().single();
        if (msgError) {
          if (msgError.code === '23505') return { type: 'duplicate', messageId: msgData.messageId };
          if (isMissingRemoteMessageColumns(msgError)) remoteMessageColumnsAvailable = false;
          // Fallback caso a tabela messages não tenha a coluna media_url
          const { data: fallbackMsg } = await supabase.from('messages').insert({ ticket_id: ticket.id, sender: 'client', text, time: t }).select().single();
          savedMsg = fallbackMsg;
        } else {
          savedMsg = insertedMsg;
        }
      } catch (err) {
        const { data: fallbackMsg } = await supabase.from('messages').insert({ ticket_id: ticket.id, sender: 'client', text, time: t }).select().single();
        savedMsg = fallbackMsg;
      }

      if (savedMsg) {
        if (mediaUrl) {
          const mediaSize = msgData.fileSize || this.getMediaSize(mediaUrl, msgData.fileName);
          savedMsg.media_url = mediaUrl;
          savedMsg.mediaUrl = mediaUrl;
          savedMsg.type = mediaType;
          savedMsg.media_size = mediaSize || null;
          savedMsg.file_size = mediaSize || null;
        }
      }
      
      if (io) {
        emitTicketEvent(io, 'new_message', { ticketId: ticket.id, message: savedMsg, ticket }, ticket);
      }
      return { ticket, message: savedMsg };
    } catch (e) {
      console.error('Erro no Supabase ao processar mensagem:', e);
      return null;
    }
  }

  async processWhatsAppReaction(msgData, io) {
    if (!isSupabaseConfigured()) return null;
    const {
      from,
      rawJid,
      phone: rawPhone,
      sender = 'client',
      senderName,
      emoji = '',
      targetMessageId,
      targetPreview = 'Mensagem',
      timestamp,
      messageId,
      whatsappAccountId
    } = msgData;

    try {
      await ensureConversationTrackingColumns();
      if (await wasRemoteMessageProcessed(whatsappAccountId, messageId)) {
        return { type: 'duplicate_reaction', messageId };
      }

      const targetJid = rawJid || from;
      const phone = phoneFromWhatsAppIdentity(rawPhone, targetJid);
      const channel = whatsappAccountId ? `whatsapp:${whatsappAccountId}` : 'whatsapp';
      let originalMessage = null;
      let ticket = null;

      if (targetMessageId && remoteMessageColumnsAvailable !== false) {
        const originalResult = await supabase
          .from('messages')
          .select('ticket_id, text, type, file_name')
          .eq('whatsapp_account_id', whatsappAccountId)
          .eq('remote_message_id', targetMessageId)
          .limit(1)
          .maybeSingle();
        if (originalResult.error && isMissingRemoteMessageColumns(originalResult.error)) {
          remoteMessageColumnsAvailable = false;
        } else if (!originalResult.error && originalResult.data) {
          remoteMessageColumnsAvailable = true;
          originalMessage = originalResult.data;
          const ticketResult = await supabase.from('tickets').select('*').eq('id', originalMessage.ticket_id).maybeSingle();
          if (!ticketResult.error) ticket = ticketResult.data;
        }
      }

      if (!ticket) {
        const identities = [
          phone ? `phone.eq.${phone}` : null,
          targetJid ? `jid.eq.${targetJid}` : null,
          targetJid ? `raw_jid.eq.${targetJid}` : null
        ].filter(Boolean);
        if (!identities.length) return { type: 'reaction_without_identity', messageId };
        let ticketQuery = supabase.from('tickets').select('*').or(identities.join(','));
        ticketQuery = whatsappAccountId === 'default'
          ? ticketQuery.in('channel', ['whatsapp', channel])
          : ticketQuery.eq('channel', channel);
        const ticketResult = await ticketQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (ticketResult.error) throw ticketResult.error;
        ticket = ticketResult.data;
      }
      if (!ticket) return { type: 'reaction_without_ticket', messageId };

      const originalFallback = ({
        image: '📷 Imagem', sticker: '🖼️ Figurinha', video: '🎥 Vídeo',
        audio: '🎙️ Áudio', document: `📄 ${originalMessage?.file_name || 'Documento'}`
      })[originalMessage?.type];
      const quotedText = String(originalMessage?.text || originalFallback || targetPreview || 'Mensagem')
        .replace(/^\*[^*]+:\*\s*/s, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'Mensagem';
      const removed = !String(emoji).trim();
      const reactionText = JSON.stringify({
        emoji: removed ? '↩️' : String(emoji).trim().slice(0, 16),
        preview: quotedText,
        targetMessageId: targetMessageId || null,
        removed
      });
      const messageDateMs = whatsappTimestampMs(timestamp);
      const date = messageDateMs ? new Date(messageDateMs) : new Date();
      const payload = {
        ticket_id: ticket.id,
        sender: sender === 'agent' ? 'agent' : 'client',
        sender_type: sender === 'agent' ? 'whatsapp_device' : 'customer',
        sender_name: senderName || (sender === 'agent' ? 'WhatsApp' : ticket.client_name),
        message_context: 'service',
        type: 'reaction',
        text: reactionText,
        time: makeTimeStr(date),
        remote_message_id: messageId || null,
        whatsapp_account_id: whatsappAccountId || null,
        created_at: date.toISOString()
      };
      let insertResult = await supabase.from('messages').insert(payload).select().single();
      if (insertResult.error?.code === '23505') return { type: 'duplicate_reaction', messageId, ticket };
      if (insertResult.error && isMissingConversationTrackingColumns(insertResult.error)) {
        conversationTrackingColumnsAvailable = false;
        delete payload.sender_type;
        delete payload.sender_name;
        delete payload.message_context;
        insertResult = await supabase.from('messages').insert(payload).select().single();
      }
      const savedMessage = assertSupabase(insertResult, 'Falha ao salvar reação do WhatsApp');

      if (['chatbot', 'aguardando', 'em_atendimento'].includes(ticket.status)) {
        const updatePayload = {
          preview: removed ? 'Reação removida' : `${String(emoji).trim()} Reagiu a uma mensagem`,
          time: makeTimeStr(date),
          updated_at: date.toISOString()
        };
        if (sender !== 'agent') updatePayload.unread_count = (ticket.unread_count || 0) + 1;
        const updateResult = await supabase.from('tickets').update(updatePayload).eq('id', ticket.id);
        if (!updateResult.error) Object.assign(ticket, updatePayload);
      }

      const fullTicket = await this.getFullTicket(ticket.id);
      const emittedTicket = fullTicket || ticket;
      if (io) {
        emitTicketEvent(io, 'new_message', { ticketId: ticket.id, message: savedMessage, ticket: emittedTicket }, emittedTicket);
        if (['chatbot', 'aguardando', 'em_atendimento'].includes(ticket.status)) {
          emitTicketEvent(io, 'ticket_updated', { ticket: emittedTicket }, emittedTicket);
        }
      }
      return { type: removed ? 'reaction_removed' : 'reaction_saved', ticket: emittedTicket, message: savedMessage };
    } catch (error) {
      console.error(`Erro ao processar reação do WhatsApp: ${error.message}`);
      return null;
    }
  }

  async processExternalWhatsAppMessage(msgData, io, whatsappService = null) {
    if (!isSupabaseConfigured()) return null;
    const {
      from,
      rawJid,
      phone: rawPhone,
      text = '',
      mediaType,
      mediaUrl,
      fileName,
      timestamp,
      messageId,
      whatsappAccountId,
      whatsappAccountName,
      whatsappRoutingMode,
      whatsappDepartmentId,
      whatsappDepartmentName,
      whatsappFallbackDepartmentId,
      whatsappFallbackDepartmentName
    } = msgData;
    try {
      await ensureConversationTrackingColumns();
      if (await wasRemoteMessageProcessed(whatsappAccountId, messageId)) {
        return { type: 'duplicate', messageId };
      }

      const targetJid = rawJid || from;
      const phone = phoneFromWhatsAppIdentity(rawPhone, targetJid);
      const outboundJid = preferredWhatsAppJid(phone, targetJid);
      const channel = whatsappAccountId ? `whatsapp:${whatsappAccountId}` : 'whatsapp';
      const now = new Date();
      const messageDateMs = whatsappTimestampMs(timestamp);
      const createdAt = messageDateMs ? new Date(messageDateMs).toISOString() : now.toISOString();
      const time = makeTimeStr(messageDateMs ? new Date(messageDateMs) : now);
      const accountLabel = String(whatsappAccountName || 'celular').trim().slice(0, 80);
      const senderLabel = `WhatsApp (${accountLabel})`;
      const previewText = text || ({ audio: '🎙️ Áudio', image: '📷 Imagem', video: '🎥 Vídeo', document: `📄 ${fileName || 'Documento'}` }[mediaType] || 'Mensagem enviada pelo WhatsApp');

      const lookup = [];
      if (phone) lookup.push(`phone.eq.${phone}`);
      if (targetJid) lookup.push(`jid.eq.${targetJid}`);
      if (outboundJid && outboundJid !== targetJid) lookup.push(`jid.eq.${outboundJid}`);
      if (rawJid && rawJid !== targetJid) lookup.push(`raw_jid.eq.${rawJid}`);

      let ticket = null;
      if (lookup.length > 0) {
        let activeQuery = supabase.from('tickets').select('*').or(lookup.join(',')).in('status', ['chatbot', 'aguardando', 'em_atendimento']);
        activeQuery = whatsappAccountId === 'default'
          ? activeQuery.in('channel', ['whatsapp', channel])
          : activeQuery.eq('channel', channel);
        const { data: activeFound, error: activeError } = await activeQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (activeError) throw activeError;
        ticket = activeFound;
      }
      let createdTicket = false;
      let knownContact = await findContactByPhone(phone);

      let previousTicket = null;
      if (!ticket) {
        if (lookup.length > 0) {
          let previousQuery = supabase.from('tickets').select('client_name, initials, contact_id, department, department_id, agent_name, handled_via, is_employee').or(lookup.join(','));
          previousQuery = whatsappAccountId === 'default'
            ? previousQuery.in('channel', ['whatsapp', channel])
            : previousQuery.eq('channel', channel);
          const previousResult = await previousQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (!previousResult.error) previousTicket = previousResult.data;
        }

        if (!knownContact && phone) {
          try {
            knownContact = await ensureWhatsAppContact(
              phone,
              previousTicket?.client_name || `Cliente ${phone.slice(-4)}`
            );
          } catch (contactError) {
            console.warn(`Falha ao cadastrar automaticamente contato do WhatsApp: ${contactError.message}`);
          }
        }

        const departments = await getCachedDepartments();
        const botConfig = await getBotConfig();
        const dedicatedDepartment = whatsappRoutingMode === 'department'
          ? departments.find(department => String(department.id) === String(whatsappDepartmentId)
            || normalizeBotInput(department.name) === normalizeBotInput(whatsappDepartmentName))
          : null;
        const accountFallbackDepartment = departments.find(department =>
          String(department.id) === String(whatsappFallbackDepartmentId || '') ||
          (whatsappFallbackDepartmentName && normalizeBotInput(department.name) === normalizeBotInput(whatsappFallbackDepartmentName))
        ) || null;
        const inheritedDepartment = previousTicket?.department_id
          ? departments.find(department => String(department.id) === String(previousTicket.department_id))
          : null;
        const targetDepartment = dedicatedDepartment || accountFallbackDepartment || inheritedDepartment
          || departments.find(department => String(department.id) === String(botConfig.default_department_id))
          || departments[0] || null;
        const clientName = knownContact?.name || previousTicket?.client_name || (phone ? `Cliente ${phone.slice(-4)}` : 'Cliente');
        const ticketPayload = {
          id: crypto.randomUUID(),
          client_name: clientName,
          initials: clientName.substring(0, 2).toUpperCase(),
          contact_id: knownContact?.id || previousTicket?.contact_id || null,
          is_employee: Boolean(knownContact?.is_employee ?? previousTicket?.is_employee),
          phone,
          jid: outboundJid,
          raw_jid: rawJid || targetJid,
          time,
          preview: `WhatsApp: ${previewText.slice(0, 70)}`,
          status: 'aguardando',
          assumed: false,
          assumed_at: null,
          first_response_at: null,
          agent_name: null,
          channel,
          unread_count: 0,
          handled_via: 'whatsapp_device',
          direct_whatsapp_messages: 1
        };
        if (targetDepartment?.name) ticketPayload.department = targetDepartment.name;
        if (targetDepartment?.id) ticketPayload.department_id = targetDepartment.id;
        let insertResult = await supabase.from('tickets').insert(ticketPayload).select().single();
        if (insertResult.error && isMissingTicketTimingColumns(insertResult.error)) {
          delete ticketPayload.first_response_at;
          insertResult = await supabase.from('tickets').insert(ticketPayload).select().single();
        }
        if (insertResult.error && isMissingConversationTrackingColumns(insertResult.error)) {
          conversationTrackingColumnsAvailable = false;
          delete ticketPayload.handled_via;
          delete ticketPayload.direct_whatsapp_messages;
          insertResult = await supabase.from('tickets').insert(ticketPayload).select().single();
        } else if (!insertResult.error) {
          conversationTrackingColumnsAvailable = true;
        }
        ticket = assertSupabase(insertResult, 'Falha ao criar atendimento iniciado pelo WhatsApp');
        createdTicket = true;
      } else {
        if (!knownContact && phone) {
          try {
            knownContact = await ensureWhatsAppContact(phone, ticket.client_name || `Cliente ${phone.slice(-4)}`);
          } catch (contactError) {
            console.warn(`Falha ao cadastrar automaticamente contato do WhatsApp: ${contactError.message}`);
          }
        }
        const inferredCurrent = ticket.handled_via || (ticket.agent_name && !String(ticket.agent_name).startsWith('WhatsApp (') ? 'platform' : 'pending');
        const remainsAssigned = ticket.status === 'em_atendimento' && Boolean(ticket.user_id);
        const updatePayload = {
          status: remainsAssigned ? 'em_atendimento' : 'aguardando',
          assumed: remainsAssigned,
          assumed_at: remainsAssigned ? (ticket.assumed_at || now.toISOString()) : null,
          first_response_at: remainsAssigned ? (ticket.first_response_at || createdAt) : null,
          agent_name: remainsAssigned ? ticket.agent_name : null,
          user_id: remainsAssigned ? ticket.user_id : null,
          time,
          preview: `WhatsApp: ${previewText.slice(0, 70)}`,
          updated_at: now.toISOString(),
          handled_via: mergeHandledVia(inferredCurrent, 'whatsapp_device'),
          direct_whatsapp_messages: (ticket.direct_whatsapp_messages || 0) + 1
        };
        // Se esta conta possui destino individual, uma conversa feita pelo
        // celular deve aparecer nesse setor, independentemente do histórico do
        // mesmo contato em outro número do WhatsApp.
        if (whatsappDepartmentId || whatsappFallbackDepartmentId) {
          const departments = await getCachedDepartments();
          const accountDepartment = departments.find(department =>
            String(department.id) === String(whatsappDepartmentId || whatsappFallbackDepartmentId) ||
            normalizeBotInput(department.name) === normalizeBotInput(whatsappDepartmentName || whatsappFallbackDepartmentName)
          );
          if (accountDepartment) {
            updatePayload.department = accountDepartment.name;
            updatePayload.department_id = accountDepartment.id;
          }
        }
        if (knownContact) {
          updatePayload.contact_id = knownContact.id;
          updatePayload.is_employee = Boolean(knownContact.is_employee);
        }
        let updateResult = await supabase.from('tickets').update(updatePayload).eq('id', ticket.id);
        if (updateResult.error && isMissingTicketTimingColumns(updateResult.error)) {
          delete updatePayload.first_response_at;
          updateResult = await supabase.from('tickets').update(updatePayload).eq('id', ticket.id);
        }
        if (updateResult.error && isMissingConversationTrackingColumns(updateResult.error)) {
          conversationTrackingColumnsAvailable = false;
          delete updatePayload.handled_via;
          delete updatePayload.direct_whatsapp_messages;
          updateResult = await supabase.from('tickets').update(updatePayload).eq('id', ticket.id);
        } else if (!updateResult.error) {
          conversationTrackingColumnsAvailable = true;
        }
        assertSupabase(updateResult, 'Falha ao atualizar atendimento respondido pelo WhatsApp');
        Object.assign(ticket, updatePayload);
      }

      // O @lid identifica o dispositivo/conversa, mas não deve ser usado como
      // destinatário. Mantemos o valor bruto para correlação e persistimos o
      // JID telefônico para que as mensagens possam ser descriptografadas.
      if (ticket && phone && phone.length <= 15
        && (ticket.phone !== phone || ticket.jid !== outboundJid || ticket.raw_jid !== (rawJid || targetJid))) {
        const identity = { phone, jid: outboundJid, raw_jid: rawJid || targetJid };
        const identityResult = await supabase.from('tickets').update(identity).eq('id', ticket.id);
        if (!identityResult.error) Object.assign(ticket, identity);
      }

      const formattedText = `*${senderLabel}:*${text ? `\n\n${text}` : ''}`;
      const messagePayload = {
        ticket_id: ticket.id,
        sender: 'agent',
        sender_type: 'whatsapp_device',
        sender_name: senderLabel,
        message_context: 'service',
        type: mediaType || null,
        text: formattedText,
        time,
        media_url: mediaUrl || null,
        file_name: fileName || null,
        remote_message_id: messageId || null,
        whatsapp_account_id: whatsappAccountId || null,
        created_at: createdAt
      };
      let messageResult = await supabase.from('messages').insert(messagePayload).select().single();
      if (messageResult.error?.code === '23505') return { type: 'duplicate', messageId, ticket };
      if (messageResult.error && isMissingConversationTrackingColumns(messageResult.error)) {
        conversationTrackingColumnsAvailable = false;
        delete messagePayload.sender_type;
        delete messagePayload.sender_name;
        delete messagePayload.message_context;
        messageResult = await supabase.from('messages').insert(messagePayload).select().single();
      } else if (!messageResult.error) {
        conversationTrackingColumnsAvailable = true;
      }
      const savedMessage = assertSupabase(messageResult, 'Falha ao salvar resposta feita pelo WhatsApp');
      if (mediaUrl) {
        rememberMediaTicket(mediaUrl, ticket.id);
        const mediaSize = msgData.fileSize || this.getMediaSize(mediaUrl, fileName);
        if (savedMessage) {
          savedMessage.media_size = mediaSize || null;
          savedMessage.file_size = mediaSize || null;
        }
      }

      const fullTicket = await this.getFullTicket(ticket.id);
      const emittedTicket = fullTicket || ticket;
      if (io) {
        emitTicketEvent(io, createdTicket ? 'ticket_created' : 'ticket_updated', { ticket: emittedTicket }, emittedTicket);
        emitTicketEvent(io, 'new_message', { ticketId: ticket.id, message: savedMessage, ticket: emittedTicket }, emittedTicket);
        io.emit('tickets_updated');
        scheduleKpiUpdate(io);

        if (!emittedTicket.user_id && emittedTicket.status !== 'finalizado') {
          emitUnclaimedWhatsAppActivity(io, emittedTicket, text || previewText);
        }
      }
      if (matchesExternalClosureMessage(text)) {
        await this.finalizeExternalTicket(emittedTicket, {
          io,
          whatsappService,
          reason: 'Encerrado pelo atendente no WhatsApp'
        });
        return { type: 'external_whatsapp_closed', ticket: emittedTicket, message: savedMessage };
      }
      return { type: 'external_whatsapp_message', ticket: emittedTicket, message: savedMessage };
    } catch (error) {
      console.error('Falha ao registrar resposta enviada diretamente pelo WhatsApp:', error.message);
      return null;
    }
  }

  async releaseScheduledTickets(io, whatsappService) {
    if (!isSupabaseConfigured()) return 0;
    const now = new Date();
    const { data: heldTickets, error } = await supabase
      .from('tickets')
      .select('*, departments(id, name, business_hours, after_hours_message)')
      .eq('status', 'fora_horario')
      .lte('scheduled_queue_at', now.toISOString())
      .limit(100);
    if (error) {
      if (!/scheduled_queue_at|business_hours|schema cache|does not exist/i.test(error.message || '')) console.warn(`Falha ao verificar atendimentos reservados: ${error.message}`);
      return 0;
    }
    const config = await getBotConfig();
    let released = 0;
    for (const ticket of heldTickets || []) {
      try {
        const department = ticket.departments || { id: ticket.department_id, name: ticket.department };
        const availability = getDepartmentAvailability(department, now);
        if (!availability.isOpen) {
          await supabase.from('tickets').update({ scheduled_queue_at: availability.nextOpenAt?.toISOString() || null }).eq('id', ticket.id).eq('status', 'fora_horario');
          continue;
        }
        const queueAt = now.toISOString();
        const releasePayload = { status: 'aguardando', assumed: false, user_id: null, agent_name: null, assumed_at: null, queued_at: queueAt, scheduled_queue_at: null, updated_at: queueAt };
        const result = await supabase.from('tickets').update(releasePayload).eq('id', ticket.id).eq('status', 'fora_horario').select().maybeSingle();
        if (result.error || !result.data) continue;
        await supabase.from('messages').insert({ ticket_id: ticket.id, sender: 'system', type: 'divider', text: `✅ Horário de atendimento iniciado • Encaminhado para ${department.name || ticket.department}`, time: makeTimeStr(now) });
        if (config.send_queue_confirmation && whatsappService) {
          const targetJid = preferredWhatsAppJid(ticket.phone, ticket.jid || ticket.raw_jid);
          const accountId = ticket.channel?.startsWith('whatsapp:') ? ticket.channel.slice('whatsapp:'.length) : null;
          const confirmation = renderBotMessage(config.queue_confirmation_message, { nome: ticket.client_name || 'Cliente', departamento: department.name || ticket.department }).trim();
          if (targetJid && confirmation) {
            const sent = await whatsappService.sendMessage(targetJid, confirmation, accountId);
            if (sent) await supabase.from('messages').insert({
              ticket_id: ticket.id,
              sender: 'bot',
              text: `*Bot:*\n\n${confirmation}`,
              time: makeTimeStr(now),
              remote_message_id: sent?.key?.id || null,
              whatsapp_account_id: accountId || null
            });
          }
        }
        const fullTicket = await this.getFullTicket(ticket.id);
        if (io && fullTicket) {
          emitTicketEvent(io, 'ticket_created', { ticket: fullTicket }, fullTicket);
          scheduleKpiUpdate(io);
        }
        released += 1;
      } catch (releaseError) {
        console.warn(`Falha ao liberar atendimento reservado ${ticket.id}: ${releaseError.message}`);
      }
    }
    return released;
  }

  async finalizeExternalTicket(ticket, { io, whatsappService = null, botConfig = null, sendRating = true, reason = 'Inatividade no WhatsApp' } = {}) {
    if (!ticket?.id) return false;
    const now = new Date();
    const time = makeTimeStr(now);
    const config = botConfig || await getBotConfig();
    const shouldSendRating = Boolean(sendRating && !ticket.is_employee && config.send_rating_request);
    const closePayload = {
      status: 'finalizado',
      assumed: false,
      encerrado_em: time,
      encerrado_por: reason,
      closed_at: now.toISOString(),
      awaiting_rating: shouldSendRating,
      unread_count: 0,
      updated_at: now.toISOString()
    };
    const closeResult = await supabase.from('tickets').update(closePayload).eq('id', ticket.id);
    if (closeResult.error) throw closeResult.error;
    Object.assign(ticket, closePayload);

    await supabase.from('messages').insert({
      ticket_id: ticket.id,
      sender: 'system',
      type: 'divider',
      text: `✅ Atendimento pelo WhatsApp encerrado • ${reason}`,
      time
    });

    if (shouldSendRating && whatsappService) {
      const targetJid = preferredWhatsAppJid(ticket.phone, ticket.jid || ticket.raw_jid);
      const accountId = ticket.channel?.startsWith('whatsapp:') ? ticket.channel.slice('whatsapp:'.length) : null;
      const ratingText = renderBotMessage(config.rating_request_message, {
        nome: ticket.client_name || 'Cliente',
        departamento: ticket.department || 'Atendimento'
      }).trim();
      if (targetJid && ratingText) {
        const sent = await whatsappService.sendMessage(targetJid, ratingText, accountId);
        if (sent) {
          const ratingPayload = {
            ticket_id: ticket.id,
            sender: 'bot',
            text: `*Bot:*\n\n${ratingText}`,
            time,
            remote_message_id: sent?.key?.id || null,
            whatsapp_account_id: accountId || null
          };
          if (conversationTrackingColumnsAvailable === true) Object.assign(ratingPayload, {
            sender_type: 'bot', sender_name: 'Bot', message_context: 'bot'
          });
          await supabase.from('messages').insert(ratingPayload);
        }
      }
    }

    if (io) {
      emitTicketEvent(io, 'ticket_closed', {
        ticketId: ticket.id,
        status: 'finalizado',
        closed_at: closePayload.closed_at,
        encerrado_por: reason
      }, ticket);
      emitTicketEvent(io, 'queue_updated', { ticket }, ticket);
      scheduleKpiUpdate(io);
    }
    return true;
  }

  async closeInactiveExternalTickets(io, whatsappService) {
    if (!isSupabaseConfigured()) return 0;
    await ensureConversationTrackingColumns();
    if (conversationTrackingColumnsAvailable !== true) return 0;
    const config = await getBotConfig();
    if (!config.auto_close_external_service) return 0;
    const cutoff = new Date(Date.now() - config.external_service_idle_minutes * 60 * 1000).toISOString();
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('status', 'em_atendimento')
      .in('handled_via', ['whatsapp_device', 'mixed'])
      .lt('updated_at', cutoff)
      .limit(100);
    if (error) {
      if (!isMissingConversationTrackingColumns(error)) console.warn(`Falha ao verificar atendimentos externos inativos: ${error.message}`);
      return 0;
    }
    let closed = 0;
    for (const ticket of tickets || []) {
      try {
        if (await this.finalizeExternalTicket(ticket, {
          io,
          whatsappService,
          botConfig: config,
          sendRating: config.send_rating_on_external_inactivity
        })) closed += 1;
      } catch (closeError) {
        console.warn(`Falha ao encerrar atendimento externo ${ticket.id}: ${closeError.message}`);
      }
    }
    return closed;
  }

  /**
   * Consolida as mensagens do chamado atual com mensagens de chamados anteriores das últimas 24h
   */
  async get24hMessagesForTicket(ticket, user = null) {
    if (!ticket) return [];
    try {
      const historyCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const phone = ticket.phone;
      const jid = ticket.jid || ticket.raw_jid;

      let query = supabase
        .from('tickets')
        .select('id, status, department, agent_name, encerrado_por, encerrado_em, created_at, updated_at')
        .eq('status', 'finalizado')
        .gte('updated_at', historyCutoff)
        .neq('id', ticket.id);

      query = scopeTicketQuery(query, user);

      if (phone) {
        query = query.or(`phone.eq.${phone},jid.eq.${jid || phone}`);
      } else if (jid) {
        query = query.eq('jid', jid);
      }

      query = query.order('created_at', { ascending: true });

      const { data: pastTickets, error } = await query;
      if (error || !pastTickets || pastTickets.length === 0) {
        return fetchAllMessagesForTicketIds([ticket.id]);
      }

      let consolidated = [];
      const relatedTicketIds = [...pastTickets.map(item => item.id), ticket.id];
      const relatedMessages = await fetchAllMessagesForTicketIds(relatedTicketIds);
      const messagesByTicket = new Map();
      for (const message of relatedMessages || []) {
        const group = messagesByTicket.get(message.ticket_id) || [];
        group.push(message);
        messagesByTicket.set(message.ticket_id, group);
      }

      for (const past of pastTickets) {
        const pMsgs = messagesByTicket.get(past.id) || [];
        if (pMsgs && pMsgs.length > 0) {
          const deptName = past.department || 'Atendimento';
          const closedBy = past.encerrado_por || past.agent_name || 'Atendente';
          const closeTime = past.encerrado_em || makeTimeStr(new Date(past.updated_at));

          consolidated.push({
            id: `start_${past.id}`,
            ticket_id: ticket.id,
            sender: 'system',
            type: 'divider',
            created_at: past.created_at || past.updated_at,
            text: `📜 Histórico anterior • *${deptName}* (${closeTime})`
          });

          consolidated.push(...pMsgs);

          consolidated.push({
            id: `end_${past.id}`,
            ticket_id: ticket.id,
            sender: 'system',
            type: 'divider',
            created_at: past.updated_at || past.created_at,
            text: `✅ Atendimento finalizado por *${closedBy}* às *${closeTime}*`
          });
        }
      }

      // Adiciona divisor para o chamado atual
      consolidated.push({
        id: `current_${ticket.id}`,
        ticket_id: ticket.id,
        sender: 'system',
        type: 'divider',
        created_at: ticket.created_at || ticket.updated_at || new Date().toISOString(),
        text: `⚡ Atendimento Atual • *${ticket.department || 'Novo Chamado'}*`
      });

      consolidated.push(...(messagesByTicket.get(ticket.id) || []));

      return consolidated;
    } catch (e) {
      console.warn('Erro ao carregar mensagens 24h:', e.message);
      return fetchAllMessagesForTicketIds([ticket.id]);
    }
  }

  async getTickets(user) {
    if (!isSupabaseConfigured()) return [];
    try {
      let tickets = await fetchAllTicketPages(() => {
        let ticketQuery = supabase
          .from('tickets')
          .select('*, departments(id, name, color, allow_device_message_mutations)')
          .in('status', ['aguardando', 'em_atendimento', 'grupo'])
          .order('updated_at', { ascending: false });
        return scopeTicketQuery(ticketQuery, user);
      });

      // Participantes explícitos continuam vendo o atendimento mesmo quando ele
      // pertence a outro departamento.
      if (!isAdmin(user) && user?.id) {
        const { data: links } = await supabase.from('ticket_collaborators').select('ticket_id').eq('user_id', user.id);
        const linkedIds = (links || []).map(item => item.ticket_id).filter(Boolean);
        if (linkedIds.length) {
          const known = new Set((tickets || []).map(item => String(item.id)));
          const { data: linkedTickets } = await supabase.from('tickets').select('*, departments(id, name, color, allow_device_message_mutations)').in('id', linkedIds).in('status', ['aguardando', 'em_atendimento', 'grupo']);
          tickets = [...(tickets || []), ...(linkedTickets || []).filter(item => !known.has(String(item.id)))];
        }
      }

      const ticketIds = (tickets || []).map(t => t.id).filter(Boolean);
      let collaboratorsByTicket = new Map();
      if (ticketIds.length) {
        const colabData = [];
        for (let offset = 0; offset < ticketIds.length; offset += 80) {
          const batch = ticketIds.slice(offset, offset + 80);
          const { data } = await supabase
            .from('ticket_collaborators')
            .select('ticket_id, user_id, created_at, users(id, name, role, department_id, avatar_url, is_active)')
            .in('ticket_id', batch)
            .order('created_at');
          if (data) colabData.push(...data);
        }
        if (colabData.length) {
          for (const row of colabData) {
            if (!collaboratorsByTicket.has(row.ticket_id)) {
              collaboratorsByTicket.set(row.ticket_id, []);
            }
            if (row.users && row.users.id) {
              collaboratorsByTicket.get(row.ticket_id).push({
                ...row.users,
                joined_at: row.created_at
              });
            }
          }
        }
      }

      if (!isAdmin(user) && !isSupervisor(user)) {
        tickets = tickets.filter(t => {
          if (t.is_group || t.status === 'grupo') return true;
          if (t.status === 'aguardando' || t.status === 'chatbot' || !t.user_id) return true;
          const isOwner = (user?.id && t.user_id && String(t.user_id) === String(user.id)) ||
                          (user?.name && t.agent_name === user.name);
          if (isOwner) return true;
          const isColab = (collaboratorsByTicket.get(t.id) || []).some(c => String(c.id) === String(user?.id));
          return isColab;
        });
      }

      const [rules, accounts] = await Promise.all([
        getDisconnectRules(),
        getKnownWhatsAppAccounts()
      ]);
      const retentionMs = rules.queue_retention_minutes * 60 * 1000;
      const discardMs = rules.discard_hours * 3600 * 1000;
      const nowMs = Date.now();

      const expiredDiscardIds = [];
      const expiredGroupDiscardIds = [];

      tickets = tickets.filter(t => {
        const disconnectInfo = getChannelDisconnectInfo(t.channel, accounts);
        if (disconnectInfo && disconnectInfo.disconnected_at) {
          const diffMs = nowMs - new Date(disconnectInfo.disconnected_at).getTime();
          t.whatsapp_disconnected = true;
          t.whatsapp_disconnected_at = disconnectInfo.disconnected_at;

          // Se ultrapassou o prazo de descarte definitivo (ex: 6h)
          if (diffMs > discardMs) {
            if (t.is_group) expiredGroupDiscardIds.push(t.id);
            else expiredDiscardIds.push(t.id);
            return false;
          }

          // Se ultrapassou o tempo de fila (ex: 1h), oculta da fila ativa mas mantém no banco
          if (diffMs > retentionMs) {
            return false;
          }
        } else {
          t.whatsapp_disconnected = false;
        }
        return true;
      });

      if (expiredDiscardIds.length > 0 || expiredGroupDiscardIds.length > 0) {
        this.discardExpiredDisconnectedTickets(expiredDiscardIds, expiredGroupDiscardIds).catch(() => {});
      }

      for (let t of tickets) {
        // A listagem da fila carrega apenas resumos. As mensagens são buscadas
        // sob demanda quando o atendente abre uma conversa.
        t.messages = [];
        t.clientName = t.client_name;
        t.avatarColor = t.avatar_color;
        t.unreadCount = t.unread_count || 0;
        if (t.departments) {
          t.department = t.departments.name;
          t.departmentColor = t.departments.color;
          t.department_id = t.departments.id || t.department_id;
        }
        t.collaborators = collaboratorsByTicket.get(t.id) || [];
      }
      saveTicketsToDisk(tickets);
      return tickets;
    } catch (e) { console.error('Erro ao buscar tickets:', e); return []; }
  }

  /** Retorna ticket completo com mensagens e dados do departamento */
  async getFullTicket(ticketId, user = null) {
    if (!isSupabaseConfigured()) return null;
    try {
      const { data: ticket, error } = await supabase
        .from('tickets')
        .select('*, departments(id, name, color, allow_device_message_mutations)')
        .eq('id', ticketId)
        .single();
      if (error || !ticket) return null;
      if (user && !(await canUserAccessTicketDetails(user, ticket))) return null;
      const fullDisconnectInfo = getChannelDisconnectInfo(ticket.channel);
      ticket.whatsapp_disconnected = !!fullDisconnectInfo;
      ticket.whatsapp_disconnected_at = fullDisconnectInfo?.disconnected_at || null;
      ticket.messages = await this.get24hMessagesForTicket(ticket, user);
      ticket.messages = ticket.messages.map(message => {
        const mediaSize = message.media_size
          || (message.media_url ? this.getMediaSize(message.media_url, message.file_name) : null);
        return {
          ...message,
          media_size: mediaSize || message.media_size || null,
          file_size: mediaSize || message.file_size || null,
          time: message.created_at ? makeTimeStr(new Date(message.created_at)) || message.time : message.time
        };
      });
      ticket.clientName = ticket.client_name;
      ticket.avatarColor = ticket.avatar_color;
      ticket.unreadCount = ticket.unread_count || 0;
      if (ticket.departments) {
        ticket.department = ticket.departments.name;
        ticket.departmentColor = ticket.departments.color;
        ticket.department_id = ticket.departments.id || ticket.department_id;
      }
      if (ticket.contact_id) {
        const { data: contact, error: contactError } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', ticket.contact_id)
          .maybeSingle();
        if (!contactError && contact) {
          ticket.contact = contact;
          if (!ticket.avatar_url && contact.avatar_url) ticket.avatar_url = contact.avatar_url;
        }
      }
      ticket.collaborators = await this.getCollaborators(ticket.id, user, { skipAccessCheck: true });
      return ticket;
    } catch (e) {
      console.error('Erro em getFullTicket:', e);
      return null;
    }
  }

  async resolveWhatsAppGroupDepartment(account = {}) {
    const departments = await getCachedDepartments();
    const botConfig = await getBotConfig();
    return departments.find(department => String(department.id) === String(account.departmentId || '')
      || normalizeBotInput(department.name) === normalizeBotInput(account.departmentName))
      || departments.find(department => String(department.id) === String(account.fallbackDepartmentId || '')
        || normalizeBotInput(department.name) === normalizeBotInput(account.fallbackDepartmentName))
      || departments.find(department => String(department.id) === String(botConfig.default_department_id || ''))
      || departments[0]
      || null;
  }

  async ensureWhatsAppGroupTicket(account, group, io = null, options = {}) {
    if (!isSupabaseConfigured() || !account?.id || !group?.jid) return null;
    const channel = `whatsapp:${account.id}`;
    const department = options?.department || await this.resolveWhatsAppGroupDepartment(account);
    const name = Array.from(String(group.subject || 'Grupo do WhatsApp').trim()).slice(0, 100).join('') || 'Grupo do WhatsApp';
    const now = new Date().toISOString();

    let existing = null;
    if (options?.existingRecord !== undefined) {
      existing = options.existingRecord;
    } else {
      const { data: found, error: findError } = await supabase.from('tickets')
        .select('*')
        .eq('channel', channel)
        .eq('group_jid', group.jid)
        .maybeSingle();
      if (findError) throw findError;
      existing = found;
    }

    const payload = {
      client_name: name,
      initials: makeInitials(name, 'GR'),
      jid: group.jid,
      raw_jid: group.jid,
      group_jid: group.jid,
      group_participant_count: Math.max(0, Number(group.participantCount) || 0),
      avatar_url: group.avatarUrl || existing?.avatar_url || null,
      status: 'grupo',
      assumed: true,
      is_group: true,
      is_employee: false,
      channel,
      handled_via: 'mixed',
      department: department?.name || null,
      department_id: department?.id || null,
      updated_at: existing ? existing.updated_at : now
    };

    let ticket;
    let created = false;
    if (existing) {
      const result = await supabase.from('tickets').update(payload).eq('id', existing.id).select().single();
      ticket = assertSupabase(result, 'Falha ao atualizar grupo do WhatsApp');
    } else {
      const result = await supabase.from('tickets').insert({
        id: crypto.randomUUID(),
        ...payload,
        preview: 'Grupo disponível para a equipe',
        unread_count: 0,
        time: makeTimeStr(new Date()),
        created_at: now,
        updated_at: now
      }).select().single();
      ticket = assertSupabase(result, 'Falha ao cadastrar grupo do WhatsApp');
      created = true;
    }

    if (options?.light) {
      if (io && ticket && !options?.suppressEvent) emitTicketEvent(io, created ? 'ticket_created' : 'ticket_updated', { ticket }, ticket);
      return ticket;
    }

    const fullTicket = await this.getFullTicket(ticket.id);
    if (io && fullTicket && !options?.suppressEvent) emitTicketEvent(io, created ? 'ticket_created' : 'ticket_updated', { ticket: fullTicket }, fullTicket);
    return fullTicket || ticket;
  }

  async syncWhatsAppGroups(account, groups = [], io = null) {
    if (!isSupabaseConfigured() || !account?.id) return [];
    const currentJids = groups.map(group => group?.jid).filter(Boolean);
    const currentSet = new Set(currentJids);

    const department = await this.resolveWhatsAppGroupDepartment(account);

    // Pré-busca todos os grupos existentes deste canal em consulta única
    const { data: existingRecords } = await supabase.from('tickets')
      .select('id, group_jid, client_name, avatar_url, updated_at, status')
      .eq('channel', `whatsapp:${account.id}`)
      .eq('is_group', true);
    const existingMap = new Map((existingRecords || []).map(r => [r.group_jid, r]));

    const synced = [];
    for (const group of groups) {
      try {
        const existingRecord = existingMap.get(group.jid);
        const ticket = await this.ensureWhatsAppGroupTicket(account, group, io, {
          light: true,
          department,
          existingRecord,
          suppressEvent: true
        });
        if (ticket) synced.push(ticket);
      } catch (error) {
        console.warn(`Falha ao sincronizar grupo ${group?.subject || group?.jid}: ${error.message}`);
      }
    }

    const inactiveIds = (existingRecords || []).filter(item => !currentSet.has(item.group_jid)).map(item => item.id);
    if (inactiveIds.length) {
      await supabase.from('tickets').update({ status: 'grupo_inativo', updated_at: new Date().toISOString() }).in('id', inactiveIds);
    }

    // Emite evento em lote para o frontend atualizar a fila imediatamente
    if (io) {
      io.emit('tickets_updated');
      scheduleKpiUpdate(io);
    }

    return synced;
  }

  async processWhatsAppGroupMessage(data, io = null) {
    if (!isSupabaseConfigured() || !data?.groupJid || !data?.whatsappAccountId) return null;
    try {
      if (await wasRemoteMessageProcessed(data.whatsappAccountId, data.messageId)) return { type: 'duplicate', messageId: data.messageId };
      const ticket = await this.ensureWhatsAppGroupTicket({
        id: data.whatsappAccountId,
        departmentId: data.whatsappDepartmentId,
        departmentName: data.whatsappDepartmentName,
        fallbackDepartmentId: data.whatsappFallbackDepartmentId,
        fallbackDepartmentName: data.whatsappFallbackDepartmentName
      }, { jid: data.groupJid, subject: data.groupName, avatarUrl: data.avatarUrl, participantCount: data.participantCount }, io);
      if (!ticket) return null;

      const dateMs = whatsappTimestampMs(data.timestamp);
      const createdAt = dateMs ? new Date(dateMs).toISOString() : new Date().toISOString();
      const date = new Date(createdAt);
      const memberName = String(data.senderName || data.participantJid || (data.fromMe ? 'WhatsApp' : 'Participante')).replace(/@.*$/, '').slice(0, 255);
      const preview = data.text || ({ audio: '🎙️ Áudio', image: '📷 Imagem', video: '🎥 Vídeo', document: `📄 ${data.fileName || 'Documento'}` }[data.mediaType] || 'Nova mensagem');
      const senderLabel = data.fromMe ? `WhatsApp (${data.whatsappAccountName || 'celular'})` : memberName;
      const messagePayload = {
        ticket_id: ticket.id,
        sender: data.fromMe ? 'agent' : 'client',
        sender_type: data.fromMe ? 'whatsapp_device' : 'group_member',
        sender_name: senderLabel,
        message_context: 'group',
        participant_jid: data.participantJid || null,
        type: data.mediaType || null,
        text: data.fromMe ? `*${senderLabel}:*${data.text ? `\n\n${data.text}` : ''}` : (data.text || preview),
        time: makeTimeStr(date),
        media_url: data.mediaUrl || null,
        file_name: data.fileName || null,
        remote_message_id: data.messageId || null,
        whatsapp_account_id: data.whatsappAccountId,
        created_at: createdAt
      };
      const messageResult = await supabase.from('messages').insert(messagePayload).select().single();
      if (messageResult.error?.code === '23505') return { type: 'duplicate', messageId: data.messageId };
      const message = assertSupabase(messageResult, 'Falha ao salvar mensagem do grupo');
      if (data.mediaUrl) {
        rememberMediaTicket(data.mediaUrl, ticket.id);
        const mediaSize = data.fileSize || this.getMediaSize(data.mediaUrl, data.fileName);
        if (message) {
          message.media_size = mediaSize || null;
          message.file_size = mediaSize || null;
        }
      }

      const updatePayload = {
        preview: `${data.fromMe ? 'Você' : memberName}: ${preview}`.slice(0, 100),
        time: makeTimeStr(date),
        updated_at: createdAt,
        unread_count: data.fromMe ? (ticket.unread_count || 0) : (ticket.unread_count || 0) + 1
      };
      assertSupabase(await supabase.from('tickets').update(updatePayload).eq('id', ticket.id), 'Falha ao atualizar grupo');
      Object.assign(ticket, updatePayload);
      if (io) {
        emitTicketEvent(io, 'new_message', { ticketId: ticket.id, message, ticket }, ticket);
        emitTicketEvent(io, 'ticket_updated', { ticket }, ticket);
      }
      return { type: 'group_message', ticket, message };
    } catch (error) {
      console.error(`Falha ao processar mensagem de grupo: ${error.message}`);
      return null;
    }
  }

  async getWhatsAppAvatarTargets(accountId) {
    if (!isSupabaseConfigured() || !accountId) return [];
    const { data, error } = await supabase.from('tickets')
      .select('id, phone, jid, raw_jid, group_jid, is_group')
      .in('channel', accountId === 'default' ? ['whatsapp', 'whatsapp:default'] : [`whatsapp:${accountId}`])
      .in('status', ['aguardando', 'em_atendimento', 'grupo']);
    return error ? [] : (data || []);
  }

  async updateTicketAvatar(ticketId, avatarUrl, io = null) {
    if (!isSupabaseConfigured() || !ticketId || !avatarUrl) return false;
    const currentResult = await supabase.from('tickets')
      .select('id, contact_id, client_name, phone, is_group')
      .eq('id', ticketId)
      .maybeSingle();
    if (currentResult.error || !currentResult.data) return false;
    const current = currentResult.data;

    let contactId = current.contact_id || null;
    if (!current.is_group && current.phone) {
      try {
        const contact = await ensureWhatsAppContact(current.phone, current.client_name);
        contactId = contact?.id || contactId;
        if (contactId) {
          await supabase.from('contacts').update({ avatar_url: avatarUrl }).eq('id', contactId);
          await supabase.from('tickets').update({ avatar_url: avatarUrl, contact_id: contactId }).eq('contact_id', contactId);
          await supabase.from('tickets').update({ avatar_url: avatarUrl, contact_id: contactId }).eq('phone', current.phone);
        } else {
          await supabase.from('contacts').update({ avatar_url: avatarUrl }).eq('phone', current.phone);
          await supabase.from('tickets').update({ avatar_url: avatarUrl }).eq('phone', current.phone);
        }
      } catch (error) {
        console.warn(`Não foi possível salvar a foto no contato ${current.phone}: ${error.message}`);
      }
    }

    const update = { avatar_url: avatarUrl, ...(contactId ? { contact_id: contactId } : {}) };
    const { data: ticket, error } = await supabase.from('tickets').update(update).eq('id', ticketId).select().single();
    if (error || !ticket) return false;
    if (io) emitTicketEvent(io, 'ticket_updated', { ticket }, ticket);
    return true;
  }

  async processWhatsAppCall(callData, io) {
    if (!io || !callData) return { success: false, error: 'Evento de chamada inválido.' };
    const phone = String(callData.phone || '').replace(/\D/g, '');
    const rawJid = String(callData.from || '').trim();
    let ticket = null;

    if (isSupabaseConfigured()) {
      const baseQuery = () => supabase.from('tickets')
        .select('id, client_name, phone, department, department_id, status')
        .in('status', ['chatbot', 'aguardando', 'em_atendimento'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (phone) {
        const result = await baseQuery().eq('phone', phone);
        if (result.error) throw result.error;
        ticket = result.data?.[0] || null;
      }
      if (!ticket && rawJid) {
        const byJid = await baseQuery().or(`jid.eq.${rawJid},raw_jid.eq.${rawJid}`);
        if (!byJid.error) ticket = byJid.data?.[0] || null;
      }
    }

    const payload = {
      ticketId: ticket?.id || null,
      callId: callData.callId,
      status: callData.status || 'ringing',
      isVideo: Boolean(callData.isVideo),
      phone,
      clientName: ticket?.client_name || (phone ? `Cliente ${phone.slice(-4)}` : 'Contato do WhatsApp'),
      department: ticket?.department || null,
      timestamp: new Date().toISOString(),
      whatsappAccountId: callData.whatsappAccountId || null,
      whatsappAccountName: callData.whatsappAccountName || null
    };

    if (ticket) {
      emitTicketEvent(io, 'incoming_whatsapp_call', payload, ticket);
    } else {
      let target = io.to('admins');
      if (callData.whatsappDepartmentId) target = target.to(`department:${callData.whatsappDepartmentId}`);
      target.emit('incoming_whatsapp_call', payload);
    }
    return { success: true, ticketId: payload.ticketId };
  }

  async getCollaborators(ticketId, user, options = {}) {
    if (!isSupabaseConfigured()) return [];
    const { data: ticket } = await supabase.from('tickets').select('id, department_id, department, status, user_id, agent_name, encerrado_por').eq('id', ticketId).maybeSingle();
    if (!ticket || (!options.skipAccessCheck && !(await canUserAccessTicketDetails(user, ticket)))) return null;
    const { data, error } = await supabase.from('ticket_collaborators').select('user_id, created_at, users(id, name, role, department_id, avatar_url, is_active)').eq('ticket_id', ticketId).order('created_at');
    if (error) return [];
    return (data || []).map(row => ({ ...(row.users || {}), joined_at: row.created_at })).filter(item => item.id);
  }

  async getCollaborationOptions(ticketId, user) {
    const { data: ticket } = await supabase.from('tickets').select('id, department_id, department, status, user_id, agent_name, encerrado_por').eq('id', ticketId).maybeSingle();
    if (!ticket || !(await canUserAccessTicketDetails(user, ticket))) return { success: false, error: 'Atendimento não encontrado.' };
    let query = supabase.from('users').select('id, name, role, department_id, avatar_url').eq('is_active', true).order('name');
    if (!isAdmin(user) && ticket.department_id) query = query.eq('department_id', ticket.department_id);
    const [{ data: users, error }, collaborators] = await Promise.all([query, this.getCollaborators(ticketId, user, { skipAccessCheck: true })]);
    if (error) return { success: false, error: 'Não foi possível listar os usuários.' };
    return { success: true, collaborators, users: (users || []).filter(item => item.id !== user.id) };
  }

  async addCollaborator(ticketId, userId, currentUser, io) {
    const options = await this.getCollaborationOptions(ticketId, currentUser);
    if (!options.success) return options;
    const target = options.users.find(item => String(item.id) === String(userId));
    if (!target) return { success: false, error: 'Usuário indisponível para este atendimento.' };
    const { error } = await supabase.from('ticket_collaborators').upsert({ ticket_id: ticketId, user_id: userId, added_by: uuidOrNull(currentUser.id) }, { onConflict: 'ticket_id,user_id' });
    if (error) return { success: false, error: /ticket_collaborators|schema cache/i.test(error.message || '') ? 'Execute a migration de co-atendimento no Supabase.' : error.message };
    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
    if (ticket) emitTicketEvent(io, 'ticket_updated', { ticket: await this.getFullTicket(ticketId) }, ticket);
    return { success: true, collaborators: await this.getCollaborators(ticketId, currentUser, { skipAccessCheck: true }) };
  }

  async removeCollaborator(ticketId, userId, currentUser, io) {
    const options = await this.getCollaborationOptions(ticketId, currentUser);
    if (!options.success) return options;
    const { error } = await supabase.from('ticket_collaborators').delete().eq('ticket_id', ticketId).eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
    if (ticket) emitTicketEvent(io, 'ticket_updated', { ticket: await this.getFullTicket(ticketId) }, ticket);
    return { success: true };
  }

  /** Retorna histórico de tickets finalizados com avaliações e mensagens */
  async getHistory(user) {
    if (!isSupabaseConfigured()) return [];
    try {
      const select = '*, departments(id, name, color)';
      const baseQuery = () => supabase.from('tickets').select(select).eq('status', 'finalizado');
      let tickets = [];
      let participatedTicketIds = new Set();

      if (isAdmin(user) || isSupervisor(user)) {
        let historyQuery = baseQuery();
        if (isSupervisor(user)) {
          const ids = departmentIds(user);
          historyQuery = ids.length ? historyQuery.in('department_id', ids) : historyQuery.is('id', null);
        }
        const result = await historyQuery.order('updated_at', { ascending: false }).limit(200);
        if (result.error) throw result.error;
        tickets = result.data || [];
      } else {
        // Registra também participação anterior em conversas transferidas. O
        // responsável final pode ser outro analista, mas quem enviou uma
        // mensagem pelo sistema continua autorizado a consultar o histórico.
        const participationQueries = [];
        const validUserId = uuidOrNull(user?.id);
        if (validUserId && messageUserIdColumnAvailable !== false) {
          participationQueries.push(supabase.from('messages').select('ticket_id').eq('user_id', validUserId).order('created_at', { ascending: false }).limit(500));
        }
        if (user?.name) {
          participationQueries.push(supabase.from('messages').select('ticket_id').eq('sender_name', user.name).order('created_at', { ascending: false }).limit(500));
        }
        const participationResults = await Promise.all(participationQueries);
        participatedTicketIds = new Set(participationResults.flatMap(result => result.error ? [] : (result.data || []).map(item => String(item.ticket_id))));

        const ticketQueries = [];
        if (validUserId) ticketQueries.push(baseQuery().eq('user_id', validUserId).order('updated_at', { ascending: false }).limit(200));
        if (user?.name) {
          ticketQueries.push(baseQuery().eq('agent_name', user.name).order('updated_at', { ascending: false }).limit(200));
          ticketQueries.push(baseQuery().eq('encerrado_por', user.name).order('updated_at', { ascending: false }).limit(200));
        }
        const participantIds = [...participatedTicketIds];
        for (let index = 0; index < participantIds.length; index += 100) {
          ticketQueries.push(baseQuery().in('id', participantIds.slice(index, index + 100)).order('updated_at', { ascending: false }).limit(200));
        }

        const ticketResults = await Promise.all(ticketQueries);
        const ticketMap = new Map();
        for (const result of ticketResults) {
          if (result.error) throw result.error;
          for (const ticket of result.data || []) ticketMap.set(ticket.id, ticket);
        }
        tickets = [...ticketMap.values()]
          .filter(ticket => historyTicketVisibleToUser(user, ticket, participatedTicketIds))
          .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
          .slice(0, 200);
      }

      // Busca avaliações e mensagens para cada ticket
      const ticketIds = tickets.map(t => t.id);
      let ratingMap = {};
      let messagesMap = {};

      if (ticketIds.length > 0) {
        const [avaliacoes, msgs] = await Promise.all([
          fetchRatingsForTicketIds(ticketIds),
          fetchAllMessagesForTicketIds(ticketIds)
        ]);

        (avaliacoes || []).forEach(a => { ratingMap[a.ticket_id] = a.score; });
        
        (msgs || []).forEach(m => {
          if (!messagesMap[m.ticket_id]) messagesMap[m.ticket_id] = [];
          messagesMap[m.ticket_id].push(m);
        });
      }

      return tickets.map(t => {
        let deptName = t.departments?.name || t.department || '';
        let deptColor = t.departments?.color || '#2563eb';

        // Fallback inteligente: se department estiver vazio ou padrão, recupera da mensagem de escolha do Chatbot
        if (!deptName || deptName === 'Comercial' || deptName === 'Geral') {
          const choiceMsg = (messagesMap[t.id] || []).find(m => m.text?.includes('[Chatbot] Cliente escolheu:'));
          if (choiceMsg) {
            const match = choiceMsg.text.match(/\[Chatbot\] Cliente escolheu:\s*(.+)/i);
            if (match) {
              deptName = match[1].trim();
            }
          }
        }
        let finalScore = t.rating || ratingMap[t.id] || null;
        if (!finalScore) {
          const rMsg = (messagesMap[t.id] || []).find(m => 
            m.text?.includes('⭐') || 
            m.text?.includes('estrelas') || 
            m.text?.includes('estrela')
          );
          if (rMsg) {
            const match = rMsg.text.match(/(\d+)\s*(?:de 5\s*)?estrela/i);
            if (match) {
              finalScore = parseInt(match[1], 10);
            }
          }
        }

        return {
          ...t,
          clientName: t.client_name,
          avatarColor: t.avatar_color,
          rating: finalScore,
          messages: messagesMap[t.id] || [],
          protocolo: t.id,
          agent: t.agent_name || t.encerrado_por || '--',
          deptInitial: deptName,
          deptFinal: deptName,
          department: deptName,
          departmentColor: deptColor
        };
      });
    } catch (e) {
      console.error('❌ Erro ao buscar histórico:', e);
      return [];
    }
  }

  /**
   * Retorna histórico de atendimentos finalizados de um cliente específico
   * com suporte a busca textual em mensagens/resumos e filtros de data e atendente.
   */
  async getClientTicketHistory(user, ticketId, filters = {}) {
    if (!isSupabaseConfigured()) return [];
    try {
      const currentTicket = await this.getFullTicket(ticketId, user);
      if (!currentTicket) return [];

      const phone = currentTicket.phone;
      const contactId = currentTicket.contact_id;
      const jid = currentTicket.jid;
      const rawJid = currentTicket.raw_jid;

      const lookups = [];
      if (contactId) lookups.push(`contact_id.eq.${contactId}`);
      if (phone) lookups.push(`phone.eq.${phone}`);
      if (jid) lookups.push(`jid.eq.${jid}`);
      if (rawJid && rawJid !== jid) lookups.push(`raw_jid.eq.${rawJid}`);

      if (lookups.length === 0) return [];

      let query = supabase
        .from('tickets')
        .select('id, client_name, phone, preview, agent_name, encerrado_por, user_id, created_at, closed_at, updated_at, department, department_id, channel, status')
        .eq('status', 'finalizado')
        .or(lookups.join(','));

      // O histórico exibido deve ser EXCLUSIVAMENTE do departamento do atendimento em questão
      const targetDeptId = currentTicket.department_id || filters.departmentId;
      const targetDeptName = currentTicket.department;
      if (targetDeptId) {
        query = query.eq('department_id', targetDeptId);
      } else if (targetDeptName) {
        query = query.eq('department', targetDeptName);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59.999Z');
      }
      if (filters.agentName) {
        query = query.or(`agent_name.eq.${filters.agentName},encerrado_por.eq.${filters.agentName}`);
      }

      const { data: tickets, error } = await query.order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      if (!tickets || tickets.length === 0) return [];

      let filteredTickets = tickets;

      // Busca por palavra-chave (ex: "Nota Fiscal") no resumo ou no corpo das mensagens
      if (filters.search && typeof filters.search === 'string' && filters.search.trim()) {
        const term = filters.search.trim().toLowerCase();
        const ticketIds = tickets.map(t => t.id);

        let matchedTicketIds = new Set();
        if (ticketIds.length > 0) {
          const { data: matchedMsgs } = await supabase
            .from('messages')
            .select('ticket_id')
            .in('ticket_id', ticketIds)
            .ilike('text', `%${filters.search.trim()}%`);
          (matchedMsgs || []).forEach(m => matchedTicketIds.add(String(m.ticket_id)));
        }

        filteredTickets = tickets.filter(t => {
          if (matchedTicketIds.has(String(t.id))) return true;
          if (t.preview && t.preview.toLowerCase().includes(term)) return true;
          if (t.client_name && t.client_name.toLowerCase().includes(term)) return true;
          if (t.agent_name && t.agent_name.toLowerCase().includes(term)) return true;
          if (t.encerrado_por && t.encerrado_por.toLowerCase().includes(term)) return true;
          return false;
        });
      }

      // Busca fotos/avatares dos atendentes
      const userIds = [...new Set(filteredTickets.map(t => t.user_id).filter(Boolean))];
      const agentNames = [...new Set(filteredTickets.map(t => t.agent_name || t.encerrado_por).filter(Boolean))];
      const avatarMap = new Map();

      if (userIds.length > 0 || agentNames.length > 0) {
        try {
          const userFilters = [];
          if (userIds.length > 0) userFilters.push(`id.in.(${userIds.join(',')})`);
          if (agentNames.length > 0) {
            const cleanNames = agentNames.map(n => `"${n.replace(/"/g, '')}"`).join(',');
            userFilters.push(`name.in.(${cleanNames})`);
          }
          if (userFilters.length > 0) {
            const { data: userData } = await supabase
              .from('users')
              .select('id, name, avatar_url')
              .or(userFilters.join(','));
            (userData || []).forEach(u => {
              if (u.id) avatarMap.set(String(u.id), u.avatar_url);
              if (u.name) avatarMap.set(u.name.toLowerCase().trim(), u.avatar_url);
            });
          }
        } catch (avatarErr) {
          console.warn('Falha ao carregar avatares dos atendentes para o histórico:', avatarErr.message);
        }
      }

      return filteredTickets.map(t => {
        const rawDate = t.closed_at || t.created_at || t.updated_at;
        const dateObj = new Date(rawDate);
        const formattedDate = !isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : '--';

        let summary = String(t.preview || '')
          .replace(/^WhatsApp:\s*/i, '')
          .replace(/^[🎙️📷🎥📄]\s*/u, '')
          .trim();
        if (!summary) summary = 'Atendimento finalizado';
        if (summary.length > 90) summary = summary.slice(0, 87) + '...';

        const agentName = t.agent_name || t.encerrado_por || 'Atendente';
        const agentAvatar = (t.user_id && avatarMap.get(String(t.user_id))) ||
                            avatarMap.get(agentName.toLowerCase().trim()) || null;

        return {
          id: t.id,
          date: formattedDate,
          raw_date: rawDate,
          agent_name: agentName,
          agent_avatar_url: agentAvatar,
          summary,
          preview: t.preview,
          department: t.department || targetDeptName || 'Geral',
          department_id: t.department_id || targetDeptId || null,
          channel: t.channel
        };
      });
    } catch (err) {
      console.error('❌ Erro em getClientTicketHistory:', err);
      throw err;
    }
  }


  async getKpis(user) {
    if (!isSupabaseConfigured()) return null;
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();
      const scoped = query => scopeTicketQuery(query, user);
      const [
        { count: atendimentosHoje },
        { count: emAtendimento },
        { count: aguardando },
        { data: finalizados },
        { data: avaliacoes },
        { data: assumidosHoje }
      ] = await Promise.all([
        scoped(supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('is_employee', false).eq('is_group', false).gte('created_at', todayISO)),
        scoped(supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('is_employee', false).eq('is_group', false).eq('status', 'em_atendimento')),
        scoped(supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('is_employee', false).eq('is_group', false).eq('status', 'aguardando')),
        scoped(supabase.from('tickets').select('created_at, closed_at, encerrado_por').eq('is_employee', false).eq('is_group', false).eq('status', 'finalizado').gte('created_at', todayISO).not('closed_at', 'is', null)),
        supabase.from('ratings').select('score, tickets!inner(is_employee,is_group)').eq('tickets.is_employee', false).eq('tickets.is_group', false),
        scoped(supabase.from('tickets').select('created_at, assumed_at').eq('is_employee', false).eq('is_group', false).gte('created_at', todayISO).not('assumed_at', 'is', null))
      ]);

      // Busca de live activity separada e protegida contra erro de fk
      let messagesData = [];
      try {
        if (!isAdmin(user)) throw new Error('Atividade global restrita');
        const res = await supabase.from('messages').select('text, time, sender, created_at, ticket_id').order('created_at', { ascending: false }).limit(5);
        if (res.data) messagesData = res.data;
      } catch (e) {}
      
      let tma = '00:00:00';
      const numFinalizados = finalizados ? finalizados.length : 0;
      if (numFinalizados > 0) {
        const totalSecs = finalizados.reduce((acc, t) => { const diff = (new Date(t.closed_at) - new Date(t.created_at)) / 1000; return acc + (diff > 0 ? diff : 0); }, 0);
        const avg = Math.round(totalSecs / numFinalizados);
        const h = Math.floor(avg / 3600);
        const m = Math.floor((avg % 3600) / 60);
        const s = avg % 60;
        tma = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }

      let tme = '00:00:00';
      if (assumidosHoje && assumidosHoje.length > 0) {
        const totalSecsWait = assumidosHoje.reduce((acc, t) => { const diff = (new Date(t.assumed_at) - new Date(t.created_at)) / 1000; return acc + (diff > 0 ? diff : 0); }, 0);
        const avgWait = Math.round(totalSecsWait / assumidosHoje.length);
        const h = Math.floor(avgWait / 3600);
        const m = Math.floor((avgWait % 3600) / 60);
        const s = avgWait % 60;
        tme = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }

      let mediaAvaliacao = '--'; let totalAvaliacoes = 0;
      const visibleRatings = isAdmin(user) ? (avaliacoes || []) : [];
      if (visibleRatings.length > 0) {
        totalAvaliacoes = visibleRatings.length;
        mediaAvaliacao = (visibleRatings.reduce((acc, a) => acc + a.score, 0) / totalAvaliacoes).toFixed(1);
      }
      
      // Ranking
      const rankMap = {};
      (finalizados || []).forEach(t => {
        if (t.encerrado_por) rankMap[t.encerrado_por] = (rankMap[t.encerrado_por] || 0) + 1;
      });
      const rankingAtendentes = Object.keys(rankMap)
        .map(name => ({ name, count: rankMap[name], avatar: 'https://ui-avatars.com/api/?name='+encodeURIComponent(name)+'&background=random', rank: '#', growth: '0%' }))
        .sort((a, b) => b.count - a.count)
        .map((item, idx) => ({ ...item, rank: `#${idx + 1}` }));
        
      // Live Activity
      const liveActivity = messagesData.map(m => ({
        color: m.sender === 'client' ? '#10b981' : '#2563eb',
        icon: m.sender === 'client' ? 'fa-solid fa-arrow-down' : 'fa-solid fa-arrow-up',
        title: m.sender === 'client' ? 'Mensagem de Cliente' : 'Resposta do Atendente',
        sub: (m.text || '').slice(0, 30) + '...',
        time: m.time || 'Agora'
      }));

      return {
        // Dados legados para o footer da página (kpi.js)
        atendimentosHoje: atendimentosHoje || 0,
        emAtendimento: emAtendimento || 0,
        aguardando: aguardando || 0,
        tma,
        tme,
        mediaAvaliacao,
        totalAvaliacoes,

        // Dados estruturados novos para a aba Dashboard
        kpis: {
          total: { val: atendimentosHoje || 0, growth: "0%", vs: "hoje" },
          concluidos: { val: numFinalizados, growth: "0%", vs: "hoje" },
          em_atendimento: { val: emAtendimento || 0, growth: "0%", vs: "agora" },
          aguardando: { val: aguardando || 0, growth: "0%", vs: "agora" },
          sla: { val: "100%", growth: "0%", vs: "hoje" },
          tempo_resposta: { val: tma, growth: "00:00", vs: "hoje" }
        },
        liveActivity,
        slaPorDept: [],
        rankingAtendentes
      };
    } catch (e) { console.error('Erro ao buscar KPIs:', e); return null; }
  }

  async startOutboundConversation(contactId, requestedDepartmentId, currentUser, io, whatsappService) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Banco de dados indisponível.' };
    if (!contactId) return { success: false, error: 'Selecione um contato.' };
    try {
      const departmentId = requestedDepartmentId || currentUser?.department_id;
      if (!departmentId || !canAccessDepartment(currentUser, departmentId)) {
        return { success: false, error: 'Selecione um departamento dentro do seu escopo de acesso.' };
      }
      const [{ data: contact, error: contactError }, { data: department, error: departmentError }] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', contactId).maybeSingle(),
        supabase.from('departments').select('id, name, color').eq('id', departmentId).maybeSingle()
      ]);
      if (contactError) throw contactError;
      if (departmentError) throw departmentError;
      if (!contact || contact.status === 'Inativo') return { success: false, error: 'Contato não encontrado ou inativo.' };
      if (!department) return { success: false, error: 'Departamento não encontrado.' };
      let phone = String(contact.phone || '').replace(/\D/g, '');
      if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
      if (phone.length < 12 || phone.length > 15) return { success: false, error: 'O contato não possui um WhatsApp válido.' };

      const accounts = whatsappService?.getAccounts?.(false) || [];
      const account = selectOutboundWhatsAppAccount(accounts, department);
      if (!account) return { success: false, error: `Nenhum WhatsApp conectado está disponível para ${department.name}.` };

      const { data: activeTickets, error: activeError } = await supabase.from('tickets')
        .select('*')
        .eq('phone', phone)
        .in('status', ['chatbot', 'aguardando', 'em_atendimento'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (activeError) throw activeError;
      let ticket = activeTickets?.[0] || null;
      const now = new Date();
      const time = makeTimeStr(now);
      let shouldRecordStart = true;

      if (ticket) {
        if (!canUserAccessTicket(currentUser, ticket)) {
          return { success: false, error: 'Este contato já possui um atendimento ativo em outro departamento.' };
        }
        if (ticket.status === 'em_atendimento' && ticket.user_id && String(ticket.user_id) !== String(currentUser.id)) {
          return { success: false, error: `Este contato já está sendo atendido por ${ticket.agent_name || 'outro atendente'}.` };
        }
        shouldRecordStart = !(ticket.status === 'em_atendimento' && (
          String(ticket.user_id || '') === String(currentUser.id || '') || ticket.agent_name === currentUser.name
        ));
        const updatePayload = {
          status: 'em_atendimento',
          assumed: true,
          user_id: uuidOrNull(currentUser.id),
          agent_name: currentUser.name || 'Atendente',
          assumed_at: ticket.assumed_at || now.toISOString(),
          contact_id: contact.id,
          is_employee: Boolean(contact.is_employee),
          updated_at: now.toISOString()
        };
        assertSupabase(await supabase.from('tickets').update(updatePayload).eq('id', ticket.id), 'Falha ao abrir atendimento existente');
        Object.assign(ticket, updatePayload);
      } else {
        const channel = `whatsapp:${account.id}`;
        const payload = {
          id: crypto.randomUUID(),
          contact_id: contact.id,
          client_name: contact.name,
          initials: String(contact.name || 'CL').substring(0, 2).toUpperCase(),
          phone,
          jid: `${phone}@s.whatsapp.net`,
          time,
          preview: 'Nova conversa iniciada pelo atendente',
          status: 'em_atendimento',
          assumed: true,
          user_id: uuidOrNull(currentUser.id),
          agent_name: currentUser.name || 'Atendente',
          department_id: department.id,
          department: department.name,
          channel,
          unread_count: 0,
          is_employee: Boolean(contact.is_employee),
          assumed_at: now.toISOString(),
          updated_at: now.toISOString()
        };
        if (conversationTrackingColumnsAvailable !== false) {
          payload.handled_via = 'platform';
          payload.platform_messages = 0;
        }
        let insertResult = await supabase.from('tickets').insert(payload).select().single();
        if (insertResult.error && isMissingConversationTrackingColumns(insertResult.error)) {
          conversationTrackingColumnsAvailable = false;
          delete payload.handled_via;
          delete payload.platform_messages;
          insertResult = await supabase.from('tickets').insert(payload).select().single();
        }
        ticket = assertSupabase(insertResult, 'Falha ao iniciar nova conversa');
      }

      if (shouldRecordStart) {
        const startMessagePayload = {
          ticket_id: ticket.id,
          sender: 'system',
          type: 'divider',
          text: `💬 Conversa iniciada por *${currentUser.name || 'Atendente'}*`,
          time
        };
        if (messageUserIdColumnAvailable !== false && currentUser?.id) {
          startMessagePayload.user_id = uuidOrNull(currentUser.id);
        }
        let startMsgResult = await supabase.from('messages').insert(startMessagePayload);
        if (startMsgResult.error && isMissingMessageUserIdColumn(startMsgResult.error)) {
          messageUserIdColumnAvailable = false;
          delete startMessagePayload.user_id;
          startMsgResult = await supabase.from('messages').insert(startMessagePayload);
        } else if (!startMsgResult.error && startMessagePayload.user_id) {
          messageUserIdColumnAvailable = true;
        }
        assertSupabase(startMsgResult, 'Falha ao registrar início da conversa');
      }

      const fullTicket = await this.getFullTicket(ticket.id);
      if (io && fullTicket) {
        emitTicketEvent(io, 'ticket_created', { ticket: fullTicket }, fullTicket);
        emitTicketEvent(io, 'queue_updated', { ticket: fullTicket }, fullTicket);
        scheduleKpiUpdate(io);
      }
      return { success: true, ticket: fullTicket || ticket, existing: Boolean(activeTickets?.length) };
    } catch (error) {
      console.error('Erro ao iniciar conversa:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendAgentMessage(ticketId, text, currentUser, io, whatsappService, replyToMessageId = null) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Supabase nao configurado' };
    await ensureConversationTrackingColumns();
    
    // Busca rápida do ticket sem overhead de recarregar histórico pesado
    const { data: ticket } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (!ticket || !canUserAccessTicket(currentUser, ticket)) return { success: false, error: 'Ticket nao encontrado' };
    if (isChannelDisconnected(ticket.channel)) {
      return { success: false, error: 'O WhatsApp deste departamento está desconectado. Reconecte o WhatsApp para enviar mensagens.' };
    }
    const agentName = currentUser.name || 'Atendente';
    const now = new Date(); const t = makeTimeStr(now);
    const targetJid = preferredWhatsAppJid(ticket.phone, ticket.jid || ticket.raw_jid);
    const formattedText = `*${agentName}:*\n\n${text}`;
    try {
      let repliedMessage = null;
      if (replyToMessageId) {
        if (!(await ensureMessageInteractionColumns())) {
          return { success: false, error: 'Execute a atualização SQL das mensagens antes de usar a resposta vinculada.' };
        }
        const replyResult = await supabase
          .from('messages')
          .select('*')
          .eq('id', replyToMessageId)
          .eq('ticket_id', ticket.id)
          .maybeSingle();
        if (replyResult.error) throw replyResult.error;
        repliedMessage = replyResult.data;
        if (!repliedMessage || repliedMessage.deleted_at || !['client', 'agent'].includes(repliedMessage.sender)) {
          return { success: false, error: 'A mensagem selecionada não está mais disponível para resposta.' };
        }
        if (!repliedMessage.remote_message_id) {
          return { success: false, error: 'Esta mensagem antiga não possui o identificador necessário para responder diretamente no WhatsApp.' };
        }
      }
      // 1. Envia imediatamente para o WhatsApp
      const accountId = ticket.channel?.startsWith('whatsapp:') ? ticket.channel.slice('whatsapp:'.length) : null;
      const sent = await whatsappService.sendMessage(targetJid, formattedText, accountId, repliedMessage ? {
        quotedMessage: {
          remoteMessageId: repliedMessage.remote_message_id,
          sender: repliedMessage.sender,
          participantJid: repliedMessage.participant_jid || null,
          text: messagePreview(repliedMessage)
        }
      } : undefined);
      if (sent) {
        // 2. Grava a mensagem no banco
        const agentMessagePayload = {
          ticket_id: ticket.id,
          sender: 'agent',
          text: formattedText,
          time: t,
          remote_message_id: sent?.key?.id || null,
          whatsapp_account_id: accountId || null
        };
        if (repliedMessage) {
          Object.assign(agentMessagePayload, {
            reply_to_message_id: repliedMessage.id,
            reply_to_remote_message_id: repliedMessage.remote_message_id || null,
            reply_preview: messagePreview(repliedMessage),
            reply_sender: repliedMessage.sender === 'client' ? (ticket.client_name || 'Cliente') : (repliedMessage.sender_name || 'Atendente')
          });
        }
        if (messageUserIdColumnAvailable !== false && currentUser?.id) {
          agentMessagePayload.user_id = uuidOrNull(currentUser.id);
        }
        if (conversationTrackingColumnsAvailable === true) {
          Object.assign(agentMessagePayload, {
            sender_type: 'platform',
            sender_name: agentName,
            message_context: 'service'
          });
        }
        let messageResult = await supabase
          .from('messages')
          .insert(agentMessagePayload)
          .select()
          .single();
        if (messageResult.error && (isMissingMessageUserIdColumn(messageResult.error) || isMissingConversationTrackingColumns(messageResult.error) || isMissingRemoteMessageColumns(messageResult.error) || isMissingMessageInteractionColumns(messageResult.error))) {
          if (isMissingMessageUserIdColumn(messageResult.error)) {
            messageUserIdColumnAvailable = false;
            delete agentMessagePayload.user_id;
          }
          if (isMissingConversationTrackingColumns(messageResult.error)) {
            conversationTrackingColumnsAvailable = false;
            delete agentMessagePayload.sender_type;
            delete agentMessagePayload.sender_name;
            delete agentMessagePayload.message_context;
          }
          if (isMissingRemoteMessageColumns(messageResult.error)) {
            remoteMessageColumnsAvailable = false;
            delete agentMessagePayload.remote_message_id;
            delete agentMessagePayload.whatsapp_account_id;
          }
          if (isMissingMessageInteractionColumns(messageResult.error)) {
            delete agentMessagePayload.reply_to_message_id;
            delete agentMessagePayload.reply_to_remote_message_id;
            delete agentMessagePayload.reply_preview;
            delete agentMessagePayload.reply_sender;
          }
          messageResult = await supabase
            .from('messages')
            .insert(agentMessagePayload)
            .select()
            .single();
        } else if (!messageResult.error && agentMessagePayload.user_id) {
          messageUserIdColumnAvailable = true;
        }
        const savedMsg = assertSupabase(messageResult, 'Falha ao salvar mensagem');

        ticket.preview = `Você: ${text.slice(0, 40)}`;
        ticket.time = t;
        const platformUpdate = {
          preview: ticket.preview,
          time: t,
          updated_at: now.toISOString(),
          agent_name: agentName,
          handled_via: mergeHandledVia(ticket.handled_via, 'platform'),
          platform_messages: (ticket.platform_messages || 0) + 1
        };
        let platformUpdateResult = await supabase.from('tickets').update(platformUpdate).eq('id', ticket.id);
        if (platformUpdateResult.error && isMissingConversationTrackingColumns(platformUpdateResult.error)) {
          conversationTrackingColumnsAvailable = false;
          delete platformUpdate.handled_via;
          delete platformUpdate.platform_messages;
          platformUpdateResult = await supabase.from('tickets').update(platformUpdate).eq('id', ticket.id);
        } else if (!platformUpdateResult.error) {
          conversationTrackingColumnsAvailable = true;
        }
        assertSupabase(platformUpdateResult, 'Falha ao atualizar ticket');
        Object.assign(ticket, platformUpdate);

        // 3. Emite WebSocket IMEDIATAMENTE para a interface
        if (io) {
          emitTicketEvent(io, 'new_message', { ticketId: ticket.id, message: savedMsg, ticket }, ticket);
        }
        return { success: true, ticket, message: savedMsg };
      }
    } catch (error) { return { success: false, error: error.message }; }
    return { success: false, error: 'Falha ao enviar' };
  }

  async editAgentMessage(ticketId, messageId, text, currentUser, io, whatsappService) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Supabase não configurado.' };
    try {
      if (!(await ensureMessageInteractionColumns())) {
        return { success: false, error: 'Execute a atualização SQL das mensagens antes de usar a edição.' };
      }
      const { data: ticket, error: ticketError } = await supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle();
      if (ticketError) throw ticketError;
      if (!ticket || !(await canUserAccessTicketDetails(currentUser, ticket))) return { success: false, error: 'Atendimento não encontrado.' };

      const { data: message, error: messageError } = await supabase.from('messages').select('*').eq('id', messageId).eq('ticket_id', ticketId).maybeSingle();
      if (messageError) throw messageError;
      if (!message) return { success: false, error: 'Mensagem não encontrada.' };
      const sentByCurrentUser = String(message.user_id || '') === String(currentUser?.id || '');
      const sentFromConnectedDevice = message.sender_type === 'whatsapp_device' || String(message.sender_name || '').startsWith('WhatsApp (');
      const deviceMutationAllowed = sentFromConnectedDevice && await departmentAllowsDeviceMessageMutations(ticket.department_id);
      if (message.sender !== 'agent' || (sentFromConnectedDevice ? !deviceMutationAllowed : !sentByCurrentUser)) {
        return { success: false, error: sentFromConnectedDevice
          ? 'O administrador não autorizou este departamento a editar mensagens enviadas pelo celular.'
          : 'Você só pode editar mensagens enviadas por você.' };
      }
      if (message.deleted_at) return { success: false, error: 'Uma mensagem excluída não pode ser editada.' };
      if (message.type && message.type !== 'text') return { success: false, error: 'Somente mensagens de texto podem ser editadas.' };
      if (!message.remote_message_id) return { success: false, error: 'Esta mensagem antiga não possui o identificador necessário para edição no WhatsApp.' };

      const agentName = currentUser.name || message.sender_name || 'Atendente';
      const formattedText = `*${agentName}:*\n\n${String(text).trim()}`;
      const accountId = message.whatsapp_account_id || (ticket.channel?.startsWith('whatsapp:') ? ticket.channel.slice('whatsapp:'.length) : null);
      const targetJid = messageMutationWhatsAppJid(ticket, sentFromConnectedDevice);
      await whatsappService.editMessage(targetJid, message.remote_message_id, formattedText, accountId);

      const editedAt = new Date().toISOString();
      const updateResult = await supabase.from('messages').update({ text: formattedText, edited_at: editedAt }).eq('id', message.id).select().single();
      if (updateResult.error && isMissingMessageInteractionColumns(updateResult.error)) {
        return { success: false, error: 'Execute a atualização SQL das mensagens antes de usar a edição.' };
      }
      const updatedMessage = assertSupabase(updateResult, 'Falha ao atualizar mensagem');
      emitTicketEvent(io, 'message_updated', { ticketId, message: updatedMessage }, ticket);
      return { success: true, message: updatedMessage };
    } catch (error) {
      return { success: false, error: error.message || 'Não foi possível editar a mensagem.' };
    }
  }

  async deleteAgentMessage(ticketId, messageId, currentUser, io, whatsappService) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Supabase não configurado.' };
    try {
      if (!(await ensureMessageInteractionColumns())) {
        return { success: false, error: 'Execute a atualização SQL das mensagens antes de usar a exclusão.' };
      }
      const { data: ticket, error: ticketError } = await supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle();
      if (ticketError) throw ticketError;
      if (!ticket || !(await canUserAccessTicketDetails(currentUser, ticket))) return { success: false, error: 'Atendimento não encontrado.' };

      const { data: message, error: messageError } = await supabase.from('messages').select('*').eq('id', messageId).eq('ticket_id', ticketId).maybeSingle();
      if (messageError) throw messageError;
      if (!message) return { success: false, error: 'Mensagem não encontrada.' };
      const sentByCurrentUser = String(message.user_id || '') === String(currentUser?.id || '');
      const sentFromConnectedDevice = message.sender_type === 'whatsapp_device' || String(message.sender_name || '').startsWith('WhatsApp (');
      const deviceMutationAllowed = sentFromConnectedDevice && await departmentAllowsDeviceMessageMutations(ticket.department_id);
      if (message.sender !== 'agent' || (sentFromConnectedDevice ? !deviceMutationAllowed : !sentByCurrentUser)) {
        return { success: false, error: sentFromConnectedDevice
          ? 'O administrador não autorizou este departamento a excluir mensagens enviadas pelo celular.'
          : 'Você só pode excluir mensagens enviadas por você.' };
      }
      if (message.deleted_at) return { success: true, message };
      if (!message.remote_message_id) return { success: false, error: 'Esta mensagem antiga não possui o identificador necessário para exclusão no WhatsApp.' };

      const accountId = message.whatsapp_account_id || (ticket.channel?.startsWith('whatsapp:') ? ticket.channel.slice('whatsapp:'.length) : null);
      const targetJid = messageMutationWhatsAppJid(ticket, sentFromConnectedDevice);
      await whatsappService.deleteMessage(targetJid, message.remote_message_id, accountId);

      const deletedAt = new Date().toISOString();
      const updateResult = await supabase.from('messages').update({
        text: '',
        media_url: null,
        file_name: null,
        deleted_at: deletedAt
      }).eq('id', message.id).select().single();
      if (updateResult.error && isMissingMessageInteractionColumns(updateResult.error)) {
        return { success: false, error: 'Execute a atualização SQL das mensagens antes de usar a exclusão.' };
      }
      const deletedMessage = assertSupabase(updateResult, 'Falha ao excluir mensagem');
      emitTicketEvent(io, 'message_deleted', { ticketId, message: deletedMessage }, ticket);
      return { success: true, message: deletedMessage };
    } catch (error) {
      return { success: false, error: error.message || 'Não foi possível excluir a mensagem.' };
    }
  }

  async sendAgentMedia(ticketId, fileBuffer, metadata, currentUser, io, whatsappService) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Supabase nao configurado' };
    await ensureConversationTrackingColumns();
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) return { success: false, error: 'Arquivo vazio ou inválido.' };
    try {
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();
      if (ticketError) throw ticketError;
      if (!ticket || !canUserAccessTicket(currentUser, ticket)) return { success: false, error: 'Ticket nao encontrado' };
      if (isChannelDisconnected(ticket.channel)) {
        return { success: false, error: 'O WhatsApp deste departamento está desconectado. Reconecte o WhatsApp para enviar mensagens.' };
      }

      let mimeType = String(metadata.mimeType || 'application/octet-stream').slice(0, 120).toLowerCase();
      const requestedType = String(metadata.mediaType || '').toLowerCase();
      const mediaType = requestedType === 'audio' || mimeType.startsWith('audio/') ? 'audio'
        : requestedType === 'image' || mimeType.startsWith('image/') ? 'image'
          : requestedType === 'video' || mimeType.startsWith('video/') ? 'video'
            : 'document';
      const { displayName, extension } = safeUploadedFileName(metadata.fileName);
      const normalizedMedia = await normalizeOutgoingMedia(fileBuffer, {
        mediaType,
        mimeType,
        voiceNote: metadata.voiceNote === true
      });
      const outgoingBuffer = normalizedMedia.buffer;
      mimeType = normalizedMedia.mimeType;
      const inferredExtension = normalizedMedia.fileExtension || extension || ({ audio: '.ogg', image: '.jpg', video: '.mp4', document: '.bin' }[mediaType]);
      const storedName = `sent_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}${inferredExtension}`;
      const mediaUrl = `/api/media/${storedName}`;
      const caption = String(metadata.caption || '').trim().slice(0, 4000);
      const agentName = currentUser.name || 'Atendente';
      const targetJid = preferredWhatsAppJid(ticket.phone, ticket.jid || ticket.raw_jid);
      const accountId = ticket.channel?.startsWith('whatsapp:') ? ticket.channel.slice('whatsapp:'.length) : null;

      await fs.promises.mkdir(MEDIA_DIR, { recursive: true });
      const storedMediaPath = path.join(MEDIA_DIR, storedName);
      const sendPromise = whatsappService.sendMediaMessage(
        targetJid,
        outgoingBuffer,
        mediaType,
        caption,
        displayName,
        accountId,
        mimeType,
        normalizedMedia.voiceNote === true
      );
      // A cópia local e o envio ao WhatsApp fazem parte do caminho principal.
      // O backup no Supabase continua em paralelo, mas não segura a resposta da
      // interface; isso reduz a espera percebida em arquivos maiores.
      const localWritePromise = fs.promises.writeFile(storedMediaPath, outgoingBuffer);
      cloudStorage.uploadMedia(storedName, outgoingBuffer, mimeType)
        .catch(error => console.warn(`Mídia enviada salva apenas localmente: ${error.message}`));
      const [, sent] = await Promise.all([localWritePromise, sendPromise]);
      if (!sent) {
        await fs.promises.unlink(storedMediaPath).catch(() => {});
        return { success: false, error: 'Falha ao enviar arquivo para o WhatsApp.' };
      }

      const now = new Date();
      const formattedText = `*${agentName}:*${caption ? `\n\n${caption}` : ''}`;
      const outgoingMediaPayload = {
        ticket_id: ticket.id,
        sender: 'agent',
        ...(messageUserIdColumnAvailable !== false && currentUser?.id ? { user_id: uuidOrNull(currentUser.id) } : {}),
        ...(conversationTrackingColumnsAvailable === true ? {
          sender_type: 'platform',
          sender_name: agentName,
          message_context: 'service'
        } : {}),
        type: mediaType,
        text: formattedText,
        time: makeTimeStr(now),
        media_url: mediaUrl,
        media_type: mimeType,
        file_name: displayName,
        remote_message_id: sent?.key?.id || null,
        whatsapp_account_id: accountId || null
      };
      let messageResult = await supabase.from('messages').insert(outgoingMediaPayload).select().single();
      if (messageResult.error && (isMissingMessageUserIdColumn(messageResult.error) || isMissingConversationTrackingColumns(messageResult.error) || isMissingRemoteMessageColumns(messageResult.error))) {
        if (isMissingMessageUserIdColumn(messageResult.error)) {
          messageUserIdColumnAvailable = false;
          delete outgoingMediaPayload.user_id;
        }
        if (isMissingConversationTrackingColumns(messageResult.error)) {
          conversationTrackingColumnsAvailable = false;
          delete outgoingMediaPayload.sender_type;
          delete outgoingMediaPayload.sender_name;
          delete outgoingMediaPayload.message_context;
        }
        if (isMissingRemoteMessageColumns(messageResult.error)) {
          remoteMessageColumnsAvailable = false;
          delete outgoingMediaPayload.remote_message_id;
          delete outgoingMediaPayload.whatsapp_account_id;
        }
        messageResult = await supabase.from('messages').insert(outgoingMediaPayload).select().single();
      } else if (!messageResult.error && outgoingMediaPayload.user_id) {
        messageUserIdColumnAvailable = true;
      }
      const savedMessage = assertSupabase(messageResult, 'Falha ao salvar mídia enviada');
      if (savedMessage) {
        savedMessage.media_size = outgoingBuffer?.length || fileBuffer?.length || null;
        savedMessage.file_size = outgoingBuffer?.length || fileBuffer?.length || null;
      }
      rememberMediaTicket(mediaUrl, ticket.id);
      if (outgoingBuffer?.length) rememberMediaSize(mediaUrl, outgoingBuffer.length);
      const preview = caption || ({ audio: '🎙️ Áudio', image: '📷 Imagem', video: '🎥 Vídeo', document: `📄 ${displayName}` }[mediaType]);
      const updatePayload = {
        preview,
        time: makeTimeStr(now),
        updated_at: now.toISOString(),
        agent_name: agentName,
        handled_via: mergeHandledVia(ticket.handled_via, 'platform'),
        platform_messages: (ticket.platform_messages || 0) + 1
      };
      let ticketUpdateResult = await supabase.from('tickets').update(updatePayload).eq('id', ticket.id);
      if (ticketUpdateResult.error && isMissingConversationTrackingColumns(ticketUpdateResult.error)) {
        conversationTrackingColumnsAvailable = false;
        delete updatePayload.handled_via;
        delete updatePayload.platform_messages;
        ticketUpdateResult = await supabase.from('tickets').update(updatePayload).eq('id', ticket.id);
      } else if (!ticketUpdateResult.error) {
        conversationTrackingColumnsAvailable = true;
      }
      assertSupabase(ticketUpdateResult, 'Falha ao atualizar ticket');
      rememberMediaTicket(mediaUrl, ticket.id);
      Object.assign(ticket, updatePayload);
      if (io) {
        emitTicketEvent(io, 'new_message', { ticketId: ticket.id, message: savedMessage, ticket }, ticket);
      }
      return { success: true, ticket, message: savedMessage };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async assumeTicket(ticketId, currentUser, io) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Supabase nao configurado' };
    try {
      const { data: existingTicket, error: ticketError } = await supabase
        .from('tickets')
        .select('id, user_id, agent_name, department_id, department, status, assumed, is_group')
        .eq('id', ticketId)
        .maybeSingle();
      if (ticketError) throw ticketError;
      if (!existingTicket || !canUserAccessTicket(currentUser, existingTicket)) return { success: false, error: 'Ticket nao encontrado' };
      if (existingTicket.is_group) return { success: false, error: 'Grupos do WhatsApp permanecem sempre abertos e não precisam ser assumidos.' };

      // Se o chamado já está em atendimento e atribuído ao mesmo usuário, retorna com sucesso
      if (existingTicket.status === 'em_atendimento' && (existingTicket.user_id === currentUser.id || existingTicket.agent_name === currentUser.name)) {
        const fullTicket = await this.getFullTicket(ticketId);
        return { success: true, ticket: fullTicket };
      }

      const agentName = currentUser.name || 'Atendente';
      const nowISO = new Date().toISOString();
      const claimPayload = {
        status: 'em_atendimento',
        assumed: true,
        user_id: uuidOrNull(currentUser.id),
        agent_name: agentName,
        assumed_at: nowISO,
        updated_at: nowISO
      };
      if (ticketTimingColumnsAvailable !== false) {
        claimPayload.first_response_at = nowISO;
      }
      let claimResult;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        claimResult = await supabase
          .from('tickets')
          .update(claimPayload)
          .eq('id', ticketId)
          .eq('status', 'aguardando')
          .or('assumed.eq.false,assumed.is.null')
          .select('id')
          .maybeSingle();

        if (!claimResult.error) {
          if ('first_response_at' in claimPayload) ticketTimingColumnsAvailable = true;
          break;
        }
        if (!isMissingTicketTimingColumns(claimResult.error)) break;

        const errorMessage = String(claimResult.error.message || '');
        let removedField = false;
        for (const field of ['first_response_at', 'assumed_at']) {
          if (field in claimPayload && errorMessage.includes(field)) {
            delete claimPayload[field];
            removedField = true;
          }
        }
        if (!removedField) {
          delete claimPayload.first_response_at;
          delete claimPayload.assumed_at;
        }
        ticketTimingColumnsAvailable = false;
      }

      if (claimResult.error) throw claimResult.error;
      if (!claimResult.data) {
        // Duas requisições do mesmo atendente podem disputar o mesmo chamado
        // antes de a interface terminar de atualizar. Nesse caso, assumir é
        // idempotente: a segunda requisição confirma o resultado da primeira.
        const { data: latestTicket, error: latestError } = await supabase
          .from('tickets')
          .select('id, user_id, agent_name, department_id, department, status, assumed')
          .eq('id', ticketId)
          .maybeSingle();
        if (latestError) throw latestError;
        if (latestTicket?.status === 'em_atendimento' && (latestTicket.user_id === currentUser.id || latestTicket.agent_name === currentUser.name)) {
          const fullTicket = await this.getFullTicket(ticketId);
          return { success: true, ticket: fullTicket };
        }
        return { success: false, error: 'Este atendimento já foi assumido por outro atendente.' };
      }

      assertSupabase(await supabase.from('messages').insert({ ticket_id: ticketId, sender: 'system', type: 'divider', text: `Atendimento assumido por ${agentName}`, time: makeTimeStr(new Date()) }), 'Falha ao registrar atendimento');
      const fullTicket = await this.getFullTicket(ticketId);
      if (io) { emitTicketEvent(io, 'ticket_updated', { ticket: fullTicket }, fullTicket); scheduleKpiUpdate(io); }
      return { success: true, ticket: fullTicket };
    } catch (e) { return { success: false, error: e.message }; }
  }

  async transferTicket(ticketId, transferData, currentUser, io, whatsappService) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Supabase nao configurado' };
    try {
      const { departmentId, departmentName, targetUserId, targetUserName, note } = transferData;
      if (isSupervisor(currentUser) && (!departmentId || !canAccessDepartment(currentUser, departmentId))) {
        return { success: false, error: 'Supervisores só podem transferir atendimentos entre os departamentos sob sua supervisão.' };
      }
      
      const { data: currentTicket } = await supabase
        .from('tickets')
        .select('id, jid, raw_jid, phone, client_name, department, department_id, agent_name, status, channel, is_group')
        .eq('id', ticketId)
        .single();

      if (!currentTicket || !canUserAccessTicket(currentUser, currentTicket)) return { success: false, error: 'Ticket nao encontrado' };
      if (currentTicket.is_group) return { success: false, error: 'Grupos são permanentes e não podem ser transferidos como atendimentos.' };

      const oldDept = currentTicket.department || 'Geral';
      const newDept = departmentName || 'Novo Departamento';
      const now = new Date();
      const timeStr = makeTimeStr(now);

      const updatePayload = {
        updated_at: now.toISOString(),
        department: newDept
      };

      if (departmentId && departmentId.length > 10) {
        updatePayload.department_id = departmentId;
      }

      if (targetUserName) {
        updatePayload.user_id = uuidOrNull(targetUserId);
        updatePayload.agent_name = targetUserName;
        updatePayload.assumed = true;
        updatePayload.status = 'em_atendimento';
      } else {
        updatePayload.user_id = null;
        updatePayload.agent_name = null;
        updatePayload.assumed = false;
        updatePayload.status = 'aguardando';
      }

      assertSupabase(await supabase.from('tickets').update(updatePayload).eq('id', ticketId), 'Falha ao transferir ticket');

      const updatedTicket = { ...currentTicket, ...updatePayload };

      // Registra mensagem de sistema no histórico da conversa
      let transferMsgText = `🔄 Atendimento transferido de *${oldDept}* para *${newDept}* por *${currentUser.name || 'Atendente'}*`;
      if (targetUserName) {
        transferMsgText += ` (Direcionado para: *${targetUserName}*)`;
      }
      if (note && note.trim()) {
        transferMsgText += ` 💬 Motivo: *${note.trim()}*`;
      }

      const transferMessageResult = await supabase.from('messages').insert({
        ticket_id: ticketId,
        sender: 'system',
        type: 'divider',
        text: transferMsgText,
        time: timeStr
      }).select().single();
      const savedTransferMessage = assertSupabase(transferMessageResult, 'Falha ao registrar transferência');
      if (io) emitTicketEvent(io, 'new_message', { ticketId, message: savedTransferMessage, ticket: updatedTicket }, updatedTicket);

      // Emite WebSocket imediatamente
      if (io) {
        emitTicketEvent(io, 'ticket_transferred', { ticket: updatedTicket, fromDept: oldDept, toDept: newDept, by: currentUser.name }, updatedTicket);
        emitTicketEvent(io, 'ticket_updated', { ticket: updatedTicket }, updatedTicket);
        scheduleKpiUpdate(io);
      }

      // Notifica o cliente via WhatsApp sobre a transferência em background
      if (whatsappService) {
        const botConfig = await getBotConfig();
        const targetJid = preferredWhatsAppJid(currentTicket.phone, currentTicket.jid || currentTicket.raw_jid);
        if (targetJid && botConfig.send_transfer_notice) {
          const clientNotice = renderBotMessage(botConfig.transfer_message, {
            nome: currentTicket.client_name || 'Cliente',
            departamento: newDept,
            atendente: targetUserName || ''
          });
          const accountId = currentTicket.channel?.startsWith('whatsapp:') ? currentTicket.channel.slice('whatsapp:'.length) : null;
          if (clientNotice.trim()) whatsappService.sendMessage(targetJid, clientNotice, accountId).catch(e => {
            console.warn('Erro ao notificar cliente no WhatsApp sobre transferência:', e.message);
          });
        }
      }

      return { success: true, ticket: updatedTicket };
    } catch (e) {
      console.error('❌ Erro ao transferir ticket:', e);
      return { success: false, error: e.message };
    }
  }

  async closeTicket(ticketId, currentUser, io, whatsappService, options = {}) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Supabase nao configurado' };
    try {
      const agentName = currentUser.name || 'Atendente';
      const now = new Date();
      const encerradoEm = makeTimeStr(now);

      const botConfig = await getBotConfig();
      const allowAgentToggle = Boolean(botConfig.allow_agent_toggle_rating);
      // Se allow_agent_toggle_rating estiver desativado, o envio é automático respeitando send_rating_request
      const shouldSendSurvey = allowAgentToggle
        ? Boolean(options?.sendSurvey !== false && botConfig.send_rating_request)
        : Boolean(botConfig.send_rating_request);

      const { data: ticket } = await supabase
        .from('tickets')
        .select('id, jid, raw_jid, phone, client_name, department, department_id, agent_name, channel, is_employee, is_group')
        .eq('id', ticketId)
        .single();

      if (!ticket || !canUserAccessTicket(currentUser, ticket)) return { success: false, error: 'Ticket nao encontrado' };
      if (ticket.is_group) return { success: false, error: 'Grupos do WhatsApp são permanentes e não podem ser encerrados.' };
      // ─── Update direto no banco ─────
      assertSupabase(await supabase.from('tickets').update({
        status: 'finalizado',
        assumed: false,
        encerrado_em: encerradoEm,
        encerrado_por: agentName,
        closed_at: now.toISOString(),
        awaiting_rating: Boolean(!ticket.is_employee && shouldSendSurvey),
        updated_at: now.toISOString()
      }).eq('id', ticketId), 'Falha ao encerrar ticket');

      // Insere mensagem de sistema em background
      assertSupabase(await supabase.from('messages').insert({
        ticket_id: ticketId,
        sender: 'system',
        type: 'divider',
        time: encerradoEm,
        text: `✅ Atendimento encerrado por *${agentName}* às *${encerradoEm}*`
      }), 'Falha ao registrar encerramento');

      const closedTicket = { ...ticket, status: 'finalizado', encerrado_por: agentName, encerrado_em: encerradoEm };

      // Emite WebSocket imediatamente para a tela atualizar na hora
      if (io) {
        emitTicketEvent(io, 'ticket_updated', { ticket: closedTicket }, closedTicket);
        scheduleKpiUpdate(io);
      }

      // Envia pesquisa de satisfação via WhatsApp em background (não atrasa a resposta)
      if (whatsappService && ticket) {
        const targetJid = preferredWhatsAppJid(ticket.phone, ticket.jid || ticket.raw_jid);
        if (targetJid && !ticket.is_employee && shouldSendSurvey) {
          const ratingMsg = renderBotMessage(botConfig.rating_request_message, {
            nome: ticket.client_name || 'Cliente',
            departamento: ticket.department || '',
            atendente: agentName
          });
          
          const accountId = ticket.channel?.startsWith('whatsapp:') ? ticket.channel.slice('whatsapp:'.length) : null;
          if (ratingMsg.trim()) whatsappService.sendMessage(targetJid, ratingMsg, accountId).catch(e => {
            console.warn('⚠️ Erro ao enviar pesquisa de satisfação:', e.message);
          });
        }
      }

      return { success: true, ticket: closedTicket };
    } catch (e) {
      console.error('❌ Erro ao encerrar ticket:', e);
      return { success: false, error: e.message };
    }
  }

  async markAsRead(ticketId, currentUser, io) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Supabase nao configurado' };
    try {
      const existingTicket = await this.getFullTicket(ticketId, currentUser);
      if (!existingTicket) return { success: false, error: 'Ticket nao encontrado' };
      assertSupabase(await supabase.from('tickets').update({ unread_count: 0 }).eq('id', ticketId), 'Falha ao marcar ticket como lido');
      const fullTicket = await this.getFullTicket(ticketId);
      if (io) emitTicketEvent(io, 'queue_updated', { ticket: fullTicket }, fullTicket);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async updateContact(ticketId, contactData, currentUser, io) {
    if (!isSupabaseConfigured()) return { success: false, error: 'Supabase nao configurado' };
    try {
      const existingTicket = await this.getFullTicket(ticketId, currentUser);
      if (!existingTicket) return { success: false, error: 'Ticket nao encontrado' };
      const { name, phone, email, cnpj, note, is_employee: requestedEmployee } = contactData;
      let normalizedPhone = String(phone || existingTicket.phone || '').replace(/\D/g, '');
      if (normalizedPhone.length === 10 || normalizedPhone.length === 11) normalizedPhone = `55${normalizedPhone}`;

      let existingContact = null;
      if (existingTicket.contact_id) {
        const result = await supabase.from('contacts').select('*').eq('id', existingTicket.contact_id).maybeSingle();
        if (result.error) throw result.error;
        existingContact = result.data;
      }
      if (!existingContact && normalizedPhone) existingContact = await findContactByPhone(normalizedPhone);

      const isEmployee = requestedEmployee === undefined
        ? Boolean(existingContact?.is_employee ?? existingTicket.is_employee)
        : requestedEmployee === true || requestedEmployee === 'true';
      const contactPayload = {
        name: String(name || existingContact?.name || existingTicket.client_name || 'Cliente').trim(),
        phone: normalizedPhone || null,
        email: email !== undefined ? (email || null) : (existingContact?.email || null),
        cnpj: cnpj !== undefined ? (cnpj || null) : (existingContact?.cnpj || null),
        channel: existingContact?.channel || 'WhatsApp',
        status: existingContact?.status || 'Ativo',
        notes: note !== undefined ? (note || null) : (existingContact?.notes || null),
        avatar_url: existingContact?.avatar_url || existingTicket.avatar_url || null,
        is_employee: isEmployee
      };

      let contactResult;
      if (existingContact) {
        contactResult = await supabase.from('contacts').update(contactPayload).eq('id', existingContact.id).select().single();
      } else {
        contactResult = await supabase.from('contacts').insert({ id: crypto.randomUUID(), ...contactPayload }).select().single();
      }
      const savedContact = assertSupabase(contactResult, 'Falha ao salvar contato');

      const updatePayload = {
        client_name: contactPayload.name,
        initials: contactPayload.name.substring(0, 2).toUpperCase(),
        phone: normalizedPhone || existingTicket.phone,
        contact_id: savedContact.id,
        avatar_url: savedContact.avatar_url || existingTicket.avatar_url || null,
        is_employee: isEmployee,
        updated_at: new Date().toISOString()
      };
      assertSupabase(await supabase.from('tickets').update(updatePayload).eq('id', ticketId), 'Falha ao atualizar contato do atendimento');
      assertSupabase(
        await supabase.from('tickets').update({ is_employee: isEmployee, avatar_url: savedContact.avatar_url || existingTicket.avatar_url || null }).eq('contact_id', savedContact.id),
        'Falha ao sincronizar classificação do contato'
      );
      if (normalizedPhone) {
        assertSupabase(
          await supabase.from('tickets').update({ contact_id: savedContact.id, is_employee: isEmployee, avatar_url: savedContact.avatar_url || existingTicket.avatar_url || null }).eq('phone', normalizedPhone),
          'Falha ao sincronizar classificação pelo telefone'
        );
      }

      const fullTicket = await this.getFullTicket(ticketId);
      if (io && fullTicket) {
        emitTicketEvent(io, 'ticket_updated', { ticket: fullTicket }, fullTicket);
        emitTicketEvent(io, 'queue_updated', { ticket: fullTicket }, fullTicket);
        scheduleKpiUpdate(io);
      }

      return { success: true, ticket: fullTicket };
    } catch (e) {
      console.error('Erro ao atualizar contato:', e);
      return { success: false, error: e.message };
    }
  }

  async attachIncomingMedia(media, io) {
    if (!isSupabaseConfigured() || !media?.ticketId || !media?.mediaUrl) return false;
    try {
      const updatePayload = {
        type: media.mediaType,
        media_url: media.mediaUrl,
        media_type: media.mediaType,
        file_name: media.fileName || null
      };
      let message = null;
      if (remoteMessageColumnsAvailable !== false && media.messageId && media.whatsappAccountId) {
        const result = await supabase.from('messages').update(updatePayload)
          .eq('ticket_id', media.ticketId)
          .eq('remote_message_id', media.messageId)
          .eq('whatsapp_account_id', media.whatsappAccountId)
          .select().maybeSingle();
        if (!result.error) message = result.data;
        else if (isMissingRemoteMessageColumns(result.error)) remoteMessageColumnsAvailable = false;
      }
      if (!message) {
        const { data: candidate } = await supabase.from('messages')
          .select('id')
          .eq('ticket_id', media.ticketId)
          .eq('sender', 'client')
          .eq('type', media.mediaType)
          .is('media_url', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (candidate) {
          const result = await supabase.from('messages').update(updatePayload).eq('id', candidate.id).select().single();
          if (result.error) throw result.error;
          message = result.data;
        }
      }
      if (!message) return false;
      rememberMediaTicket(media.mediaUrl, media.ticketId);
      if (media.fileSize) rememberMediaSize(media.mediaUrl, media.fileSize);
      const fullTicket = await this.getFullTicket(media.ticketId);
      if (io && fullTicket) {
        emitTicketEvent(io, 'ticket_updated', { ticket: fullTicket }, fullTicket);
      }
      return true;
    } catch (error) {
      console.warn(`Falha ao vincular mídia recuperada ao atendimento: ${error.message}`);
      return false;
    }
  }

  async canAccessMedia(filename, user) {
    if (!isSupabaseConfigured()) return false;
    let ticketId = mediaTicketCache.get(filename) || null;
    if (!ticketId) {
      let message = null;
      for (const mediaPath of [`/api/media/${filename}`, `/media/${filename}`]) {
        const result = await supabase.from('messages').select('ticket_id').eq('media_url', mediaPath).limit(1).maybeSingle();
        if (!result.error && result.data) {
          message = result.data;
          break;
        }
      }
      if (!message) {
        const absoluteResult = await supabase.from('messages').select('ticket_id, media_url').ilike('media_url', `%/${filename}`).limit(50);
        message = (absoluteResult.data || []).find(item => {
          try { return new URL(item.media_url).pathname.split('/').pop() === filename; } catch { return false; }
        }) || null;
      }
      if (!message) {
        const legacyResult = await supabase.from('messages').select('ticket_id, text').like('text', `%${filename}%`).limit(50);
        message = (legacyResult.data || []).find(item => String(item.text || '').includes(`||/api/media/${filename}`)
          || String(item.text || '').includes(`||/media/${filename}`)) || null;
      }
      if (!message) return false;
      ticketId = message.ticket_id;
      rememberMediaTicket(`/api/media/${filename}`, ticketId);
    }
    if (isAdmin(user)) return true;

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, user_id, agent_name, encerrado_por, department_id, department, status')
      .eq('id', ticketId)
      .maybeSingle();
    if (ticketError || !ticket) return false;
    return canUserAccessTicketDetails(user, ticket);
  }

  async handleAccountDisconnected(accountId, reason = 'manual_disconnect', io = null) {
    if (!accountId) return { success: false, closedCount: 0, inactivedGroupsCount: 0 };

    if (!disconnectedAccountsLoaded) {
      await initDisconnectedAccounts();
    }

    const key = String(accountId);
    const existing = disconnectedAccountsMap.get(key);
    const now = new Date();
    
    // CRÍTICO: Se a conta já estiver registrada como desconectada, PRESERVA o horário original!
    // Caso contrário, a cada retry de reconexão de 5s o cronômetro era zerado para 'now',
    // fazendo com que a retenção e o descarte nunca disparassem.
    let disconnectedAtStr;
    if (existing && existing.disconnected_at) {
      disconnectedAtStr = existing.disconnected_at;
    } else {
      const accounts = await getKnownWhatsAppAccounts();
      const matched = accounts.find(a => String(a.id) === key);
      disconnectedAtStr = recordedDisconnectAt(matched) || now.toISOString();
    }

    disconnectedAccountsMap.set(key, {
      disconnected_at: disconnectedAtStr,
      reason: existing ? existing.reason : reason
    });
    await persistDisconnectedAccounts();

    const rules = await getDisconnectRules();
    console.log(`[WhatsApp:${accountId}] Conta desconectada (${reason}). Chats permanecerão na fila por ${rules.queue_retention_minutes}min e serão descartados após ${rules.discard_hours}h se não reconectados. (Desconectado desde: ${disconnectedAtStr})`);

    if (io) {
      io.emit('whatsapp_account_disconnected', {
        accountId,
        reason,
        disconnected_at: disconnectedAtStr,
        retentionMinutes: rules.queue_retention_minutes,
        discardHours: rules.discard_hours
      });
      io.emit('tickets_updated');
    }

    return {
      success: true,
      closedCount: 0,
      inactivedGroupsCount: 0,
      retainedInQueue: true,
      retentionMinutes: rules.queue_retention_minutes
    };
  }

  async handleAccountReconnected(accountId, io = null) {
    if (!accountId) return;
    const key = String(accountId);
    if (disconnectedAccountsMap.has(key)) {
      disconnectedAccountsMap.delete(key);
      await persistDisconnectedAccounts();
    }
    knownWhatsAppAccountsCache = null;

    if (isSupabaseConfigured()) {
      try {
        await supabase.from('tickets')
          .update({ status: 'grupo', updated_at: new Date().toISOString() })
          .eq('channel', `whatsapp:${accountId}`)
          .eq('status', 'grupo_inativo');
      } catch (e) {
        console.warn(`[WhatsApp:${accountId}] erro ao reativar grupos inativos:`, e.message);
      }
    }

    console.log(`[WhatsApp:${accountId}] Conta reconectada com sucesso. Fila e atendimentos restaurados.`);

    if (io) {
      io.emit('whatsapp_account_reconnected', { accountId });
      io.emit('tickets_updated');
      scheduleKpiUpdate(io);
    }
  }

  /**
   * Rotina central e periódica para descarte automático de atendimentos cuja conexão expirou.
   * Chamada pelo server.js em background a cada 60s ou sob demanda.
   */
  async cleanupExpiredDisconnectedTickets(io = null, whatsappService = null) {
    if (!isSupabaseConfigured()) return { discarded: 0, retained: 0 };
    try {
      if (!disconnectedAccountsLoaded) {
        await initDisconnectedAccounts();
      }
      const [rules, accounts] = await Promise.all([
        getDisconnectRules(),
        getKnownWhatsAppAccounts(whatsappService)
      ]);
      const retentionMs = rules.queue_retention_minutes * 60 * 1000;
      const discardMs = rules.discard_hours * 3600 * 1000;
      const nowMs = Date.now();

      const tickets = await fetchAllTicketPages(() => supabase
        .from('tickets')
        .select('id, channel, is_group, status, updated_at, created_at')
        .in('status', ['aguardando', 'em_atendimento', 'chatbot', 'grupo'])
        .order('updated_at', { ascending: false }));

      if (!tickets.length) return { discarded: 0, retained: 0 };

      const expiredDiscardIds = [];
      const expiredGroupDiscardIds = [];
      let retainedCount = 0;

      for (const t of tickets) {
        const disconnectInfo = getChannelDisconnectInfo(t.channel, accounts);
        if (disconnectInfo && disconnectInfo.disconnected_at) {
          const diffMs = nowMs - new Date(disconnectInfo.disconnected_at).getTime();
          if (diffMs > discardMs) {
            if (t.is_group) expiredGroupDiscardIds.push(t.id);
            else expiredDiscardIds.push(t.id);
          } else if (diffMs > retentionMs) {
            retainedCount++;
          }
        }
      }

      const totalDiscard = expiredDiscardIds.length + expiredGroupDiscardIds.length;
      if (totalDiscard > 0) {
        await this.discardExpiredDisconnectedTickets(expiredDiscardIds, expiredGroupDiscardIds);
        console.log(`🧹 [Cleanup] ${totalDiscard} atendimentos/grupos descartados por desconexão prolongada do WhatsApp (> ${rules.discard_hours}h).`);
        if (io) {
          io.emit('tickets_updated');
          scheduleKpiUpdate(io);
        }
      }

      return {
        discarded: totalDiscard,
        retained: retainedCount,
        expiredTickets: expiredDiscardIds.length,
        expiredGroups: expiredGroupDiscardIds.length
      };
    } catch (e) {
      console.warn('Erro na rotina de limpeza de atendimentos expirados:', e.message);
      return { discarded: 0, retained: 0 };
    }
  }

  async discardExpiredDisconnectedTickets(ticketIds = [], groupIds = []) {
    if (!isSupabaseConfigured()) return;
    try {
      const now = new Date();
      const timeStr = makeTimeStr(now);
      if (ticketIds.length) {
        await supabase
          .from('tickets')
          .update({
            status: 'finalizado',
            assumed: false,
            encerrado_em: timeStr,
            encerrado_por: 'Sistema (Descarte por desconexão prolongada do WhatsApp)',
            closed_at: now.toISOString(),
            updated_at: now.toISOString()
          })
          .in('id', ticketIds);
      }
      if (groupIds.length) {
        await supabase
          .from('tickets')
          .update({
            status: 'grupo_inativo',
            updated_at: now.toISOString()
          })
          .in('id', groupIds);
      }
    } catch (error) {
      console.error('Falha ao descartar atendimentos expirados por desconexão:', error.message);
    }
  }

  getMediaSize(mediaUrl, fileName = null) {
    const raw = String(fileName || mediaUrl || '').trim();
    if (!raw) return 0;
    const filename = path.basename(raw.split('?')[0]);
    if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) return 0;
    if (mediaSizeCache.has(filename)) return mediaSizeCache.get(filename);
    try {
      const localPath = path.join(MEDIA_DIR, filename);
      if (fs.existsSync(localPath)) {
        const size = fs.statSync(localPath).size;
        rememberMediaSize(filename, size);
        return size;
      }
    } catch (_) {}
    return 0;
  }
}

const ticketService = new TicketService();
ticketService._test = {
  mergeHandledVia,
  preferredWhatsAppJid,
  messageMutationWhatsAppJid,
  phoneFromWhatsAppIdentity,
  makeTimeStr,
  APP_TIME_ZONE,
  historyTicketVisibleToUser,
  selectOutboundWhatsAppAccount,
  isMissingMessageUserIdColumn,
  isMissingConversationTrackingColumns,
  isMissingRemoteMessageColumns,
  isMissingMessageInteractionColumns,
  messagePreview,
  rememberMediaSize,
  mediaSizeCache,
  makeInitials,
  parseRatingInput,
  isRatingEligibleTicket,
  getChannelDisconnectInfo
};

module.exports = ticketService;
