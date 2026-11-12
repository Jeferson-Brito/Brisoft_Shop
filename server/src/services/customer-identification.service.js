const crypto = require('crypto');
const { supabase, isSupabaseConfigured } = require('../config/supabase');

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isGeneratedCustomerName(value) {
  return !value || /^cliente(?:\s+\d{2,})?$/i.test(String(value).trim());
}

function extractAndValidateName(input, config, departments = []) {
  let candidate = String(input || '')
    // Alguns teclados e clientes do WhatsApp inserem marcas direcionais e
    // caracteres de largura zero que não aparecem para o usuário.
    .replace(/[\u200B-\u200D\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/^\s*(?:meu nome (?:é|e)|eu (?:sou|me chamo)|pode me chamar de)\s+/i, '')
    .replace(/[!?;,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (candidate.length < 2 || candidate.length > 80) return { valid: false };
  if (/https?:\/\/|www\.|@|\d/.test(candidate)) return { valid: false };
  if (!/^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,5}$/u.test(candidate)) return { valid: false };
  if (config.require_customer_last_name && candidate.split(' ').length < 2) return { valid: false, reason: 'last_name_required' };

  const normalized = normalizeText(candidate);
  const blocked = [
    'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'ajuda', 'sim', 'nao',
    'atendente', 'humano', 'financeiro', 'comercial', 'suporte', 'quero falar', 'preciso de ajuda',
    ...String(config.menu_keywords || '').split(',').map(normalizeText),
    ...String(config.human_handoff_keywords || '').split(',').map(normalizeText),
    ...(departments || []).map(department => normalizeText(department.name))
  ].filter(Boolean);
  if (blocked.some(term => normalized === term || normalized.startsWith(`${term} `))) return { valid: false };

  candidate = candidate.split(' ').map(part => part.length <= 3 ? part : `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`).join(' ');
  return { valid: true, name: candidate };
}

async function findContactByPhone(phone) {
  if (!isSupabaseConfigured() || !phone) return null;
  const normalizedPhone = String(phone).replace(/\D/g, '');
  const phoneSuffix = normalizedPhone.slice(-8);
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .ilike('phone', `%${phoneSuffix}%`)
    .limit(50);
  if (error) {
    console.warn('Falha ao consultar contato pelo telefone:', error.message);
    return null;
  }
  return (data || []).find(contact => String(contact.phone || '').replace(/\D/g, '') === normalizedPhone) || null;
}

async function saveConfirmedContact(phone, name) {
  console.log(`[Contatos] Tentando salvar contato | nome="${name}" | phone="${phone}"`);
  if (!isSupabaseConfigured()) {
    console.warn('[Contatos] Supabase não configurado — contato não salvo.');
    throw new Error('Banco de dados indisponível.');
  }
  const normalizedPhone = String(phone).replace(/\D/g, '');
  const existing = await findContactByPhone(normalizedPhone);
  if (existing) {
    console.log(`[Contatos] Contato existente encontrado (id=${existing.id}), atualizando nome para "${name}"`);
    const { data, error } = await supabase.from('contacts').update({ name }).eq('id', existing.id).select().single();
    if (error) {
      console.error('[Contatos] Erro ao atualizar contato:', error.message, error.code);
      throw error;
    }
    console.log(`[Contatos] Contato atualizado com sucesso (id=${data.id})`);
    return data;
  }
  console.log(`[Contatos] Nenhum contato existente — inserindo novo registro`);
  const { data, error } = await supabase.from('contacts').insert({
    id: crypto.randomUUID(),
    name,
    phone: normalizedPhone,
    channel: 'WhatsApp',
    status: 'Ativo'
  }).select().single();
  if (error) {
    console.error('[Contatos] Erro ao inserir contato:', error.message, error.code, error.details);
    throw error;
  }
  console.log(`[Contatos] Novo contato salvo com sucesso (id=${data.id})`);
  return data;
}

async function ensureWhatsAppContact(phone, name) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  const existing = await findContactByPhone(normalizedPhone);
  if (existing) return existing;

  const safeName = String(name || '').trim() || `Cliente ${normalizedPhone.slice(-4)}`;
  const { data, error } = await supabase.from('contacts').insert({
    id: crypto.randomUUID(),
    name: safeName,
    phone: normalizedPhone,
    channel: 'WhatsApp',
    status: 'Ativo',
    is_employee: false
  }).select().single();
  if (!error) return data;

  // Duas mensagens podem chegar quase ao mesmo tempo. Se outra requisição
  // criou o contato primeiro, reutilizamos o cadastro em vez de duplicá-lo.
  const concurrentContact = await findContactByPhone(normalizedPhone);
  if (concurrentContact) return concurrentContact;
  throw error;
}

async function repairBlankContacts() {
  if (!isSupabaseConfigured()) return;
  try {
    const { data: contacts } = await supabase.from('contacts').select('id, name, phone');
    if (!contacts) return;
    for (const c of contacts) {
      const cleanPhone = String(c.phone || '').replace(/\D/g, '');
      if (!cleanPhone || cleanPhone === 'undefined' || cleanPhone === 'null') {
        const { data: tickets } = await supabase
          .from('tickets')
          .select('phone, raw_jid, jid')
          .eq('client_name', c.name)
          .order('created_at', { ascending: false })
          .limit(1);

        const t = tickets?.[0];
        const restoredPhone = String(t?.phone || t?.raw_jid || t?.jid || '').replace('@lid', '').replace('@s.whatsapp.net', '').replace(/:\d+$/, '').replace(/\D/g, '');
        if (restoredPhone) {
          console.log(`[Contatos] Restaurando telefone para ${c.name}: ${restoredPhone}`);
          await supabase.from('contacts').update({ phone: restoredPhone }).eq('id', c.id);
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao reparar contatos:', e.message);
  }
}

setTimeout(() => repairBlankContacts().catch(() => {}), 1500);

module.exports = { normalizeText, isGeneratedCustomerName, extractAndValidateName, findContactByPhone, saveConfirmedContact, ensureWhatsAppContact, repairBlankContacts };
