const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractAndValidateName,
  isGeneratedCustomerName
} = require('../src/services/customer-identification.service');

const config = {
  require_customer_last_name: false,
  menu_keywords: 'menu,ajuda,olá',
  human_handoff_keywords: 'atendente,humano'
};
const departments = [{ name: 'Financeiro' }, { name: 'Suporte Técnico' }];

test('extrai e formata um nome informado em uma frase curta', () => {
  assert.deepEqual(
    extractAndValidateName('Meu nome é joão da silva', config, departments),
    { valid: true, name: 'João da Silva' }
  );
});

test('aceita primeiro nome e ignora caracteres invisíveis do WhatsApp', () => {
  assert.deepEqual(
    extractAndValidateName('\u200EEmanuele\u200B', config, departments),
    { valid: true, name: 'Emanuele' }
  );
  assert.deepEqual(
    extractAndValidateName('Emanuele', config, departments),
    { valid: true, name: 'Emanuele' }
  );
});

test('rejeita respostas que provavelmente são assunto, menu ou dado inválido', () => {
  for (const value of ['Quero falar com o financeiro', 'Olá', 'menu', 'João 123', 'https://exemplo.com']) {
    assert.equal(extractAndValidateName(value, config, departments).valid, false, value);
  }
});

test('pode exigir nome e sobrenome pelas configurações', () => {
  const strictConfig = { ...config, require_customer_last_name: true };
  assert.deepEqual(extractAndValidateName('Maria', strictConfig, departments), { valid: false, reason: 'last_name_required' });
  assert.equal(extractAndValidateName('Maria Souza', strictConfig, departments).valid, true);
});

test('identifica nomes temporários gerados pelo sistema', () => {
  assert.equal(isGeneratedCustomerName('Cliente 9856'), true);
  assert.equal(isGeneratedCustomerName('Cliente'), true);
  assert.equal(isGeneratedCustomerName('Jeferson Brito'), false);
});
