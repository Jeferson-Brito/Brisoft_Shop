// ==========================================================================
// BRISOFT SHOP - DEPARTMENT CONTROLLER
// ==========================================================================

const { supabase } = require('../config/supabase');
const ticketService = require('../services/ticket.service');
const { isSupervisor, departmentIds } = require('../services/access-control.service');
const { normalizeBusinessHours } = require('../services/business-hours.service');

function findLinkedWhatsAppAccounts(settingsValue, departmentId, departmentName = '') {
  if (!Array.isArray(settingsValue)) return [];
  const normalizedName = String(departmentName || '').trim().toLocaleLowerCase('pt-BR');
  return settingsValue.filter(account => {
    if (account?.routing_mode !== 'department') return false;
    if (String(account.department_id || '') === String(departmentId || '')) return true;
    return Boolean(normalizedName) && String(account.department_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedName;
  });
}

function isMissingDepartmentOrderColumn(error) {
  return /sort_order|description|allow_device_message_mutations|business_hours|after_hours_message|schema cache|column .* does not exist/i.test(`${error?.message || ''} ${error?.details || ''}`);
}

class DepartmentController {
  
  // Listar todos os departamentos
  async listDepartments(req, res) {
    const defaultDepts = [
      { id: '1', name: 'B3 Eletrônica', color: '#2563eb', sla_target_minutes: 15, sort_order: 1 },
      { id: '2', name: 'Comercial', color: '#10b981', sla_target_minutes: 15, sort_order: 2 },
      { id: '3', name: 'Comercial eletrônica', color: '#06b6d4', sla_target_minutes: 15, sort_order: 3 },
      { id: '4', name: 'Financeiro', color: '#f59e0b', sla_target_minutes: 15, sort_order: 4 },
      { id: '5', name: 'Operacional', color: '#8b5cf6', sla_target_minutes: 15, sort_order: 5 },
      { id: '6', name: 'Recursos Humanos', color: '#ec4899', sla_target_minutes: 15, sort_order: 6 },
      { id: '7', name: 'Suporte Técnico', color: '#ea580c', sla_target_minutes: 15, sort_order: 7 },
      { id: '8', name: 'Suprimentos', color: '#64748b', sla_target_minutes: 15, sort_order: 8 }
    ];
    try {
      let { data, error } = await supabase.from('departments').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true });
      if (error && isMissingDepartmentOrderColumn(error)) {
        const fallback = await supabase.from('departments').select('*').order('name', { ascending: true });
        data = fallback.data;
        error = fallback.error;
      }
      if (!error && data && data.length > 0) {
        const normalized = data.map((item, index) => ({ ...item, sort_order: Number(item.sort_order) || index + 1 }));
        const visible = isSupervisor(req.user) ? normalized.filter(item => departmentIds(req.user).includes(String(item.id))) : normalized;
        return res.json({ success: true, departments: visible });
      }
      const visibleDefaults = isSupervisor(req.user) ? defaultDepts.filter(item => departmentIds(req.user).includes(String(item.id))) : defaultDepts;
      return res.json({ success: true, departments: visibleDefaults });
    } catch (error) {
      console.warn('Aviso ao listar departamentos do Supabase, usando defaults:', error.message);
      return res.json({ success: true, departments: defaultDepts });
    }
  }

  // Criar ou atualizar departamento
  async saveDepartment(req, res) {
    try {
      const { id, name, color, description, sla_target_minutes, sort_order, allow_device_message_mutations, business_hours, after_hours_message } = req.body;
      
      if (!name) {
        return res.status(400).json({ success: false, error: 'Nome do departamento é obrigatório' });
      }

      const normalizedHours = normalizeBusinessHours(business_hours);
      if (normalizedHours.enabled && !Object.values(normalizedHours.days).some(intervals => intervals.length)) {
        return res.status(400).json({ success: false, error: 'Defina pelo menos um período de atendimento ou selecione atendimento 24 horas.' });
      }

      let payload = {
        name: String(name).trim(),
        color: color || '#2563eb',
        description: String(description || '').trim() || null,
        allow_device_message_mutations: allow_device_message_mutations === true,
        business_hours: normalizedHours,
        after_hours_message: String(after_hours_message || '').trim() || null,
        ...(Number.isInteger(Number(sort_order)) && Number(sort_order) > 0 ? { sort_order: Number(sort_order) } : {}),
        sla_target_minutes: sla_target_minutes ? parseInt(sla_target_minutes, 10) : 15
      };

      if (!id && !payload.sort_order) {
        const { data: lastDepartment, error: orderError } = await supabase
          .from('departments')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (orderError) throw orderError;
        payload.sort_order = (Number(lastDepartment?.sort_order) || 0) + 1;
      }

      let result;
      if (id) {
        // Atualiza
        result = await supabase.from('departments').update(payload).eq('id', id).select().single();
      } else {
        // Cria
        result = await supabase.from('departments').insert(payload).select().single();
      }

      if (result.error) throw result.error;

      ticketService.invalidateDepartmentCache();

      res.json({ success: true, department: result.data });
    } catch (error) {
      console.error('Erro ao salvar departamento:', error);
      const schemaMissing = isMissingDepartmentOrderColumn(error);
      res.status(schemaMissing ? 409 : 500).json({
        success: false,
        error: schemaMissing
          ? 'A estrutura dos departamentos ainda não foi atualizada. Execute a migração de departamentos no Supabase.'
          : 'Erro ao salvar departamento'
      });
    }
  }

  async reorderDepartments(req, res) {
    try {
      const departmentIdsInOrder = Array.isArray(req.body?.departmentIds) ? req.body.departmentIds.map(String) : [];
      if (!departmentIdsInOrder.length || new Set(departmentIdsInOrder).size !== departmentIdsInOrder.length) {
        return res.status(400).json({ success: false, error: 'Informe uma ordem válida para os departamentos.' });
      }

      const { data: existing, error: listError } = await supabase.from('departments').select('id');
      if (listError) throw listError;
      const existingIds = new Set((existing || []).map(item => String(item.id)));
      if (departmentIdsInOrder.length !== existingIds.size || departmentIdsInOrder.some(id => !existingIds.has(id))) {
        return res.status(400).json({ success: false, error: 'A lista deve conter todos os departamentos exatamente uma vez.' });
      }

      const updates = await Promise.all(departmentIdsInOrder.map((id, index) =>
        supabase.from('departments').update({ sort_order: index + 1 }).eq('id', id)
      ));
      const failed = updates.find(result => result.error);
      if (failed) throw failed.error;

      ticketService.invalidateDepartmentCache();
      return res.json({ success: true });
    } catch (error) {
      console.error('Erro ao reordenar departamentos:', error);
      const schemaMissing = isMissingDepartmentOrderColumn(error);
      return res.status(schemaMissing ? 409 : 500).json({
        success: false,
        error: schemaMissing
          ? 'A coluna de ordem ainda não existe. Execute a migração de departamentos no Supabase.'
          : 'Erro ao salvar a ordem dos departamentos.'
      });
    }
  }

  // Excluir departamento
  async deleteDepartment(req, res) {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ success: false, error: 'ID é obrigatório' });

      const { data: department, error: departmentError } = await supabase
        .from('departments')
        .select('id, name')
        .eq('id', id)
        .maybeSingle();
      if (departmentError) throw departmentError;
      if (!department) return res.status(404).json({ success: false, error: 'Departamento não encontrado' });

      const { data: accountsSetting, error: settingsError } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'whatsapp_accounts')
        .maybeSingle();
      if (settingsError) throw settingsError;

      const linkedAccounts = findLinkedWhatsAppAccounts(accountsSetting?.value, id, department.name);
      if (linkedAccounts.length > 0) {
        const accountNames = linkedAccounts.map(account => account.name || account.phone || 'WhatsApp').join(', ');
        return res.status(409).json({
          success: false,
          error: `Este departamento está vinculado ao WhatsApp: ${accountNames}. Altere o roteamento da conta antes de excluir.`
        });
      }

      const { error } = await supabase.from('departments').delete().eq('id', id);
      if (error) throw error;

      ticketService.invalidateDepartmentCache();

      res.json({ success: true, message: 'Departamento excluído com sucesso' });
    } catch (error) {
      console.error('Erro ao excluir departamento:', error);
      res.status(500).json({ success: false, error: 'Erro ao excluir departamento' });
    }
  }
}

const departmentController = new DepartmentController();
departmentController._test = { findLinkedWhatsAppAccounts, isMissingDepartmentOrderColumn };

module.exports = departmentController;
