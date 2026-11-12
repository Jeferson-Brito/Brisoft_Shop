const crypto = require('crypto');
const { supabase, isSupabaseConfigured } = require('../config/supabase');

const SETTINGS_KEY = 'quick_messages';
const DEFAULT_MESSAGES = [
  { id: 'default-greeting', title: 'Saudação', category: 'Atendimento', content: 'Olá! Como posso ajudar você hoje?', shortcut: 'saudacao', is_active: true },
  { id: 'default-wait', title: 'Aguarde um momento', category: 'Atendimento', content: 'Aguarde um momento, por favor. Estou verificando essa informação para você.', shortcut: 'aguarde', is_active: true },
  { id: 'default-closing', title: 'Encerramento', category: 'Atendimento', content: 'Posso ajudar em mais alguma coisa?', shortcut: 'encerramento', is_active: true }
];

function normalizeMessage(value = {}) {
  const scope = value.scope === 'department' ? 'department' : 'global';
  return {
    id: String(value.id || crypto.randomUUID()),
    title: String(value.title || '').trim().slice(0, 120),
    category: String(value.category || 'Geral').trim().slice(0, 80),
    content: String(value.content || '').trim().slice(0, 4000),
    shortcut: String(value.shortcut || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 50),
    scope,
    department_id: scope === 'department' && value.department_id ? String(value.department_id) : null,
    department_name: scope === 'department' && value.department_name ? String(value.department_name).trim().slice(0, 100) : null,
    is_active: value.is_active !== false,
    created_by_id: value.created_by_id || null,
    created_by_name: String(value.created_by_name || 'Sistema').trim().slice(0, 255),
    created_at: value.created_at || null,
    updated_by_name: value.updated_by_name ? String(value.updated_by_name).trim().slice(0, 255) : null,
    updated_at: value.updated_at || null
  };
}

async function loadAll() {
  if (!isSupabaseConfigured()) return DEFAULT_MESSAGES.map(item => ({ ...item, scope: 'global' }));
  const { data, error } = await supabase.from('system_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  if (error) throw error;
  if (!Array.isArray(data?.value)) return DEFAULT_MESSAGES.map(item => ({ ...item, scope: 'global' }));
  return data.value.map(normalizeMessage).filter(item => item.title && item.content);
}

async function saveAll(messages) {
  const value = messages.map(normalizeMessage).filter(item => item.title && item.content).slice(0, 500);
  const { error } = await supabase.from('system_settings').upsert({ key: SETTINGS_KEY, value, updated_at: new Date() }, { onConflict: 'key' });
  if (error) throw error;
  return value;
}

async function list(user = null, activeOnly = true) {
  const messages = await loadAll();
  let filtered = activeOnly ? messages.filter(item => item.is_active) : messages;

  if (user && user.role !== 'Administrador') {
    const userDepts = new Set([
      ...(Array.isArray(user.department_ids) ? user.department_ids : []),
      user.department_id
    ].filter(Boolean).map(String));

    filtered = filtered.filter(item => {
      if (!item.department_id || item.scope === 'global') return true;
      return userDepts.has(String(item.department_id));
    });
  }

  return filtered;
}

async function create(input, user) {
  const scope = input.scope === 'department' ? 'department' : 'global';
  let department_id = scope === 'department' ? (input.department_id || null) : null;
  let department_name = scope === 'department' ? (input.department_name || null) : null;

  if (user && user.role !== 'Administrador' && scope === 'department') {
    const userDepts = [
      ...(Array.isArray(user.department_ids) ? user.department_ids : []),
      user.department_id
    ].filter(Boolean).map(String);

    if (department_id && !userDepts.includes(String(department_id))) {
      throw new Error('Você só pode vincular mensagens rápidas ao seu próprio departamento.');
    }
    if (!department_id) {
      department_id = user.department_id ? String(user.department_id) : null;
      department_name = user.department_name || null;
    }
  }

  const item = normalizeMessage({
    ...input,
    scope,
    department_id,
    department_name,
    created_by_id: user?.id || null,
    created_by_name: user?.name || 'Sistema',
    created_at: new Date().toISOString()
  });
  if (!item.title || !item.content) throw new Error('Título e mensagem são obrigatórios.');
  const messages = await loadAll();
  messages.push(item);
  await saveAll(messages);
  return item;
}

async function update(id, input, user) {
  const messages = await loadAll();
  const index = messages.findIndex(item => item.id === id);
  if (index < 0) throw new Error('Mensagem rápida não encontrada.');
  const existing = messages[index];

  if (user && user.role !== 'Administrador') {
    if (String(existing.created_by_id || '') !== String(user.id || '')) {
      throw new Error('Você só pode alterar mensagens rápidas criadas por você.');
    }
  }

  const scope = input.scope !== undefined ? (input.scope === 'department' ? 'department' : 'global') : (existing.scope || 'global');
  const department_id = scope === 'department' ? (input.department_id !== undefined ? input.department_id : existing.department_id) : null;
  const department_name = scope === 'department' ? (input.department_name !== undefined ? input.department_name : existing.department_name) : null;

  const item = normalizeMessage({
    ...existing,
    ...input,
    id,
    scope,
    department_id,
    department_name,
    updated_by_name: user?.name || null,
    updated_at: new Date().toISOString()
  });
  if (!item.title || !item.content) throw new Error('Título e mensagem são obrigatórios.');
  messages[index] = item;
  await saveAll(messages);
  return item;
}

async function remove(id, user) {
  const messages = await loadAll();
  const existing = messages.find(item => item.id === id);
  if (!existing) throw new Error('Mensagem rápida não encontrada.');

  if (user && user.role !== 'Administrador') {
    if (String(existing.created_by_id || '') !== String(user.id || '')) {
      throw new Error('Você só pode excluir mensagens rápidas criadas por você.');
    }
  }

  const filtered = messages.filter(item => item.id !== id);
  await saveAll(filtered);
}

module.exports = { list, create, update, remove, normalizeMessage, DEFAULT_MESSAGES };
