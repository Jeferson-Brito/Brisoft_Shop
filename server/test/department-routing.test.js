const test = require('node:test');
const assert = require('node:assert/strict');

const departmentController = require('../src/controllers/department.controller');

test('identifica contas do WhatsApp vinculadas por UUID ou nome legado', () => {
  const accounts = [
    { name: 'Geral', routing_mode: 'general', department_id: null },
    { name: 'Financeiro', routing_mode: 'department', department_id: 'uuid-financeiro', department_name: 'Financeiro' },
    { name: 'Financeiro legado', routing_mode: 'department', department_id: '4', department_name: 'FINANCEIRO' },
    { name: 'Suporte', routing_mode: 'department', department_id: 'uuid-suporte', department_name: 'Suporte Técnico' }
  ];

  const linked = departmentController._test.findLinkedWhatsAppAccounts(accounts, 'uuid-financeiro', 'Financeiro');
  assert.deepEqual(linked.map(account => account.name), ['Financeiro', 'Financeiro legado']);
});

test('não encontra vínculos em configurações ausentes ou de outros departamentos', () => {
  const findLinked = departmentController._test.findLinkedWhatsAppAccounts;
  assert.deepEqual(findLinked(null, 'uuid-financeiro', 'Financeiro'), []);
  assert.deepEqual(findLinked([
    { name: 'Suporte', routing_mode: 'department', department_id: 'uuid-suporte', department_name: 'Suporte Técnico' }
  ], 'uuid-financeiro', 'Financeiro'), []);
});

test('identifica quando a migração de ordem dos departamentos ainda não foi aplicada', () => {
  const isMissing = departmentController._test.isMissingDepartmentOrderColumn;
  assert.equal(isMissing({ message: "column departments.sort_order does not exist" }), true);
  assert.equal(isMissing({ message: "Could not find the 'description' column in the schema cache" }), true);
  assert.equal(isMissing({ message: 'connection timeout' }), false);
});
