const test = require('node:test');
const assert = require('node:assert/strict');
const quickMessageService = require('../src/services/quick-message.service');

test('quickMessageService.normalizeMessage lida com scope e departamento', () => {
  const { normalizeMessage } = quickMessageService;

  const globalMsg = normalizeMessage({
    title: 'Msg Global',
    content: 'Texto global',
    scope: 'global'
  });
  assert.equal(globalMsg.scope, 'global');
  assert.equal(globalMsg.department_id, null);

  const deptMsg = normalizeMessage({
    title: 'Msg Dept',
    content: 'Texto dept',
    scope: 'department',
    department_id: 'dept-123',
    department_name: 'Suporte Técnico'
  });
  assert.equal(deptMsg.scope, 'department');
  assert.equal(deptMsg.department_id, 'dept-123');
  assert.equal(deptMsg.department_name, 'Suporte Técnico');
});
