const { supabase, isSupabaseConfigured } = require('../config/supabase');

function isAdmin(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  return role === 'administrador' || role === 'admin';
}

function isSupervisor(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  return role === 'supervisor';
}

function normalizeIds(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function departmentIds(user) {
  if (!user) return [];
  return normalizeIds([...(Array.isArray(user.department_ids) ? user.department_ids : []), user.department_id]);
}

function canAccessDepartment(user, departmentId) {
  if (isAdmin(user)) return true;
  return departmentIds(user).includes(String(departmentId || ''));
}

async function loadSupervisorDepartments(userId, primaryDepartmentId = null) {
  const fallback = normalizeIds([primaryDepartmentId]);
  if (!userId || !isSupabaseConfigured()) return fallback;
  const { data, error } = await supabase
    .from('supervisor_departments')
    .select('department_id, departments(id, name, color)')
    .eq('user_id', userId);
  if (error) {
    if (/supervisor_departments|schema cache|does not exist/i.test(error.message || '')) return fallback;
    throw error;
  }
  return normalizeIds([primaryDepartmentId, ...(data || []).map(item => item.department_id)]);
}

async function enrichUserAccess(user) {
  if (!user) return user;
  if (isAdmin(user)) return { ...user, department_ids: [] };
  if (!isSupervisor(user)) return { ...user, department_ids: normalizeIds([user.department_id]) };
  return { ...user, department_ids: await loadSupervisorDepartments(user.id, user.department_id) };
}

async function replaceSupervisorDepartments(userId, ids = []) {
  const values = normalizeIds(ids);
  const { error: deleteError } = await supabase.from('supervisor_departments').delete().eq('user_id', userId);
  if (deleteError) throw deleteError;
  if (!values.length) return [];
  const { error } = await supabase.from('supervisor_departments').insert(values.map(department_id => ({ user_id: userId, department_id })));
  if (error) throw error;
  return values;
}

module.exports = {
  isAdmin,
  isSupervisor,
  departmentIds,
  canAccessDepartment,
  loadSupervisorDepartments,
  enrichUserAccess,
  replaceSupervisorDepartments
};
