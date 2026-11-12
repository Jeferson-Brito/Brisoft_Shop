function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const HEADER_ALIASES = {
  name: ['nome', 'cliente', 'funcionario', 'contato', 'nome completo', 'razao social'],
  phone: ['telefone', 'celular', 'whatsapp', 'numero whatsapp', 'fone'],
  email: ['email', 'e mail'],
  cnpj: ['cpf', 'cnpj', 'cpf cnpj', 'documento'],
  type: ['tipo', 'tipo contato', 'categoria'],
  notes: ['observacoes', 'observacao', 'notas'],
  status: ['status', 'situacao']
};

function resolveColumns(headerRow = []) {
  const normalized = headerRow.map(normalizeHeader);
  return Object.fromEntries(Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
    field,
    normalized.findIndex(header => aliases.includes(header))
  ]));
}

function cell(row, index) {
  if (index < 0) return '';
  const value = row?.[index];
  if (value == null) return '';
  if (typeof value === 'object' && value.text) return String(value.text).trim();
  return String(value).trim();
}

function employeeType(value) {
  const normalized = normalizeHeader(value);
  return ['funcionario', 'funcionaria', 'colaborador', 'colaboradora', 'employee', 'interno'].includes(normalized);
}

export function rowsToContacts(rows = [], defaultEmployee = false) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const columns = resolveColumns(rows[0]);
  if (columns.name < 0 || columns.phone < 0) throw new Error('A planilha precisa ter as colunas Nome e WhatsApp (ou Telefone).');
  return rows.slice(1).map(row => ({
    name: cell(row, columns.name),
    phone: cell(row, columns.phone),
    email: cell(row, columns.email),
    cnpj: cell(row, columns.cnpj),
    notes: cell(row, columns.notes),
    status: cell(row, columns.status) || 'Ativo',
    is_employee: columns.type >= 0 ? employeeType(cell(row, columns.type)) : Boolean(defaultEmployee)
  })).filter(contact => contact.name || contact.phone);
}

export function parseCsv(text = '') {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(value); value = '';
      if (row.some(item => String(item).trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value);
  if (row.some(item => String(item).trim())) rows.push(row);
  return rows;
}
