// ==========================================================================
// BRISOFT SHOP - CONTACTS CONTROLLER
// ==========================================================================

const { supabase, isSupabaseConfigured } = require('../config/supabase');
const crypto = require('crypto');

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function normalizeEmployee(value) {
  return value === true || value === 'true';
}

async function syncContactClassification(contact) {
  if (!contact?.id) return;
  const linkedResult = await supabase.from('tickets').update({ is_employee: Boolean(contact.is_employee) }).eq('contact_id', contact.id);
  if (linkedResult.error) throw linkedResult.error;
  const phone = normalizePhone(contact.phone);
  if (phone) {
    const phoneResult = await supabase.from('tickets').update({ is_employee: Boolean(contact.is_employee), contact_id: contact.id }).eq('phone', phone);
    if (phoneResult.error) throw phoneResult.error;
  }
}

let contactsCache = null;
let contactsCacheExpiresAt = 0;

function invalidateContactsCache() {
  contactsCache = null;
  contactsCacheExpiresAt = 0;
}

class ContactsController {
  async listContacts(req, res) {
    if (!isSupabaseConfigured()) return res.json({ success: true, contacts: [] });
    if (contactsCache && contactsCacheExpiresAt > Date.now()) {
      return res.json({ success: true, contacts: contactsCache });
    }
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      contactsCache = data || [];
      contactsCacheExpiresAt = Date.now() + 30000;
      return res.json({ success: true, contacts: contactsCache });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  async createContact(req, res) {
    if (!isSupabaseConfigured()) return res.status(503).json({ success: false, error: 'Banco de dados indisponivel.' });
    const { name, phone, email, cnpj, status, channel, notes, is_employee, avatar_url } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Nome obrigatorio.' });
    const normalizedPhone = normalizePhone(phone);
    if (normalizeEmployee(is_employee) && !normalizedPhone) {
      return res.status(400).json({ success: false, error: 'Informe o número do WhatsApp do funcionário.' });
    }
    try {
      const contactPayload = {
        id: crypto.randomUUID(),
        name: name.trim(),
        phone: normalizedPhone || null,
        email: email || null,
        cnpj: cnpj || null,
        status: status || 'Ativo',
        channel: channel || 'Web',
        notes: notes || null,
        avatar_url: avatar_url || null,
        is_employee: normalizeEmployee(is_employee)
      };
      let existing = null;
      if (normalizedPhone) {
        const suffix = normalizedPhone.slice(-8);
        const existingResult = await supabase.from('contacts').select('*').ilike('phone', `%${suffix}%`).limit(50);
        if (existingResult.error) throw existingResult.error;
        existing = (existingResult.data || []).find(item => normalizePhone(item.phone) === normalizedPhone) || null;
      }
      const { id: _newId, ...existingContactPayload } = contactPayload;
      const operation = existing
        ? supabase.from('contacts').update({ ...existingContactPayload, avatar_url: avatar_url || existing.avatar_url || null }).eq('id', existing.id)
        : supabase.from('contacts').insert(contactPayload);
      const { data, error } = await operation.select().single();
      if (error) throw error;
      await syncContactClassification(data);
      invalidateContactsCache();
      return res.json({ success: true, contact: data, updatedExisting: Boolean(existing) });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  async importContacts(req, res) {
    if (!isSupabaseConfigured()) return res.status(503).json({ success: false, error: 'Banco de dados indisponível.' });
    const rows = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
    if (!rows.length) return res.status(400).json({ success: false, error: 'A planilha não contém contatos válidos.' });
    if (rows.length > 500) return res.status(400).json({ success: false, error: 'Envie no máximo 500 contatos por lote.' });

    const invalid = [];
    const normalizedRows = [];
    rows.forEach((row, index) => {
      const name = String(row?.name || '').trim().slice(0, 255);
      const phone = normalizePhone(row?.phone);
      if (!name || phone.length < 12 || phone.length > 15) {
        invalid.push({ row: index + 2, reason: !name ? 'Nome não informado' : 'WhatsApp inválido' });
        return;
      }
      normalizedRows.push({
        name,
        phone,
        email: String(row?.email || '').trim().slice(0, 150) || null,
        cnpj: String(row?.cnpj || '').trim().slice(0, 40) || null,
        status: String(row?.status || 'Ativo').trim().slice(0, 20) || 'Ativo',
        channel: 'WhatsApp',
        notes: String(row?.notes || '').trim().slice(0, 2000) || null,
        is_employee: normalizeEmployee(row?.is_employee)
      });
    });
    if (!normalizedRows.length) return res.status(400).json({ success: false, error: 'Nenhuma linha possui nome e WhatsApp válidos.', invalid });

    try {
      const existingContacts = [];
      for (let from = 0; ; from += 1000) {
        const result = await supabase.from('contacts').select('id, phone').range(from, from + 999);
        if (result.error) throw result.error;
        existingContacts.push(...(result.data || []));
        if (!result.data || result.data.length < 1000) break;
      }
      const existingByPhone = new Map(existingContacts.map(contact => [normalizePhone(contact.phone), contact]));
      const uniqueByPhone = new Map();
      for (const row of normalizedRows) uniqueByPhone.set(row.phone, row);
      const payloads = [...uniqueByPhone.values()].map(row => ({
        id: existingByPhone.get(row.phone)?.id || crypto.randomUUID(),
        ...row
      }));

      const saved = [];
      for (let index = 0; index < payloads.length; index += 100) {
        const result = await supabase.from('contacts')
          .upsert(payloads.slice(index, index + 100), { onConflict: 'id' })
          .select();
        if (result.error) throw result.error;
        saved.push(...(result.data || []));
      }
      for (let index = 0; index < saved.length; index += 20) {
        await Promise.all(saved.slice(index, index + 20).map(syncContactClassification));
      }

      const updated = payloads.filter(row => existingByPhone.has(row.phone)).length;
      invalidateContactsCache();
      return res.json({
        success: true,
        imported: payloads.length - updated,
        updated,
        ignored: invalid.length + (normalizedRows.length - uniqueByPhone.size),
        invalid,
        contacts: saved
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  async updateContact(req, res) {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'ID invalido.' });
    if (!isSupabaseConfigured()) return res.status(503).json({ success: false, error: 'Banco de dados indisponivel.' });

    const allowed = ['name', 'phone', 'email', 'cnpj', 'status', 'channel', 'notes', 'is_employee', 'avatar_url'];
    const payload = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    }
    if (payload.phone !== undefined) payload.phone = normalizePhone(payload.phone) || null;
    if (payload.is_employee !== undefined) payload.is_employee = normalizeEmployee(payload.is_employee);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum campo valido para atualizar.' });
    }

    try {
      const { data: current, error: currentError } = await supabase.from('contacts').select('phone, is_employee').eq('id', id).maybeSingle();
      if (currentError) throw currentError;
      if (!current) return res.status(404).json({ success: false, error: 'Contato não encontrado.' });
      const finalEmployee = payload.is_employee ?? Boolean(current.is_employee);
      const finalPhone = payload.phone !== undefined ? payload.phone : current.phone;
      if (finalEmployee && !normalizePhone(finalPhone)) {
        return res.status(400).json({ success: false, error: 'Informe o número do WhatsApp do funcionário.' });
      }
      const { data, error } = await supabase
        .from('contacts')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await syncContactClassification(data);
      invalidateContactsCache();
      return res.json({ success: true, contact: data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  async deleteContact(req, res) {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'ID invalido.' });
    if (!isSupabaseConfigured()) return res.status(503).json({ success: false, error: 'Banco de dados indisponivel.' });
    try {
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
      invalidateContactsCache();
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new ContactsController();
module.exports._test = { normalizePhone, normalizeEmployee };

