const test = require('node:test');
const assert = require('node:assert/strict');
const contactsController = require('../src/controllers/contacts.controller');

test('normaliza telefone e classificação de funcionário recebidos pela API', () => {
  assert.equal(contactsController._test.normalizePhone('+55 (83) 99999-0000'), '5583999990000');
  assert.equal(contactsController._test.normalizePhone('(83) 99999-0000'), '5583999990000');
  assert.equal(contactsController._test.normalizePhone('0055 83 99999-0000'), '5583999990000');
  assert.equal(contactsController._test.normalizeEmployee(true), true);
  assert.equal(contactsController._test.normalizeEmployee('true'), true);
  assert.equal(contactsController._test.normalizeEmployee(false), false);
});
