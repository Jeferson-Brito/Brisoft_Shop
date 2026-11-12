// ==========================================================================
// BRISOFT SHOP - USER CARGO SERVICE
// Gerencia cargos dos usuários com persistência em system_settings e
// sincronização opcional com a coluna cargo da tabela users se existir.
// ==========================================================================

const { supabase, isSupabaseConfigured } = require('../config/supabase');

const SETTINGS_KEY = 'users_cargo_map';
let _cachedMap = null;
let _cacheExpiresAt = 0;
const CACHE_TTL_MS = 30000; // 30 segundos

async function getCargoMap(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cachedMap && now < _cacheExpiresAt) {
    return _cachedMap;
  }

  if (!isSupabaseConfigured()) {
    if (!_cachedMap) _cachedMap = {};
    return _cachedMap;
  }

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      console.warn('Aviso ao carregar users_cargo_map:', error.message);
      return _cachedMap || {};
    }

    _cachedMap = (data && typeof data.value === 'object' && data.value !== null) ? data.value : {};
    _cacheExpiresAt = now + CACHE_TTL_MS;
    return _cachedMap;
  } catch (err) {
    console.warn('Erro ao obter users_cargo_map:', err.message);
    return _cachedMap || {};
  }
}

async function getUserCargo(userId) {
  if (!userId) return null;
  const map = await getCargoMap();
  return map[String(userId)] || null;
}

async function setUserCargo(userId, cargo) {
  if (!userId) return;
  const cleanCargo = cargo && typeof cargo === 'string' && cargo.trim() ? cargo.trim() : null;
  const map = await getCargoMap(true);
  
  if (cleanCargo) {
    map[String(userId)] = cleanCargo;
  } else {
    delete map[String(userId)];
  }

  _cachedMap = { ...map };
  _cacheExpiresAt = Date.now() + CACHE_TTL_MS;

  if (isSupabaseConfigured()) {
    // 1. Persiste no system_settings
    try {
      await supabase.from('system_settings').upsert({
        key: SETTINGS_KEY,
        value: map,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Erro ao salvar users_cargo_map em system_settings:', err.message);
    }

    // 2. Tenta salvar na tabela users se a coluna existir
    try {
      await supabase.from('users').update({ cargo: cleanCargo }).eq('id', userId);
    } catch (_) {
      // Ignora silenciosamente se coluna cargo não existir no schema do Postgres
    }
  }

  return cleanCargo;
}

async function enrichUserWithCargo(user) {
  if (!user) return user;
  if (user.cargo) return user;
  const cargo = await getUserCargo(user.id);
  user.cargo = cargo || null;
  return user;
}

async function enrichUsersWithCargo(users) {
  if (!Array.isArray(users) || users.length === 0) return users;
  const map = await getCargoMap();
  for (const u of users) {
    if (u && !u.cargo) {
      u.cargo = map[String(u.id)] || null;
    }
  }
  return users;
}

module.exports = {
  getCargoMap,
  getUserCargo,
  setUserCargo,
  enrichUserWithCargo,
  enrichUsersWithCargo
};
