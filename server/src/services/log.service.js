const MAX_LOGS = 1000;
const entries = [];
let installed = false;

function sanitize(value) {
  let text;
  if (value instanceof Error) text = value.stack || value.message;
  else if (typeof value === 'string') text = value;
  else {
    try { text = JSON.stringify(value); }
    catch { text = String(value); }
  }
  return text
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[QR_CODE_REMOVIDO]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [TOKEN_REMOVIDO]')
    .replace(/(SUPABASE_SERVICE_ROLE_KEY|JWT_SECRET|password|senha)["'\s:=]+[^\s,"']+/gi, '$1=[REMOVIDO]')
    .slice(0, 4000);
}

function add(level, args) {
  entries.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    message: args.map(sanitize).join(' ')
  });
  if (entries.length > MAX_LOGS) entries.splice(0, entries.length - MAX_LOGS);
}

function protectConsoleArgs(args) {
  const first = String(args?.[0] || '');
  // A biblioteca Signal pode imprimir toda a sessão criptográfica (incluindo
  // chaves privadas) ao encerrar uma sessão antiga. Nunca exponha isso no log.
  if (/^Closing session:/i.test(first)) return ['🔐 Sessão criptográfica anterior encerrada com segurança.'];
  return args;
}

function installConsoleCapture() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const safeArgs = protectConsoleArgs(args);
      add(level === 'log' ? 'info' : level, safeArgs);
      original(...safeArgs);
    };
  }
  add('info', ['Captura segura de logs iniciada.']);
}

function getLogs(limit = 200, level = null) {
  const safeLimit = Math.min(1000, Math.max(1, Number.parseInt(limit, 10) || 200));
  const filtered = level ? entries.filter(entry => entry.level === level) : entries;
  return filtered.slice(-safeLimit).reverse();
}

function clearLogs() {
  entries.length = 0;
  add('info', ['Logs limpos pelo administrador.']);
}

module.exports = { installConsoleCapture, getLogs, clearLogs };
