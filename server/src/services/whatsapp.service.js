// Gerenciador multi-conta do WhatsApp (Baileys Multi-Device)
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pino = require('pino');
const { buildAudioPayload } = require('./media-payload.service');
const ticketService = require('./ticket.service');
const KeyedTaskQueue = require('./keyed-task-queue.service');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const cloudStorage = require('./cloud-storage.service');

const SESSION_ROOT = path.join(__dirname, '../../session_auth');
const ACCOUNTS_ROOT = path.join(SESSION_ROOT, 'accounts');
const SETTINGS_KEY = 'whatsapp_accounts';
const MEDIA_DIR = path.join(__dirname, '../../public/media');
const RETRY_CACHE_FILE = 'message-retry-cache.json';
const ROUTING_MODE_GENERAL = 'general';
const ROUTING_MODE_DEPARTMENT = 'department';
const EMIT_OWN_EVENTS = true;
const MARK_ONLINE_ON_CONNECT = false;

class ExpiringCache {
  constructor({ ttlMs = 60 * 60 * 1000, maxEntries = 10000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.values = new Map();
  }

  get(key) {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    if (!key) return;
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.values.size > this.maxEntries) {
      this.values.delete(this.values.keys().next().value);
    }
  }

  del(key) {
    this.values.delete(key);
  }

  flushAll() {
    this.values.clear();
  }

  snapshot() {
    const now = Date.now();
    const entries = [];
    for (const [key, entry] of this.values) {
      if (entry.expiresAt <= now) {
        this.values.delete(key);
        continue;
      }
      entries.push({ key, value: entry.value, expiresAt: entry.expiresAt });
    }
    return entries;
  }

  restore(entries = []) {
    const now = Date.now();
    for (const entry of entries) {
      if (!entry?.key || !entry.expiresAt || entry.expiresAt <= now) continue;
      this.values.set(entry.key, { value: entry.value, expiresAt: entry.expiresAt });
    }
    while (this.values.size > this.maxEntries) this.values.delete(this.values.keys().next().value);
  }
}

function messageCacheKey(key = {}) {
  return `${String(key.remoteJid || '').replace(/:\d+@/, '@')}:${key.id || ''}`;
}

function messageIdCacheKey(key = {}) {
  return key.id ? `message-id:${key.id}` : '';
}

function envInteger(name, fallback, minimum = 0) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

function reconnectDelay(attempt) {
  const base = envInteger('WHATSAPP_RECONNECT_BASE_MS', 5000, 1000);
  const maximum = envInteger('WHATSAPP_RECONNECT_MAX_MS', 300000, base);
  return Math.min(maximum, base * (2 ** Math.max(0, attempt - 1)));
}

function mediaSizeBytes(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readBoundedMedia(source, maxBytes) {
  if (Buffer.isBuffer(source)) {
    return source.length > maxBytes
      ? { overflow: true, size: source.length }
      : { buffer: source, size: source.length };
  }
  if (!source || typeof source[Symbol.asyncIterator] !== 'function') {
    throw new Error('O WhatsApp retornou uma mídia em formato desconhecido.');
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of source) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += piece.length;
    if (total > maxBytes) {
      if (typeof source.destroy === 'function') source.destroy();
      return { overflow: true, size: total };
    }
    chunks.push(piece);
  }
  return { buffer: Buffer.concat(chunks), size: total };
}

function safeAccountId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function normalizeAccountRouting(config = {}) {
  const routingMode = config.routing_mode === ROUTING_MODE_DEPARTMENT || config.routingMode === ROUTING_MODE_DEPARTMENT
    ? ROUTING_MODE_DEPARTMENT
    : ROUTING_MODE_GENERAL;
  const departmentId = routingMode === ROUTING_MODE_DEPARTMENT
    ? String(config.department_id || config.departmentId || '').trim() || null
    : null;
  const departmentName = routingMode === ROUTING_MODE_DEPARTMENT
    ? String(config.department_name || config.departmentName || '').trim().slice(0, 120) || null
    : null;
  const fallbackDepartmentId = String(config.fallback_department_id || config.fallbackDepartmentId || '').trim() || null;
  const fallbackDepartmentName = String(config.fallback_department_name || config.fallbackDepartmentName || '').trim().slice(0, 120) || null;
  return { routingMode, departmentId, departmentName, fallbackDepartmentId, fallbackDepartmentName };
}

function normalizeCallEvent(call = {}) {
  const from = String(call.from || call.chatId || call.peerJid || '').trim();
  const rawStatus = String(call.status || 'offer').toLowerCase();
  const status = ['offer', 'ringing'].includes(rawStatus)
    ? 'ringing'
    : (['accept', 'accepted'].includes(rawStatus) ? 'answered' : 'ended');
  return {
    callId: String(call.id || call.callId || `${from}:${call.date || Date.now()}`),
    from,
    status,
    isVideo: Boolean(call.isVideo || call.video),
    isGroup: Boolean(call.isGroup),
    timestamp: call.date || call.timestamp || Date.now()
  };
}

async function applyAccountRoutingWithPersistence(account, routing, persist) {
  const hadFallbackDepartmentId = Object.prototype.hasOwnProperty.call(account, 'fallbackDepartmentId');
  const hadFallbackDepartmentName = Object.prototype.hasOwnProperty.call(account, 'fallbackDepartmentName');
  const previousRouting = {
    routingMode: account.routingMode,
    departmentId: account.departmentId,
    departmentName: account.departmentName,
    fallbackDepartmentId: account.fallbackDepartmentId,
    fallbackDepartmentName: account.fallbackDepartmentName
  };
  account.routingMode = routing.routingMode;
  account.departmentId = routing.departmentId;
  account.departmentName = routing.departmentName;
  if (Object.prototype.hasOwnProperty.call(routing, 'fallbackDepartmentId')) account.fallbackDepartmentId = routing.fallbackDepartmentId;
  if (Object.prototype.hasOwnProperty.call(routing, 'fallbackDepartmentName')) account.fallbackDepartmentName = routing.fallbackDepartmentName;
  try {
    await persist();
  } catch (error) {
    Object.assign(account, previousRouting);
    if (!hadFallbackDepartmentId) delete account.fallbackDepartmentId;
    if (!hadFallbackDepartmentName) delete account.fallbackDepartmentName;
    throw error;
  }
}

function loadLidMap(account) {
  try {
    const file = path.join(ACCOUNTS_ROOT, account.id, 'lid-map.json');
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        account.lidMap.set(k, v);
      }
    }
  } catch (_) {}

  try {
    const credsFile = path.join(ACCOUNTS_ROOT, account.id, 'creds.json');
    if (fs.existsSync(credsFile)) {
      const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
      if (creds?.me?.id && creds?.me?.lid) {
        recordLidPair(account, creds.me.id, creds.me.lid);
      }
    }
  } catch (_) {}
}

function saveLidMap(account) {
  if (!account?.id) return;
  clearTimeout(account.lidMapSaveTimer);
  account.lidMapSaveTimer = setTimeout(() => {
    account.lidMapSaveTimer = null;
    const file = path.join(ACCOUNTS_ROOT, account.id, 'lid-map.json');
    const obj = Object.fromEntries(account.lidMap.entries());
    fs.promises.writeFile(file, JSON.stringify(obj)).catch(() => {});
  }, 400);
  account.lidMapSaveTimer.unref?.();
}

function scheduleSessionBackup(account, delayMs = 15000) {
  if (!account?.authDir || account.sessionBackupTimer) return;
  account.sessionBackupTimer = setTimeout(async () => {
    account.sessionBackupTimer = null;
    if (account.sessionBackupPromise) {
      scheduleSessionBackup(account, delayMs);
      return;
    }
    try {
      account.sessionBackupPromise = cloudStorage.backupSession(account.id, account.authDir);
      await account.sessionBackupPromise;
    } catch (error) {
      console.warn(`[WhatsApp:${account.name}] falha ao salvar sessão na nuvem: ${error.message}`);
    } finally {
      account.sessionBackupPromise = null;
    }
  }, delayMs);
  account.sessionBackupTimer.unref?.();
}

async function loadRetryMessageCache(account, BufferJSON) {
  const file = path.join(account.authDir, RETRY_CACHE_FILE);
  try {
    const serialized = await fs.promises.readFile(file, 'utf8');
    const entries = JSON.parse(serialized, BufferJSON?.reviver);
    account.messageCache.restore(Array.isArray(entries) ? entries : []);
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`[WhatsApp:${account.name}] cache de reenvio ignorado: ${error.message}`);
  }
}

function scheduleRetryMessageCacheSave(account) {
  if (!account?.authDir || !account.bufferJSON) return;
  clearTimeout(account.messageCacheSaveTimer);
  account.messageCacheSaveTimer = setTimeout(async () => {
    const file = path.join(account.authDir, RETRY_CACHE_FILE);
    const temporaryFile = `${file}.tmp`;
    try {
      const serialized = JSON.stringify(account.messageCache.snapshot(), account.bufferJSON.replacer);
      await fs.promises.writeFile(temporaryFile, serialized, 'utf8');
      await fs.promises.rename(temporaryFile, file);
      scheduleSessionBackup(account);
    } catch (error) {
      console.warn(`[WhatsApp:${account.name}] falha ao persistir cache de reenvio: ${error.message}`);
      fs.promises.unlink(temporaryFile).catch(() => {});
    }
  }, 250);
  account.messageCacheSaveTimer.unref?.();
}

function cacheRetryMessage(account, key, message) {
  if (!account?.messageCache || !key?.id || !message) return;
  account.messageCache.set(messageCacheKey(key), message);
  account.messageCache.set(messageIdCacheKey(key), message);
  scheduleRetryMessageCacheSave(account);
}

function getCachedRetryMessage(account, key) {
  if (!account?.messageCache) return undefined;
  return account.messageCache.get(messageCacheKey(key))
    || account.messageCache.get(messageIdCacheKey(key));
}

function recordLidPair(account, phoneOrJid, lidOrJid) {
  if (!account?.lidMap || !phoneOrJid || !lidOrJid) return false;
  let phoneJid = String(phoneOrJid).trim();
  let lidJid = String(lidOrJid).trim();

  if (phoneJid.includes('@lid') && !lidJid.includes('@lid')) {
    const tmp = phoneJid;
    phoneJid = lidJid;
    lidJid = tmp;
  }

  if (!phoneJid.includes('@') && /^\d+$/.test(phoneJid)) {
    phoneJid = `${phoneJid}@s.whatsapp.net`;
  }
  if (!lidJid.includes('@') && /^\d+$/.test(lidJid)) {
    lidJid = `${lidJid}@lid`;
  }

  const cleanPhoneJid = phoneJid.replace(/:\d+@/, '@').replace(/:\d+$/, '');
  const cleanLidJid = lidJid.replace(/:\d+@/, '@').replace(/:\d+$/, '');
  const rawPhone = cleanPhoneJid.replace('@s.whatsapp.net', '');
  const rawLid = cleanLidJid.replace('@lid', '');

  if (!rawPhone || !rawLid || rawPhone === rawLid) return false;

  account.lidMap.set(lidJid, cleanPhoneJid);
  account.lidMap.set(cleanLidJid, cleanPhoneJid);
  account.lidMap.set(rawLid, cleanPhoneJid);
  account.lidMap.set(cleanPhoneJid, cleanLidJid);
  account.lidMap.set(rawPhone, cleanLidJid);
  return true;
}

function getPhoneFromJid(jid, lidMap) {
  if (!jid) return '';
  const cleanJid = jid.replace(/:\d+@/, '@').replace(/:\d+$/, '');
  // Um JID telefônico já contém o número correto. O mapa é bidirecional e,
  // se consultado nesse caso, devolveria o LID em vez do telefone.
  const resolved = cleanJid.includes('@lid')
    ? (lidMap?.get(jid) || lidMap?.get(cleanJid) || cleanJid)
    : cleanJid;
  return resolved.replace('@lid', '').replace('@s.whatsapp.net', '').replace(/:\d+$/, '');
}

function phoneJidFromMessageMetadata(msg = null) {
  const candidates = [
    msg?.key?.remoteJidAlt,
    msg?.key?.participantAlt,
    msg?.key?.senderPn,
    msg?.key?.participantPn,
    msg?.key?.remoteJidPn,
    msg?.senderPn,
    msg?.participantPn,
    msg?.remoteJidPn,
    msg?.participant
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim().replace(/:\d+@/, '@').replace(/:\d+$/, '');
    if (!value || value.includes('@lid')) continue;
    if (!value.endsWith('@s.whatsapp.net') && !value.endsWith('@c.us')) continue;
    const digits = value.replace(/@(?:s\.whatsapp\.net|c\.us)$/, '').replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return `${digits}@s.whatsapp.net`;
  }
  return '';
}

async function resolveJid(jid, account) {
  if (!jid) return '';
  const cleanJid = jid.replace(/:\d+@/, '@').replace(/:\d+$/, '');
  if (!cleanJid.includes('@lid')) return cleanJid;
  const locallyMapped = account?.lidMap?.get(jid) || account?.lidMap?.get(cleanJid);
  if (locallyMapped && !locallyMapped.includes('@lid')) return locallyMapped;
  try {
    const internallyMapped = await account?.sock?.signalRepository?.lidMapping?.getPNForLID(cleanJid);
    if (internallyMapped && !internallyMapped.includes('@lid')) {
      if (recordLidPair(account, internallyMapped, cleanJid)) saveLidMap(account);
      return internallyMapped.replace(/:\d+@/, '@').replace(/:\d+$/, '');
    }
  } catch (error) {
    console.warn(`[WhatsApp:${account?.name || 'conta'}] não foi possível resolver o LID antes do envio: ${error.message}`);
  }
  // A linha 7 do Baileys trata LIDs internamente. Não transformamos o número
  // opaco do LID em telefone, pois isso cria uma sessão Signal incorreta e faz
  // o celular exibir "Aguardando mensagem".
  return cleanJid;
}

function unwrapMessageContent(message) {
  let content = message || {};
  const wrapperKeys = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'editedMessage'
  ];
  for (let depth = 0; depth < 8; depth += 1) {
    const wrapper = wrapperKeys.find(key => content[key]?.message);
    if (!wrapper) break;
    content = content[wrapper].message;
  }
  return content;
}

function messageContentPreview(message) {
  const content = unwrapMessageContent(message);
  const text = content.conversation || content.extendedTextMessage?.text
    || content.imageMessage?.caption || content.videoMessage?.caption
    || content.documentMessage?.caption || '';
  if (text) return String(text).replace(/\s+/g, ' ').trim().slice(0, 180);
  if (content.imageMessage) return '📷 Imagem';
  if (content.videoMessage) return '🎥 Vídeo';
  if (content.audioMessage) return content.audioMessage.ptt ? '🎙️ Mensagem de voz' : '🎵 Áudio';
  if (content.documentMessage) return `📄 ${content.documentMessage.fileName || 'Documento'}`;
  if (content.stickerMessage) return '🖼️ Figurinha';
  return 'Mensagem';
}

function safeFileToken(value) {
  return String(value || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || crypto.randomUUID();
}

class WhatsAppService {
  constructor() {
    this.accounts = new Map();
    this.io = null;
    this.loaded = false;
    this.messageQueue = new KeyedTaskQueue({
      concurrency: envInteger('WHATSAPP_MESSAGE_CONCURRENCY', 10, 1),
      maxPending: envInteger('WHATSAPP_MAX_PENDING_MESSAGES', 10000, 1),
      taskTimeoutMs: envInteger('WHATSAPP_TASK_TIMEOUT_MS', 120000, 1000)
    });
    this.recentMessageIds = new Map();
    this.platformMessageIds = new Map();
    this.maxMediaBytes = envInteger('WHATSAPP_MAX_MEDIA_MB', 25, 1) * 1024 * 1024;
    this.mediaRetentionDays = envInteger('WHATSAPP_MEDIA_RETENTION_DAYS', 30, 0);
    this.mediaCleanupHours = envInteger('WHATSAPP_MEDIA_CLEANUP_HOURS', 6, 1);
    this.mediaCleanupTimer = null;
    this.externalTicketCleanupTimer = null;
    this.externalTicketCleanupRunning = false;
    ticketService.setWhatsAppService(this);
  }

  setIO(ioInstance) {
    this.io = ioInstance;
  }

  async initializeAll() {
    if (this.loaded) return;
    this.loaded = true;
    fs.mkdirSync(ACCOUNTS_ROOT, { recursive: true });
    this.startMediaCleanup();
    this.startExternalTicketCleanup();
    this.migrateLegacySession();

    let configs = await this.loadConfigs();
    const defaultSession = path.join(ACCOUNTS_ROOT, 'default', 'creds.json');
    if (configs.length === 0 && fs.existsSync(defaultSession)) {
      configs = [{ id: 'default', name: 'WhatsApp Principal', active: true, created_at: new Date().toISOString() }];
      await this.saveConfigs(configs);
    }

    for (const config of configs) this.ensureAccount(config);
    for (const account of this.accounts.values()) {
      if (account.active !== false) this.initialize(account.id).catch(error => console.error(`[WhatsApp:${account.name}]`, error.message));
    }
  }

  async backupAllSessions() {
    const tasks = [...this.accounts.values()].map(account =>
      cloudStorage.backupSession(account.id, path.join(ACCOUNTS_ROOT, account.id))
        .catch(error => console.warn(`[WhatsApp:${account.name}] falha no backup final da sessão: ${error.message}`))
    );
    await Promise.all(tasks);
  }

  migrateLegacySession() {
    const legacyCreds = path.join(SESSION_ROOT, 'creds.json');
    if (!fs.existsSync(legacyCreds)) return;
    const target = path.join(ACCOUNTS_ROOT, 'default');
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(SESSION_ROOT, { withFileTypes: true })) {
      if (entry.name === 'accounts') continue;
      fs.renameSync(path.join(SESSION_ROOT, entry.name), path.join(target, entry.name));
    }
    console.log('✅ Sessão WhatsApp existente migrada para a conta principal.');
  }

  async loadConfigs() {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
    if (error) {
      console.warn('Não foi possível carregar as contas do WhatsApp:', error.message);
      return [];
    }
    return Array.isArray(data?.value) ? data.value : [];
  }

  async saveConfigs(configs = null, { throwOnError = false } = {}) {
    if (!isSupabaseConfigured()) {
      const failure = new Error('Supabase não configurado; as contas do WhatsApp não podem ser persistidas.');
      if (throwOnError) throw failure;
      console.warn(failure.message);
      return false;
    }
    const value = configs || [...this.accounts.values()].map(account => ({
      id: account.id,
      name: account.name,
      active: account.active !== false,
      phone: account.phone || null,
      display_name: account.displayName || null,
      routing_mode: account.routingMode,
      department_id: account.departmentId || null,
      department_name: account.departmentName || null,
      fallback_department_id: account.fallbackDepartmentId || null,
      fallback_department_name: account.fallbackDepartmentName || null,
      created_at: account.createdAt,
      last_connected_at: account.lastConnectedAt || null,
      status: account.status,
      last_disconnected_at: account.lastDisconnectedAt || null,
      disconnect_reason: account.disconnectReason || null,
      reconnect_attempts: account.reconnectAttempts || 0,
      next_reconnect_at: account.nextReconnectAt || null
    }));
    const { error } = await supabase.from('system_settings').upsert({ key: SETTINGS_KEY, value, updated_at: new Date() }, { onConflict: 'key' });
    if (error) {
      const failure = new Error(`Falha ao salvar contas do WhatsApp: ${error.message}`);
      if (throwOnError) throw failure;
      console.error(failure.message);
      return false;
    }
    return true;
  }

  ensureAccount(config) {
    const id = safeAccountId(config.id);
    if (!id) throw new Error('Identificador de conta inválido.');
    if (!this.accounts.has(id)) {
      const routing = normalizeAccountRouting(config);
      this.accounts.set(id, {
        id,
        name: String(config.name || 'WhatsApp').slice(0, 80),
        active: config.active !== false,
        phone: config.phone || null,
        displayName: config.display_name || null,
        routingMode: routing.routingMode,
        departmentId: routing.departmentId,
        departmentName: routing.departmentName,
        fallbackDepartmentId: routing.fallbackDepartmentId,
        fallbackDepartmentName: routing.fallbackDepartmentName,
        createdAt: config.created_at || new Date().toISOString(),
        lastConnectedAt: config.last_connected_at || null,
        lastDisconnectedAt: config.last_disconnected_at || null,
        disconnectReason: config.disconnect_reason || null,
        reconnectAttempts: 0,
        nextReconnectAt: null,
        status: 'disconnected',
        qrCode: null,
        sock: null,
        initializing: false,
        reconnectTimer: null,
        manualDisconnect: false,
        authDir: null,
        bufferJSON: null,
        sessionBackupTimer: null,
        sessionBackupPromise: null,
        messageCacheSaveTimer: null,
        lidMap: new Map(),
        messageCache: new ExpiringCache({
          ttlMs: envInteger('WHATSAPP_RETRY_CACHE_HOURS', 24, 1) * 60 * 60 * 1000,
          maxEntries: 10000
        }),
        msgRetryCounterCache: new ExpiringCache({ ttlMs: 60 * 60 * 1000, maxEntries: 10000 }),
        placeholderResendCache: new ExpiringCache({ ttlMs: 10 * 60 * 1000, maxEntries: 10000 }),
        userDevicesCache: new ExpiringCache({ ttlMs: 5 * 60 * 1000, maxEntries: 5000 }),
        profilePictureCache: new ExpiringCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 10000 }),
        groupMetadataCache: new ExpiringCache({ ttlMs: 30 * 60 * 1000, maxEntries: 1000 })
      });
      loadLidMap(this.accounts.get(id));
    }
    return this.accounts.get(id);
  }

  async createAccount(name, value = {}) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Informe um nome para identificar a conta.');
    if (this.accounts.size >= 20) throw new Error('Limite de 20 contas do WhatsApp atingido.');
    const account = this.ensureAccount({ id: crypto.randomUUID(), name: cleanName, active: true, ...value });
    if (account.fallbackDepartmentId) await this.validateFallbackDepartment(account);
    await this.saveConfigs();
    await this.initialize(account.id);
    return this.publicAccount(account, true);
  }

  async updateAccountRouting(accountId, value = {}) {
    const account = this.accounts.get(safeAccountId(accountId));
    if (!account) throw new Error('Conta do WhatsApp não encontrada.');
    if (!isSupabaseConfigured()) throw new Error('O Supabase precisa estar configurado para salvar o roteamento do WhatsApp.');

    const routing = normalizeAccountRouting(value);
    if (routing.routingMode === ROUTING_MODE_DEPARTMENT) {
      if (!routing.departmentId) throw new Error('Selecione o departamento vinculado a este WhatsApp.');
      const { data: department, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('id', routing.departmentId)
        .maybeSingle();
      if (error) throw new Error(`Não foi possível validar o departamento: ${error.message}`);
      if (!department) throw new Error('O departamento selecionado não foi encontrado.');
      routing.departmentId = department.id;
      routing.departmentName = department.name;
    }
    if (routing.fallbackDepartmentId) {
      const { data: fallback, error } = await supabase.from('departments').select('id, name').eq('id', routing.fallbackDepartmentId).maybeSingle();
      if (error) throw new Error(`Não foi possível validar o departamento padrão da conta: ${error.message}`);
      if (!fallback) throw new Error('O departamento padrão individual não foi encontrado.');
      routing.fallbackDepartmentId = fallback.id;
      routing.fallbackDepartmentName = fallback.name;
    } else {
      routing.fallbackDepartmentName = null;
    }

    await applyAccountRoutingWithPersistence(
      account,
      routing,
      () => this.saveConfigs(null, { throwOnError: true })
    );
    this.emitAccounts();
    if (account.status === 'connected') this.syncAccountGroups(account).catch(() => {});
    return this.publicAccount(account, true);
  }

  async validateFallbackDepartment(account) {
    if (!account?.fallbackDepartmentId) return null;
    const { data, error } = await supabase.from('departments').select('id, name').eq('id', account.fallbackDepartmentId).maybeSingle();
    if (error || !data) throw new Error('O departamento padrão individual não foi encontrado.');
    account.fallbackDepartmentId = data.id;
    account.fallbackDepartmentName = data.name;
    return data;
  }

  async initialize(accountId, { isAutoReconnect = false } = {}) {
    const account = this.accounts.get(safeAccountId(accountId));
    if (!account) throw new Error('Conta do WhatsApp não encontrada.');
    if (account.initializing || account.status === 'connected') return this.publicAccount(account, true);
    if (!isAutoReconnect) {
      account.reconnectAttempts = 0;
    }
    account.initializing = true;
    account.manualDisconnect = false;
    account.status = 'connecting';
    account.nextReconnectAt = null;
    this.emitAccounts();

    const authDir = path.join(ACCOUNTS_ROOT, account.id);
    account.authDir = authDir;
    fs.mkdirSync(authDir, { recursive: true });
    if (!fs.existsSync(path.join(authDir, 'creds.json'))) {
      try {
        const restoreStartedAt = Date.now();
        console.log(`[WhatsApp:${account.name}] restaurando sessão do armazenamento seguro...`);
        const restored = await cloudStorage.restoreSession(account.id, authDir);
        if (restored) console.log(`[WhatsApp:${account.name}] sessão restaurada do armazenamento seguro (${restored} arquivos em ${((Date.now() - restoreStartedAt) / 1000).toFixed(1)}s).`);
      } catch (error) {
        console.warn(`[WhatsApp:${account.name}] não foi possível restaurar a sessão: ${error.message}`);
      }
    }

    try {
      const baileys = await import('@whiskeysockets/baileys');
      const { state, saveCreds } = await baileys.useMultiFileAuthState(authDir);
      account.bufferJSON = baileys.BufferJSON;
      await loadRetryMessageCache(account, baileys.BufferJSON);
      if (account.sock) {
        try { account.sock.ev.removeAllListeners(); account.sock.end(); } catch {}
      }

      const socketLogger = pino({ level: 'silent' });
      const persistentKeys = {
        get: (...args) => state.keys.get(...args),
        set: async data => {
          await state.keys.set(data);
          // As chaves Signal mudam em mensagens normais sem necessariamente
          // disparar creds.update. Persisti-las evita restauração incompleta
          // depois de reinícios do Render.
          scheduleSessionBackup(account);
        }
      };
      const sock = baileys.default({
        auth: {
          creds: state.creds,
          keys: baileys.makeCacheableSignalKeyStore(persistentKeys, socketLogger)
        },
        logger: socketLogger,
        browser: ['Brisoft Shop', 'Chrome', '1.0.0'],
        // Mantém as notificações e a sincronização normais no celular principal.
        // Quando true, o WhatsApp pode considerar o cliente Web permanentemente
        // ativo e reduzir a entrega de notificações para o telefone.
        markOnlineOnConnect: MARK_ONLINE_ON_CONNECT,
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 10000,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        msgRetryCounterCache: account.msgRetryCounterCache,
        placeholderResendCache: account.placeholderResendCache,
        userDevicesCache: account.userDevicesCache,
        maxMsgRetryCount: 5,
        // O pedido de retry pode chegar por PN ou por LID. O ID da mensagem é
        // estável entre os dois endereçamentos e serve como fallback seguro.
        getMessage: async key => getCachedRetryMessage(account, key),
        // Necessário para receber mensagens enviadas pelo celular ou por outro
        // dispositivo vinculado à mesma conta e registrá-las no atendimento.
        emitOwnEvents: EMIT_OWN_EVENTS
      });
      account.sock = sock;
      sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
          scheduleSessionBackup(account);
        } catch (error) {
          console.warn(`[WhatsApp:${account.name}] falha ao gravar credenciais: ${error.message}`);
        }
      });
      this.bindContacts(account, baileys.downloadMediaMessage, baileys.downloadContentFromMessage);
      this.bindConnection(account, baileys.DisconnectReason);
      this.bindMessages(account, baileys.downloadMediaMessage, baileys.downloadContentFromMessage);
      this.bindCalls(account);
      return this.publicAccount(account, true);
    } catch (error) {
      account.initializing = false;
      account.status = 'disconnected';
      account.lastDisconnectedAt = new Date().toISOString();
      account.disconnectReason = 'initialization_error';
      await this.saveConfigs().catch(() => {});
      this.emitAccounts();
      throw error;
    }
  }

  bindContacts(account, downloadMediaMessage, downloadContentFromMessage) {
    const updateContacts = contacts => {
      let changed = false;
      for (const c of contacts || []) {
        if (c.lid && (c.id || c.jid || c.phoneNumber)) {
          if (recordLidPair(account, c.id || c.jid || c.phoneNumber, c.lid)) changed = true;
        }
      }
      if (changed) saveLidMap(account);
    };

    const updateChats = chats => {
      let changed = false;
      for (const ch of chats || []) {
        if (ch.lidJid && ch.id) {
          if (recordLidPair(account, ch.id, ch.lidJid)) changed = true;
        }
      }
      if (changed) saveLidMap(account);
    };

    account.sock.ev.on('contacts.upsert', updateContacts);
    account.sock.ev.on('contacts.update', updateContacts);
    account.sock.ev.on('contacts.set', data => updateContacts(data?.contacts));
    account.sock.ev.on('chats.upsert', updateChats);
    account.sock.ev.on('chats.update', updateChats);
    account.sock.ev.on('chats.set', data => updateChats(data?.chats));
    account.sock.ev.on('lid-mapping.update', mapping => {
      const entries = Array.isArray(mapping?.mapping) ? mapping.mapping : [mapping];
      let changed = false;
      for (const entry of entries) {
        const lid = entry?.lid || entry?.lidJid;
        const pn = entry?.pn || entry?.pnJid;
        if (lid && pn && recordLidPair(account, pn, lid)) changed = true;
      }
      if (changed) saveLidMap(account);
    });
    account.sock.ev.on('messaging-history.set', ({ chats, contacts, messages, syncType }) => {
      console.log(`[WhatsApp:${account.name}] histórico sincronizado (${chats?.length || 0} conversas, ${messages?.length || 0} msgs, tipo: ${syncType || 'n/d'}).`);
      if (Array.isArray(contacts) && contacts.length) updateContacts(contacts);
      if (Array.isArray(chats) && chats.length) updateChats(chats);
      if (Array.isArray(messages) && messages.length && downloadMediaMessage) {
        this.processBatchMessages(account, messages, downloadMediaMessage, downloadContentFromMessage);
      }
      this.syncAccountGroups(account).catch(() => {});
      if (this.io) {
        this.io.emit('tickets_updated');
      }
    });
  }

  processBatchMessages(account, messages = [], downloadMediaMessage, downloadContentFromMessage) {
    const now = Date.now();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    for (const msg of messages) {
      if (!msg?.message || !msg?.key?.remoteJid) continue;
      const ts = typeof msg.messageTimestamp === 'object' && msg.messageTimestamp?.low ? msg.messageTimestamp.low : Number(msg.messageTimestamp);
      const ms = ts > 1e11 ? ts : ts * 1000;
      if (ms && (now - ms > maxAgeMs)) continue;

      const rawJid = msg.key.remoteJid;
      if (rawJid.includes('@newsletter') || rawJid.includes('status@broadcast')) continue;

      const messageKey = `${account.id}:${msg.key.id || `${rawJid}:${msg.messageTimestamp}`}`;
      if (this.recentMessageIds.has(messageKey)) continue;
      this.rememberMessageId(messageKey);

      this.messageQueue.enqueue(`${account.id}:${rawJid}`, async () => {
        if (rawJid.includes('@g.us')) {
          const res = await this.processGroupMessage(account, msg, downloadMediaMessage, downloadContentFromMessage);
          if (res && String(res.type).startsWith('ignored_')) this.recentMessageIds.delete(messageKey);
          return res;
        }
        if (!msg.key.fromMe) {
          const res = await this.processIncomingMessage(account, msg, downloadMediaMessage, downloadContentFromMessage);
          if (res && String(res.type).startsWith('ignored_')) this.recentMessageIds.delete(messageKey);
          return res;
        }
        const res = await this.processExternalOutgoingMessage(account, msg, downloadMediaMessage, downloadContentFromMessage);
        if (res && String(res.type).startsWith('ignored_')) this.recentMessageIds.delete(messageKey);
        return res;
      }).catch((error) => {
        this.recentMessageIds.delete(messageKey);
        if (/Fila de mensagens cheia/i.test(error?.message || '')) {
          console.error(`[WhatsApp:${account.name}] mensagem descartada: a fila estourou o limite (${messageKey}).`);
        }
      });
    }
  }

  bindConnection(account, DisconnectReason) {
    const sock = account.sock;
    sock.ev.on('connection.update', async update => {
      if (account.sock !== sock) return;
      const { connection, lastDisconnect, qr } = update;
      try {
      if (qr) {
        account.qrCode = await QRCode.toDataURL(qr);
        account.status = 'scan_qr';
        account.initializing = false;
        console.log(`[WhatsApp:${account.name}] QR Code disponível.`);
        this.saveConfigs().catch(() => {});
        this.emitAccounts();
      }

      if (connection === 'open') {
        const user = account.sock.user || {};
        if (user.id && user.lid) {
          recordLidPair(account, user.id, user.lid);
          saveLidMap(account);
        }
        account.phone = getPhoneFromJid(user.id, account.lidMap) || account.phone;
        account.displayName = user.name || account.displayName || account.name;
        account.lastConnectedAt = new Date().toISOString();
        account.lastDisconnectedAt = null;
        account.disconnectReason = null;
        account.reconnectAttempts = 0;
        account.nextReconnectAt = null;
        account.status = 'connected';
        account.qrCode = null;
        account.initializing = false;
        console.log(`[WhatsApp:${account.name}] conectado${account.phone ? ` (${account.phone})` : ''}.`);
        // Agenda o pacote após estabilização inicial para não travar a conexão
        scheduleSessionBackup(account, 5000);
        await this.saveConfigs().catch(error => console.warn(`[WhatsApp:${account.name}] falha ao salvar conexão: ${error.message}`));
        this.emitAccounts();
        ticketService.handleAccountReconnected(account.id, this.io).catch(error => console.warn(`[WhatsApp:${account.name}] falha ao restaurar atendimentos: ${error.message}`));
        this.syncAccountGroups(account).catch(error => console.warn(`[WhatsApp:${account.name}] falha ao sincronizar grupos: ${error.message}`));
      }

      if (connection === 'close') {
        if (account.sock !== sock && account.sock) return;
        if (account.isShuttingDown) {
          console.log(`[WhatsApp:${account.name}] conexão fechada para encerramento gracioso do servidor.`);
          return;
        }
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const disconnectReason = loggedOut ? 'device_logout' : 'connection_lost';
        account.status = 'disconnected';
        account.lastDisconnectedAt = account.lastDisconnectedAt || new Date().toISOString();
        account.disconnectReason = disconnectReason;
        account.qrCode = null;
        account.initializing = false;
        if (account.sock === sock) account.sock = null;
        try { sock.ev.removeAllListeners(); } catch (_) {}
        console.warn(`[WhatsApp:${account.name}] conexão encerrada (código ${statusCode || 'desconhecido'}).`);
        this.emitAccounts();
        if (loggedOut) {
          account.phone = null;
          account.displayName = null;
          fs.rmSync(path.join(ACCOUNTS_ROOT, account.id), { recursive: true, force: true });
          cloudStorage.deleteSession(account.id).catch(() => {});
          this.saveConfigs().catch(() => {});
          ticketService.handleAccountDisconnected(account.id, 'device_logout', this.io).catch(error => {
            console.error(`[WhatsApp:${account.name}] falha ao processar desconexão após logout do aparelho:`, error.message);
          });
        } else if (!account.manualDisconnect && account.active !== false) {
          ticketService.handleAccountDisconnected(account.id, 'connection_lost', this.io).catch(() => {});
          account.reconnectAttempts += 1;
          const maxAttempts = envInteger('WHATSAPP_RECONNECT_MAX_ATTEMPTS', 8, 1);
          const slowRetryInterval = envInteger('WHATSAPP_RECONNECT_MAX_MS', 300000, 60000);
          const delay = account.reconnectAttempts <= maxAttempts
            ? reconnectDelay(account.reconnectAttempts)
            : slowRetryInterval;

          account.nextReconnectAt = new Date(Date.now() + delay).toISOString();
          clearTimeout(account.reconnectTimer);
          account.reconnectTimer = setTimeout(() => {
            account.nextReconnectAt = null;
            this.initialize(account.id, { isAutoReconnect: true }).catch(() => {});
          }, delay);
          account.reconnectTimer.unref?.();

          if (account.reconnectAttempts === maxAttempts + 1) {
            console.warn(`[WhatsApp:${account.name}] limite de tentativas rápidas atingido (${maxAttempts}). Mantendo tentativas periódicas automáticas a cada ${Math.round(delay / 1000)}s.`);
          }
          this.saveConfigs().catch(() => {});
          this.emitAccounts();
        }
      }
      } catch (error) {
        console.error(`[WhatsApp:${account.name}] falha ao processar atualização da conexão:`, error.message);
      }
    });
  }

  async extractPhone(account, jid, msg = null) {
    if (!jid) return '';
    const cleanJid = jid.replace(/:\d+@/, '@').replace(/:\d+$/, '');
    
    // 1. Se não é @lid, extrai diretamente o número (ex: 5583981131352@s.whatsapp.net -> 5583981131352)
    if (!cleanJid.includes('@lid')) {
      return cleanJid.replace('@s.whatsapp.net', '').replace(/:\d+$/, '');
    }

    const metadataPhoneJid = phoneJidFromMessageMetadata(msg);
    if (metadataPhoneJid) {
      recordLidPair(account, metadataPhoneJid, cleanJid);
      saveLidMap(account);
      return getPhoneFromJid(metadataPhoneJid, account?.lidMap);
    }

    const rawLid = cleanJid.replace('@lid', '').replace(/:\d+$/, '');

    // 2. Se temos mapeamento em memória
    const mapped = account?.lidMap?.get(jid) || account?.lidMap?.get(cleanJid) || account?.lidMap?.get(rawLid);
    if (mapped && !mapped.includes('@lid')) {
      return mapped.replace('@s.whatsapp.net', '').replace(/:\d+$/, '');
    }

    // 3. A versão 7 mantém um repositório persistente de mapeamentos LID/PN.
    try {
      const mappedPn = await account?.sock?.signalRepository?.lidMapping?.getPNForLID(cleanJid);
      if (mappedPn && !mappedPn.includes('@lid')) {
        recordLidPair(account, mappedPn, cleanJid);
        saveLidMap(account);
        return getPhoneFromJid(mappedPn, account?.lidMap);
      }
    } catch (_) {}

    console.warn(`[WhatsApp:${account?.name || 'conta'}] LID ${rawLid} ainda não possui telefone associado; ele não será tratado como número.`);
    return '';
  }

  bindMessages(account, downloadMediaMessage, downloadContentFromMessage) {
    account.sock.ev.on('messages.upsert', event => {
      for (const msg of event.messages || []) {
        if (!msg.message) continue;
        if (msg.key?.id) cacheRetryMessage(account, msg.key, msg.message);
        if (event.type !== 'notify' && event.type !== 'append' && !msg.key.fromMe) continue;
        if (event.type === 'append' && !msg.key.fromMe) {
          const ts = typeof msg.messageTimestamp === 'object' && msg.messageTimestamp?.low ? msg.messageTimestamp.low : Number(msg.messageTimestamp);
          const ms = ts > 1e11 ? ts : ts * 1000;
          if (ms && Date.now() - ms > 24 * 60 * 60 * 1000) continue;
        }
        const rawJid = msg.key.remoteJid;
        if (!rawJid || rawJid.includes('@newsletter') || rawJid.includes('status@broadcast')) continue;
        const messageKey = `${account.id}:${msg.key.id || `${rawJid}:${msg.messageTimestamp}`}`;
        if (msg.key.fromMe && this.platformMessageIds.has(messageKey)) {
          this.platformMessageIds.delete(messageKey);
          continue;
        }
        if (this.recentMessageIds.has(messageKey)) continue;
        this.rememberMessageId(messageKey);

        this.messageQueue.enqueue(`${account.id}:${rawJid}`, async () => {
          if (rawJid.includes('@g.us')) {
            if (msg.key.fromMe) {
              await new Promise(resolve => setTimeout(resolve, 350));
              if (this.platformMessageIds.has(messageKey)) {
                this.platformMessageIds.delete(messageKey);
                return { type: 'platform_group_echo_ignored' };
              }
            }
            const res = await this.processGroupMessage(account, msg, downloadMediaMessage, downloadContentFromMessage);
            if (res && String(res.type).startsWith('ignored_')) this.recentMessageIds.delete(messageKey);
            return res;
          }
          if (!msg.key.fromMe) {
            const res = await this.processIncomingMessage(account, msg, downloadMediaMessage, downloadContentFromMessage);
            if (res && String(res.type).startsWith('ignored_')) this.recentMessageIds.delete(messageKey);
            return res;
          }
          // O evento de sincronização pode chegar alguns milissegundos antes de
          // sendMessage devolver o ID. Esta pequena janela impede que um envio
          // feito pela plataforma seja confundido com uma resposta pelo celular.
          await new Promise(resolve => setTimeout(resolve, 350));
          if (this.platformMessageIds.has(messageKey)) {
            this.platformMessageIds.delete(messageKey);
            return { type: 'platform_echo_ignored' };
          }
          const res = await this.processExternalOutgoingMessage(account, msg, downloadMediaMessage, downloadContentFromMessage);
          if (res && String(res.type).startsWith('ignored_')) this.recentMessageIds.delete(messageKey);
          return res;
        }).catch(error => {
          this.recentMessageIds.delete(messageKey);
          console.error(`[WhatsApp:${account.name}] falha ao processar mensagem: ${error.message}`);
        });
      }
    });
  }

  async profilePictureUrl(account, jid) {
    if (!account?.sock || !jid) return null;
    const cached = account.profilePictureCache?.get(jid);
    if (cached !== undefined) return cached || null;
    let url = null;
    try { url = await account.sock.profilePictureUrl(jid, 'image'); } catch (_) {}
    account.profilePictureCache?.set(jid, url || '');
    return url || null;
  }

  async groupMetadata(account, groupJid) {
    const cached = account.groupMetadataCache?.get(groupJid);
    if (cached) return cached;
    const metadata = await account.sock.groupMetadata(groupJid);
    account.groupMetadataCache?.set(groupJid, metadata);
    return metadata;
  }

  async syncAccountGroups(account) {
    if (!account?.sock || account.status !== 'connected') return [];
    try {
      const all = await account.sock.groupFetchAllParticipating();
      const metadata = Object.values(all || {});
      const groups = metadata.map(group => ({
        jid: group.id,
        subject: group.subject || 'Grupo do WhatsApp',
        participantCount: Array.isArray(group.participants) ? group.participants.length : 0,
        avatarUrl: null
      }));
      const accountInfo = {
        id: account.id,
        departmentId: account.departmentId,
        departmentName: account.departmentName,
        fallbackDepartmentId: account.fallbackDepartmentId,
        fallbackDepartmentName: account.fallbackDepartmentName
      };
      const synced = await ticketService.syncWhatsAppGroups(accountInfo, groups, this.io);
      // Atualiza fotos em segundo plano de forma escalonada (sem travar o servidor)
      setTimeout(() => {
        this.refreshAccountAvatars(account).catch(error => console.warn(`[WhatsApp:${account.name}] falha ao atualizar fotos: ${error.message}`));
      }, 2000);
      return synced;
    } catch (err) {
      console.warn(`[WhatsApp:${account.name}] falha ao sincronizar grupos:`, err.message);
      return [];
    }
  }

  async refreshAccountAvatars(account) {
    if (!account?.sock || account.status !== 'connected') return;
    const targets = await ticketService.getWhatsAppAvatarTargets(account.id);
    for (let offset = 0; offset < targets.length; offset += 3) {
      if (account.status !== 'connected') break;
      await Promise.all(targets.slice(offset, offset + 3).map(async target => {
        const jid = target.group_jid || (target.phone ? `${String(target.phone).replace(/\D/g, '')}@s.whatsapp.net` : null) || target.jid || target.raw_jid;
        const url = await this.profilePictureUrl(account, jid);
        if (url) await ticketService.updateTicketAvatar(target.id, url, this.io);
      }));
      // Pausa de 200ms entre blocos para não saturar a rede e liberar o garbage collector
      await new Promise(r => setTimeout(r, 200));
    }
  }

  async refreshTicketAvatar(account, ticket, jid) {
    if (!ticket?.id || !jid) return false;
    const url = await this.profilePictureUrl(account, jid);
    return url ? ticketService.updateTicketAvatar(ticket.id, url, this.io) : false;
  }

  async processGroupMessage(account, msg, downloadMediaMessage, downloadContentFromMessage) {
    const groupJid = msg.key.remoteJid;
    const metadata = await this.groupMetadata(account, groupJid).catch(() => ({ id: groupJid, subject: 'Grupo do WhatsApp' }));
    const content = unwrapMessageContent(msg.message);
    if (content.reactionMessage) return { type: 'group_reaction_ignored' };
    const media = await this.downloadMedia(account, msg, downloadMediaMessage, downloadContentFromMessage);
    const text = content.conversation || content.extendedTextMessage?.text ||
      content.imageMessage?.caption || content.videoMessage?.caption ||
      content.documentMessage?.caption || media.fallbackText || '';
    if (!text && !media.type) return { type: 'ignored_group_protocol_message' };
    const participantJid = msg.key.participant || msg.participant || null;
    const result = await ticketService.processWhatsAppGroupMessage({
      groupJid,
      groupName: metadata.subject,
      participantCount: Array.isArray(metadata.participants) ? metadata.participants.length : 0,
      avatarUrl: await this.profilePictureUrl(account, groupJid),
      participantJid,
      senderName: msg.pushName || (participantJid ? participantJid.replace(/@.*$/, '') : null),
      fromMe: Boolean(msg.key.fromMe),
      text,
      mediaType: media.type,
      mediaUrl: media.url,
      fileName: media.fileName,
      fileSize: media.fileSize,
      timestamp: msg.messageTimestamp,
      messageId: msg.key.id,
      whatsappAccountId: account.id,
      whatsappAccountName: account.name,
      whatsappDepartmentId: account.departmentId,
      whatsappDepartmentName: account.departmentName,
      whatsappFallbackDepartmentId: account.fallbackDepartmentId,
      whatsappFallbackDepartmentName: account.fallbackDepartmentName
    }, this.io);
    if (media.type && !media.url && result?.ticket?.id) {
      this.retryMissingMedia(account, msg, downloadMediaMessage, downloadContentFromMessage, result.ticket.id).catch(() => {});
    }
    return result;
  }

  bindCalls(account) {
    account.sock.ev.on('call', calls => {
      for (const rawCall of calls || []) {
        const call = normalizeCallEvent(rawCall);
        if (!call.from || call.isGroup) continue;
        this.messageQueue.enqueue(`${account.id}:call:${call.from}`, async () => {
          const phone = await this.extractPhone(account, call.from);
          return ticketService.processWhatsAppCall({
            ...call,
            phone,
            whatsappAccountId: account.id,
            whatsappAccountName: account.name,
            whatsappDepartmentId: account.departmentId || account.fallbackDepartmentId || null
          }, this.io);
        }).catch(error => console.warn(`[WhatsApp:${account.name}] falha ao identificar chamada: ${error.message}`));
      }
    });
  }

  rememberPlatformMessage(accountId, messageId) {
    if (!accountId || !messageId) return;
    const now = Date.now();
    this.platformMessageIds.set(`${accountId}:${messageId}`, now);
    if (this.platformMessageIds.size <= 3000) return;
    const expiration = now - (60 * 60 * 1000);
    for (const [key, timestamp] of this.platformMessageIds) {
      if (timestamp < expiration || this.platformMessageIds.size > 2500) this.platformMessageIds.delete(key);
      if (this.platformMessageIds.size <= 2500) break;
    }
  }

  rememberMessageId(messageKey) {
    const now = Date.now();
    this.recentMessageIds.set(messageKey, now);
    if (this.recentMessageIds.size <= 8000) return;
    const expiration = now - (6 * 60 * 60 * 1000);
    for (const [key, timestamp] of this.recentMessageIds) {
      if (timestamp < expiration || this.recentMessageIds.size > 7000) this.recentMessageIds.delete(key);
      if (this.recentMessageIds.size <= 7000) break;
    }
  }

  async processIncomingMessage(account, msg, downloadMediaMessage, downloadContentFromMessage) {
    const rawJid = msg.key.remoteJid;
    const phone = await this.extractPhone(account, rawJid, msg);
    const content = unwrapMessageContent(msg.message);
    if (content.reactionMessage) {
      const reaction = content.reactionMessage;
      return ticketService.processWhatsAppReaction({
        from: rawJid,
        rawJid,
        phone,
        sender: 'client',
        senderName: msg.pushName || null,
        emoji: reaction.text || '',
        targetMessageId: reaction.key?.id || null,
        targetPreview: messageContentPreview(getCachedRetryMessage(account, reaction.key)),
        timestamp: msg.messageTimestamp,
        messageId: msg.key.id,
        whatsappAccountId: account.id
      }, this.io);
    }
    const media = await this.downloadMedia(account, msg, downloadMediaMessage, downloadContentFromMessage);
    const text = content.conversation || content.extendedTextMessage?.text ||
      content.imageMessage?.caption || content.videoMessage?.caption ||
      content.documentMessage?.caption || media.fallbackText || '';
    const senderName = msg.pushName || null;
    console.log(`[WhatsApp:${account.name}] mensagem recebida de ${senderName || `Cliente ${phone.slice(-4)}`}.`);

    const scopedSender = {
      sendMessage: (target, body) => this.sendMessage(target, body, account.id),
      sendMediaMessage: (target, buffer, type, caption, fileName) => this.sendMediaMessage(target, buffer, type, caption, fileName, account.id)
    };
    const result = await ticketService.processIncomingMessage({
      from: rawJid,
      rawJid,
      phone,
      senderName,
      text,
      mediaType: media.type,
      mediaUrl: media.url,
      fileName: media.fileName,
      fileSize: media.fileSize,
      timestamp: msg.messageTimestamp,
      messageId: msg.key.id,
      whatsappAccountId: account.id,
      whatsappRoutingMode: account.routingMode,
      whatsappDepartmentId: account.departmentId,
      whatsappDepartmentName: account.departmentName,
      whatsappFallbackDepartmentId: account.fallbackDepartmentId,
      whatsappFallbackDepartmentName: account.fallbackDepartmentName
    }, this.io, scopedSender);
    this.refreshTicketAvatar(account, result?.ticket, phone ? `${phone}@s.whatsapp.net` : rawJid).catch(() => {});
    if (media.type && !media.url && result?.ticket?.id) {
      this.retryMissingMedia(account, msg, downloadMediaMessage, downloadContentFromMessage, result.ticket.id).catch(error => {
        console.warn(`[WhatsApp:${account.name}] mídia permaneceu indisponível após novas tentativas: ${error.message}`);
      });
    }
    return result;
  }

  async processExternalOutgoingMessage(account, msg, downloadMediaMessage, downloadContentFromMessage) {
    const rawJid = msg.key.remoteJid;
    const phone = await this.extractPhone(account, rawJid, msg);
    const content = unwrapMessageContent(msg.message);
    if (content.reactionMessage) {
      const reaction = content.reactionMessage;
      return ticketService.processWhatsAppReaction({
        from: rawJid,
        rawJid,
        phone,
        sender: 'agent',
        senderName: `WhatsApp (${account.name})`,
        emoji: reaction.text || '',
        targetMessageId: reaction.key?.id || null,
        targetPreview: messageContentPreview(getCachedRetryMessage(account, reaction.key)),
        timestamp: msg.messageTimestamp,
        messageId: msg.key.id,
        whatsappAccountId: account.id
      }, this.io);
    }
    const media = await this.downloadMedia(account, msg, downloadMediaMessage, downloadContentFromMessage);
    const text = content.conversation || content.extendedTextMessage?.text ||
      content.imageMessage?.caption || content.videoMessage?.caption ||
      content.documentMessage?.caption || media.fallbackText || '';
    if (!text && !media.type) return { type: 'ignored_outgoing_protocol_message' };

    console.log(`[WhatsApp:${account.name}] resposta enviada diretamente pelo WhatsApp para ${phone}.`);
    const result = await ticketService.processExternalWhatsAppMessage({
      from: rawJid,
      rawJid,
      phone,
      text,
      mediaType: media.type,
      mediaUrl: media.url,
      fileName: media.fileName,
      fileSize: media.fileSize,
      timestamp: msg.messageTimestamp,
      messageId: msg.key.id,
      whatsappAccountId: account.id,
      whatsappAccountName: account.name,
      whatsappRoutingMode: account.routingMode,
      whatsappDepartmentId: account.departmentId,
      whatsappDepartmentName: account.departmentName,
      whatsappFallbackDepartmentId: account.fallbackDepartmentId,
      whatsappFallbackDepartmentName: account.fallbackDepartmentName
    }, this.io, this);
    this.refreshTicketAvatar(account, result?.ticket, phone ? `${phone}@s.whatsapp.net` : rawJid).catch(() => {});
    if (media.type && !media.url && result?.ticket?.id) {
      this.retryMissingMedia(account, msg, downloadMediaMessage, downloadContentFromMessage, result.ticket.id).catch(error => {
        console.warn(`[WhatsApp:${account.name}] mídia enviada pelo dispositivo permaneceu indisponível: ${error.message}`);
      });
    }
    return result;
  }

  async retryMissingMedia(account, msg, downloadMediaMessage, downloadContentFromMessage, ticketId) {
    for (const delay of [1000, 2500, 5000, 10000]) {
      await new Promise(resolve => setTimeout(resolve, delay));
      if (!account.sock || account.status !== 'connected') throw new Error('Conta desconectada durante a recuperação da mídia.');
      const recovered = await this.downloadMedia(account, msg, downloadMediaMessage, downloadContentFromMessage);
      if (!recovered.url) continue;
      await ticketService.attachIncomingMedia({
        ticketId,
        messageId: msg.key.id,
        whatsappAccountId: account.id,
        mediaType: recovered.type,
        mediaUrl: recovered.url,
        fileName: recovered.fileName,
        fileSize: recovered.fileSize
      }, this.io);
      console.log(`[WhatsApp:${account.name}] mídia recuperada em segundo plano (${msg.key.id}).`);
      return true;
    }
    throw new Error('O WhatsApp não disponibilizou uma nova cópia do arquivo.');
  }

  async downloadMedia(account, msg, downloadMediaMessage, downloadContentFromMessage) {
    const content = unwrapMessageContent(msg.message);
    let type = null;
    let fileName = null;
    let fallbackText = '';
    let mediaMessage = null;
    const messageToken = safeFileToken(msg.key.id);
    if (content.imageMessage) {
      type = 'image';
      mediaMessage = content.imageMessage;
      const extension = mediaMessage.mimetype === 'image/png' ? 'png' : mediaMessage.mimetype === 'image/webp' ? 'webp' : 'jpg';
      fileName = `img_${Date.now()}_${messageToken}.${extension}`;
      fallbackText = '📷 [Imagem]';
    } else if (content.audioMessage) {
      type = 'audio';
      mediaMessage = content.audioMessage;
      const extension = mediaMessage.mimetype?.includes('mpeg') ? 'mp3' : mediaMessage.mimetype?.includes('mp4') ? 'm4a' : 'ogg';
      fileName = `audio_${Date.now()}_${messageToken}.${extension}`;
      fallbackText = mediaMessage.ptt ? '🎙️ [Mensagem de Voz]' : '🎵 [Áudio]';
    } else if (content.videoMessage) {
      type = 'video';
      mediaMessage = content.videoMessage;
      fileName = `video_${Date.now()}_${messageToken}.mp4`;
      fallbackText = '🎥 [Vídeo]';
    } else if (content.documentMessage) {
      type = 'document';
      mediaMessage = content.documentMessage;
      const original = (mediaMessage.fileName || 'documento').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      fileName = `doc_${Date.now()}_${original}`;
      fallbackText = `📄 [Documento: ${original}]`;
    } else if (content.stickerMessage) {
      type = 'sticker';
      mediaMessage = content.stickerMessage;
      fileName = `sticker_${Date.now()}_${messageToken}.webp`;
      fallbackText = '🖼️ [Figurinha]';
    }
    if (!type) return { type: null, fileName: null, url: null, fallbackText: '', fileSize: 0 };

    const declaredSize = mediaSizeBytes(mediaMessage?.fileLength);
    if (declaredSize > this.maxMediaBytes) {
      const limitMb = Math.round(this.maxMediaBytes / (1024 * 1024));
      return { type, fileName, url: null, fallbackText: `⚠️ [Mídia acima do limite de ${limitMb} MB]`, fileSize: declaredSize };
    }

    try {
      const mediaOptions = {
        logger: pino({ level: 'silent' }),
        reuploadRequest: account.sock.updateMediaMessage
      };
      let downloaded = null;
      try {
        downloaded = await downloadMediaMessage(msg, 'stream', { proxy: false }, mediaOptions);
      } catch (primaryError) {
        try {
          const refreshedMessage = await account.sock.updateMediaMessage(msg);
          downloaded = await downloadMediaMessage(refreshedMessage, 'stream', { proxy: false }, mediaOptions);
        } catch (refreshError) {
          if (typeof downloadContentFromMessage !== 'function') throw primaryError;
          const refreshedContent = unwrapMessageContent(msg.message);
          const refreshedMedia = refreshedContent[`${type}Message`] || mediaMessage;
          downloaded = await downloadContentFromMessage(refreshedMedia, type, { proxy: false });
        }
      }
      const bounded = await readBoundedMedia(downloaded, this.maxMediaBytes);
      if (bounded.overflow) {
        const limitMb = Math.round(this.maxMediaBytes / (1024 * 1024));
        return { type, fileName, url: null, fallbackText: `⚠️ [Mídia acima do limite de ${limitMb} MB]`, fileSize: bounded.size };
      }
      const buffer = bounded.buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('O WhatsApp retornou um arquivo vazio.');
      await fs.promises.mkdir(MEDIA_DIR, { recursive: true });
      await Promise.all([
        fs.promises.writeFile(path.join(MEDIA_DIR, fileName), buffer),
        cloudStorage.uploadMedia(fileName, buffer, mediaMessage?.mimetype || 'application/octet-stream')
          .catch(error => console.warn(`[WhatsApp:${account.name}] mídia salva apenas localmente: ${error.message}`))
      ]);
      return { type, fileName, url: `/api/media/${fileName}`, fallbackText, fileSize: buffer.length };
    } catch (error) {
      console.warn(`[WhatsApp:${account.name}] falha ao baixar mídia: ${error.message}`);
      return { type, fileName, url: null, fallbackText, fileSize: 0 };
    }
  }

  startMediaCleanup() {
    if (this.mediaCleanupTimer || this.mediaRetentionDays <= 0) return;
    this.cleanupExpiredMedia().catch(error => console.warn(`Falha na limpeza de mídias: ${error.message}`));
    this.mediaCleanupTimer = setInterval(() => {
      this.cleanupExpiredMedia().catch(error => console.warn(`Falha na limpeza de mídias: ${error.message}`));
    }, this.mediaCleanupHours * 60 * 60 * 1000);
    this.mediaCleanupTimer.unref?.();
  }

  startExternalTicketCleanup() {
    if (this.externalTicketCleanupTimer) return;
    const runCleanup = async () => {
      if (this.externalTicketCleanupRunning) return;
      this.externalTicketCleanupRunning = true;
      try {
        const closed = await ticketService.closeInactiveExternalTickets(this.io, this);
        if (closed > 0) console.log(`🕒 ${closed} atendimento(s) pelo WhatsApp encerrado(s) por inatividade.`);
      } catch (error) {
        console.warn(`Falha na rotina de encerramento por inatividade: ${error.message}`);
      } finally {
        this.externalTicketCleanupRunning = false;
      }
    };
    this.externalTicketCleanupTimer = setInterval(runCleanup, 60 * 1000);
    this.externalTicketCleanupTimer.unref?.();
    setTimeout(runCleanup, 5000).unref?.();
  }

  async cleanupExpiredMedia() {
    let entries = [];
    try {
      entries = await fs.promises.readdir(MEDIA_DIR, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') entries = [];
      else throw error;
    }
    const cutoff = Date.now() - (this.mediaRetentionDays * 24 * 60 * 60 * 1000);
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absolutePath = path.join(MEDIA_DIR, entry.name);
      const stats = await fs.promises.stat(absolutePath);
      if (stats.mtimeMs >= cutoff) continue;
      await fs.promises.unlink(absolutePath);
      removed += 1;
    }
    removed += await cloudStorage.cleanupMediaOlderThan(cutoff).catch(error => {
      console.warn(`Falha ao limpar mídias no Supabase Storage: ${error.message}`);
      return 0;
    });
    if (removed > 0) console.log(`🧹 ${removed} mídia(s) expirada(s) removida(s).`);
    return removed;
  }

  selectAccount(accountId = null) {
    if (accountId) return this.accounts.get(accountId) || null;
    return [...this.accounts.values()].find(account => account.status === 'connected') || null;
  }

  async sendMessage(target, text, accountId = null, options = {}) {
    const account = this.selectAccount(accountId);
    if (!account?.sock || account.status !== 'connected') {
      console.warn(`[WhatsApp:${accountId || 'automático'}] conta não conectada; mensagem não enviada.`);
      return false;
    }
    let jid = target;
    if (!jid.includes('@')) jid = `${target.replace(/\D/g, '')}@s.whatsapp.net`;
    jid = await resolveJid(jid, account);
    try {
      const quotedId = String(options?.quotedMessage?.remoteMessageId || '').trim();
      const quoted = quotedId ? {
        key: {
          remoteJid: jid,
          fromMe: options.quotedMessage.sender === 'agent',
          id: quotedId,
          ...(options.quotedMessage.participantJid ? { participant: options.quotedMessage.participantJid } : {})
        },
        message: { conversation: String(options.quotedMessage.text || 'Mensagem') }
      } : undefined;
      const result = await account.sock.sendMessage(jid, { text }, quoted ? { quoted } : undefined);
      if (result?.key?.id && result?.message) cacheRetryMessage(account, result.key, result.message);
      this.rememberPlatformMessage(account.id, result?.key?.id);
      console.log(`[WhatsApp:${account.name}] mensagem enviada para ${getPhoneFromJid(jid, account.lidMap)} (${jid}).`);
      return result || true;
    } catch (error) {
      console.error(`[WhatsApp:${account.name}] falha no envio: ${error.message}`);
      return false;
    }
  }

  async editMessage(target, remoteMessageId, text, accountId = null) {
    const account = this.selectAccount(accountId);
    if (!account?.sock || account.status !== 'connected') throw new Error('WhatsApp desconectado. Não foi possível editar a mensagem.');
    let jid = target.includes('@') ? target : `${target.replace(/\D/g, '')}@s.whatsapp.net`;
    // A chave de uma mensagem enviada pelo aparelho precisa conservar o JID
    // exato recebido no evento (inclusive LID), senão o WhatsApp não a encontra.
    jid = jid.replace(/:\d+@/, '@').replace(/:\d+$/, '');
    const key = { remoteJid: jid, fromMe: true, id: remoteMessageId };
    const result = await account.sock.sendMessage(jid, { text, edit: key });
    if (result?.key?.id) this.rememberPlatformMessage(account.id, result.key.id);
    return result;
  }

  async deleteMessage(target, remoteMessageId, accountId = null) {
    const account = this.selectAccount(accountId);
    if (!account?.sock || account.status !== 'connected') throw new Error('WhatsApp desconectado. Não foi possível excluir a mensagem.');
    let jid = target.includes('@') ? target : `${target.replace(/\D/g, '')}@s.whatsapp.net`;
    jid = jid.replace(/:\d+@/, '@').replace(/:\d+$/, '');
    const key = { remoteJid: jid, fromMe: true, id: remoteMessageId };
    const result = await account.sock.sendMessage(jid, { delete: key });
    if (result?.key?.id) this.rememberPlatformMessage(account.id, result.key.id);
    return result;
  }

  async sendMediaMessage(target, fileBuffer, mediaType, caption, fileName, accountId = null, mimeType = null, voiceNote = false) {
    const account = this.selectAccount(accountId);
    if (!account?.sock || account.status !== 'connected') return false;
    let jid = target.includes('@') ? target : `${target.replace(/\D/g, '')}@s.whatsapp.net`;
    jid = await resolveJid(jid, account);
    const payloads = {
      image: { image: fileBuffer, caption: caption || '' },
      audio: buildAudioPayload(fileBuffer, mimeType, voiceNote),
      video: { video: fileBuffer, mimetype: mimeType || 'video/mp4', caption: caption || '' },
      document: { document: fileBuffer, mimetype: mimeType || 'application/octet-stream', fileName: fileName || 'documento', caption: caption || '' }
    };
    try {
      const result = await account.sock.sendMessage(jid, payloads[mediaType]);
      if (result?.key?.id && result?.message) cacheRetryMessage(account, result.key, result.message);
      this.rememberPlatformMessage(account.id, result?.key?.id);
      if (mediaType === 'audio') {
        console.log(`[WhatsApp:${account.name}] áudio enviado (${payloads.audio.mimetype}, ptt=${payloads.audio.ptt}, id=${result?.key?.id || 'n/d'}).`);
      }
      return result || true;
    }
    catch (error) { console.error(`[WhatsApp:${account.name}] falha ao enviar mídia: ${error.message}`); return false; }
  }

  async disconnect(accountId) {
    const account = this.accounts.get(safeAccountId(accountId));
    if (!account) throw new Error('Conta do WhatsApp não encontrada.');
    account.manualDisconnect = true;
    clearTimeout(account.reconnectTimer);
    try { if (account.sock) await account.sock.logout(); } catch {}
    try { if (account.sock) { account.sock.ev.removeAllListeners(); account.sock.end(); } } catch {}
    account.sock = null;
    account.status = 'disconnected';
    account.lastDisconnectedAt = new Date().toISOString();
    account.disconnectReason = 'manual_disconnect';
    account.reconnectAttempts = 0;
    account.nextReconnectAt = null;
    account.qrCode = null;
    account.phone = null;
    account.displayName = null;
    fs.rmSync(path.join(ACCOUNTS_ROOT, account.id), { recursive: true, force: true });
    await cloudStorage.deleteSession(account.id).catch(error => console.warn(`[WhatsApp:${account.name}] falha ao remover sessão da nuvem: ${error.message}`));
    await this.saveConfigs();
    this.emitAccounts();
    await ticketService.handleAccountDisconnected(account.id, 'manual_disconnect', this.io).catch(error => {
      console.error(`[WhatsApp:${account.name}] falha ao processar encerramento de atendimentos na desconexão manual:`, error.message);
    });
  }

  async removeAccount(accountId) {
    await this.disconnect(accountId);
    this.accounts.delete(safeAccountId(accountId));
    await this.saveConfigs();
    this.emitAccounts();
  }

  publicAccount(account, includeQr = false) {
    return {
      id: account.id,
      name: account.name,
      status: account.status,
      phone: account.phone,
      displayName: account.displayName,
      routingMode: account.routingMode,
      departmentId: account.departmentId,
      departmentName: account.departmentName,
      fallbackDepartmentId: account.fallbackDepartmentId,
      fallbackDepartmentName: account.fallbackDepartmentName,
      lastConnectedAt: account.lastConnectedAt,
      lastDisconnectedAt: account.lastDisconnectedAt,
      disconnectReason: account.disconnectReason,
      reconnectAttempts: account.reconnectAttempts,
      nextReconnectAt: account.nextReconnectAt,
      createdAt: account.createdAt,
      ...(includeQr ? { qrCode: account.qrCode } : {})
    };
  }

  getAccounts(includeQr = false) {
    return [...this.accounts.values()].map(account => this.publicAccount(account, includeQr));
  }

  getStatus() {
    const accounts = this.getAccounts(true);
    return { status: accounts.some(a => a.status === 'connected') ? 'connected' : accounts.some(a => a.status === 'scan_qr') ? 'scan_qr' : 'disconnected', accounts };
  }

  async closeAllSockets(reason = 'shutdown') {
    console.log(`Fechando conexões do WhatsApp de forma limpa (${reason})...`);
    for (const account of this.accounts.values()) {
      account.isShuttingDown = true;
      clearTimeout(account.reconnectTimer);
      if (account.sock) {
        try {
          account.sock.end(new Error(`Server shutdown: ${reason}`));
        } catch (_) {}
        account.sock = null;
      }
    }
  }

  getPublicStatus() {
    const accounts = this.getAccounts(false);
    return { status: accounts.some(a => a.status === 'connected') ? 'connected' : 'disconnected', connectedCount: accounts.filter(a => a.status === 'connected').length };
  }

  getStatusForUser(user) {
    if (!user) return this.getPublicStatus();
    if (user.role === 'Administrador') return this.getStatus();

    const userDepts = new Set([
      ...(Array.isArray(user.department_ids) ? user.department_ids : []),
      user.department_id
    ].filter(Boolean).map(String));

    const includeQr = user.role === 'Supervisor';
    const accounts = this.getAccounts(includeQr).filter(acc => {
      const accDept = acc.departmentId ? String(acc.departmentId) : null;
      const fallbackDept = acc.fallbackDepartmentId ? String(acc.fallbackDepartmentId) : null;
      return (accDept && userDepts.has(accDept)) || (fallbackDept && userDepts.has(fallbackDept));
    });

    return {
      ...this.getPublicStatus(),
      accounts
    };
  }

  emitAccounts() {
    if (!this.io) return;
    const allAccountsWithQr = this.getAccounts(true);
    const allAccounts = this.getAccounts(false);
    // Administradores recebem todas as contas com QR
    this.io.to('admins').emit('whatsapp_accounts_updated', { accounts: allAccountsWithQr });

    // O departamento recebe o status, sem o QR de pareamento.
    const deptMap = new Map();
    for (const account of allAccounts) {
      const depts = new Set([account.departmentId, account.fallbackDepartmentId].filter(Boolean).map(String));
      for (const deptId of depts) {
        if (!deptMap.has(deptId)) deptMap.set(deptId, []);
        deptMap.get(deptId).push(account);
      }
    }
    for (const [deptId, deptAccounts] of deptMap.entries()) {
      this.io.to(`department:${deptId}`).emit('whatsapp_accounts_updated', { accounts: deptAccounts });
    }

    this.io.emit('whatsapp_status', this.getPublicStatus());
  }
}

const whatsappService = new WhatsAppService();
whatsappService._test = {
  unwrapMessageContent,
  safeFileToken,
  normalizeAccountRouting,
  normalizeCallEvent,
  applyAccountRoutingWithPersistence,
  getPhoneFromJid,
  phoneJidFromMessageMetadata,
  resolveJid,
    reconnectDelay,
  scheduleSessionBackup,
  loadRetryMessageCache,
  ExpiringCache,
  messageCacheKey,
  messageIdCacheKey,
  cacheRetryMessage,
  getCachedRetryMessage,
  messageContentPreview,
  EMIT_OWN_EVENTS,
  MARK_ONLINE_ON_CONNECT
};

module.exports = whatsappService;
