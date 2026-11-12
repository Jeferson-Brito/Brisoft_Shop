const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMessage, DEFAULT_MESSAGES } = require('../src/services/quick-message.service');

test('normaliza mensagem rápida e limita o atalho a caracteres seguros', () => {
  const normalized = normalizeMessage({
    id: '1',
    title: '  Aguardar  ',
    category: ' Atendimento ',
    content: '  Aguarde um momento.  ',
    shortcut: 'Aguarde Agora!'
  });
  assert.deepEqual(normalized, {
    id: '1',
    title: 'Aguardar',
    category: 'Atendimento',
    content: 'Aguarde um momento.',
    shortcut: 'aguardeagora',
    scope: 'global',
    department_id: null,
    department_name: null,
    is_active: true,
    created_by_id: null,
    created_by_name: 'Sistema',
    created_at: null,
    updated_by_name: null,
    updated_at: null
  });
});

test('fornece mensagens rápidas padrão para instalações sem cadastro', () => {
  assert.ok(DEFAULT_MESSAGES.length >= 3);
  assert.ok(DEFAULT_MESSAGES.every(item => item.title && item.content && item.is_active));
});
