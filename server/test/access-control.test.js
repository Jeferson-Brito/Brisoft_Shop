const test = require('node:test');
const assert = require('node:assert/strict');
const { departmentIds, canAccessDepartment } = require('../src/services/access-control.service');

test('supervisor acessa somente os departamentos atribuídos', () => {
  const supervisor = { role: 'Supervisor', department_id: 'setor-a', department_ids: ['setor-a', 'setor-b'] };
  assert.deepEqual(departmentIds(supervisor), ['setor-a', 'setor-b']);
  assert.equal(canAccessDepartment(supervisor, 'setor-b'), true);
  assert.equal(canAccessDepartment(supervisor, 'setor-c'), false);
});

test('administrador mantém acesso global', () => {
  assert.equal(canAccessDepartment({ role: 'Administrador' }, 'qualquer-setor'), true);
});
