// ==========================================================================
// BRISOFT SHOP - FORMATTERS & HELPERS
// ==========================================================================

/**
 * Formata telefone brasileiro ou internacional de forma legível
 */
export function formatPhone(phone) {
  if (!phone || phone === 'undefined' || phone === 'null') return '—';
  const clean = String(phone).replace(/\D/g, '');
  if (!clean) return '—';
  
  if (clean.length === 13 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.length === 12 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  }
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  if (clean.length >= 10 && clean.length <= 13) {
    return `+${clean}`;
  }
  
  // Se for ID interno do WhatsApp (@lid) ainda não resolvido
  if (clean.length >= 14) {
    return `WhatsApp (ID: ${clean.slice(0, 4)}...${clean.slice(-4)})`;
  }
  
  return clean || '—';
}

/**
 * Formata CNPJ ou CPF
 */
export function formatCnpjCpf(val) {
  if (!val) return 'Não informado';
  const clean = String(val).replace(/\D/g, '');
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  if (clean.length === 11) {
    return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return val;
}

/**
 * Formata data e hora no formato brasileiro
 */
export function formatDateTime(val) {
  if (!val) return '--';
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toLocaleString('pt-BR');
  }
  return val;
}
