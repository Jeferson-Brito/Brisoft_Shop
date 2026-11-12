const crypto = require('crypto');
const { supabase, isSupabaseConfigured } = require('../config/supabase');

const SETTINGS_KEY = 'user_notes';
let memoryNotes = [];

function isAdmin(user) {
  if (!user) return false;
  return (
    user.role === 'Administrador' ||
    user.role === 'admin' ||
    user.is_admin === true ||
    user.role === 'supervisor' ||
    user.role === 'Supervisor'
  );
}

function normalizeNote(value = {}, user = null) {
  return {
    id: String(value.id || crypto.randomUUID()),
    title: String(value.title || 'Sem título').trim().slice(0, 150) || 'Sem título',
    content: String(value.content || '').slice(0, 50000),
    user_id: String(value.user_id || user?.id || ''),
    user_name: String(value.user_name || user?.name || 'Usuário').trim().slice(0, 120),
    created_at: value.created_at || new Date().toISOString(),
    updated_at: value.updated_at || new Date().toISOString()
  };
}

async function loadAllNotes() {
  if (!isSupabaseConfigured()) {
    return memoryNotes.map(n => normalizeNote(n));
  }
  const { data, error } = await supabase.from('system_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  if (error) throw error;
  if (!Array.isArray(data?.value)) return [];
  return data.value.map(n => normalizeNote(n));
}

async function saveAllNotes(notes) {
  const value = notes.map(n => normalizeNote(n)).slice(0, 2000);
  if (!isSupabaseConfigured()) {
    memoryNotes = value;
    return value;
  }
  const { error } = await supabase.from('system_settings').upsert({ key: SETTINGS_KEY, value, updated_at: new Date() }, { onConflict: 'key' });
  if (error) throw error;
  return value;
}

async function list(user, targetUserId = null) {
  const allNotes = await loadAllNotes();
  if (isAdmin(user)) {
    if (targetUserId && targetUserId !== 'all') {
      return allNotes.filter(n => String(n.user_id) === String(targetUserId));
    }
    return allNotes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
  // Usuário comum só visualiza as próprias anotações
  return allNotes
    .filter(n => String(n.user_id) === String(user?.id))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

async function save(input, user) {
  if (!user?.id) throw new Error('Usuário não autenticado.');
  const allNotes = await loadAllNotes();
  const noteId = input.id ? String(input.id) : null;
  const existingIndex = noteId ? allNotes.findIndex(n => n.id === noteId) : -1;

  if (existingIndex >= 0) {
    const existing = allNotes[existingIndex];
    if (!isAdmin(user) && String(existing.user_id) !== String(user.id)) {
      throw new Error('Permissão negada: você não pode editar esta anotação.');
    }
    const updated = normalizeNote({
      ...existing,
      title: input.title !== undefined ? input.title : existing.title,
      content: input.content !== undefined ? input.content : existing.content,
      updated_at: new Date().toISOString()
    }, user);
    allNotes[existingIndex] = updated;
    await saveAllNotes(allNotes);
    return updated;
  } else {
    const created = normalizeNote({
      ...input,
      id: crypto.randomUUID(),
      user_id: user.id,
      user_name: user.name || 'Usuário',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, user);
    allNotes.unshift(created);
    await saveAllNotes(allNotes);
    return created;
  }
}

async function remove(id, user) {
  if (!user?.id) throw new Error('Usuário não autenticado.');
  const allNotes = await loadAllNotes();
  const existing = allNotes.find(n => n.id === id);
  if (!existing) throw new Error('Anotação não encontrada.');

  if (!isAdmin(user) && String(existing.user_id) !== String(user.id)) {
    throw new Error('Permissão negada: você não pode excluir esta anotação.');
  }

  const filtered = allNotes.filter(n => n.id !== id);
  await saveAllNotes(filtered);
  return { success: true };
}

module.exports = { list, save, remove, normalizeNote, isAdmin };
