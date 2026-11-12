const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeBotConfig, renderBotMessage, departmentOptions } = require('../src/services/bot-config.service');

test('normalizeBotConfig aplica limites e preserva valores válidos', () => {
  const config = normalizeBotConfig({
    enabled: false,
    resume_window_hours: 999,
    rating_window_minutes: 1,
    invalid_attempt_limit: 0,
    collect_customer_name: false,
    require_customer_last_name: true,
    customer_name_attempt_limit: 99,
    rapid_message_grace_seconds: 99,
    external_service_idle_minutes: 9999,
    send_rating_on_external_inactivity: false,
    allow_agent_toggle_rating: true,
    greeting_message: 'Olá, {nome}'
  });
  assert.equal(config.enabled, false);
  assert.equal(config.resume_window_hours, 168);
  assert.equal(config.rating_window_minutes, 5);
  assert.equal(config.invalid_attempt_limit, 3);
  assert.equal(config.collect_customer_name, false);
  assert.equal(config.require_customer_last_name, true);
  assert.equal(config.customer_name_attempt_limit, 5);
  assert.equal(config.rapid_message_grace_seconds, 15);
  assert.equal(config.external_service_idle_minutes, 1440);
  assert.equal(config.send_rating_on_external_inactivity, false);
  assert.equal(config.allow_agent_toggle_rating, true);
  assert.equal(config.greeting_message, 'Olá, {nome}');
});

test('permite desativar a proteção de mensagens rápidas com zero', () => {
  assert.equal(normalizeBotConfig({ rapid_message_grace_seconds: 0 }).rapid_message_grace_seconds, 0);
});

test('renderBotMessage substitui apenas variáveis conhecidas', () => {
  const message = renderBotMessage('Olá {nome}, fila {departamento}. {desconhecida}', {
    nome: 'Maria',
    departamento: 'Financeiro'
  });
  assert.equal(message, 'Olá Maria, fila Financeiro. {desconhecida}');
});

test('departmentOptions cria menu numerado', () => {
  assert.equal(departmentOptions([{ name: 'Comercial' }, { name: 'Suporte' }]), '1️⃣ - Comercial\n2️⃣ - Suporte');
});

test('departmentOptions preserva a ordem definida pelo administrador', () => {
  const orderedDepartments = [
    { name: 'Suporte Técnico', sort_order: 1 },
    { name: 'Financeiro', sort_order: 2 },
    { name: 'Comercial', sort_order: 3 }
  ];
  assert.equal(
    departmentOptions(orderedDepartments),
    '1️⃣ - Suporte Técnico\n2️⃣ - Financeiro\n3️⃣ - Comercial'
  );
});

test('atualiza somente modelos legados para a versão formatada do WhatsApp', () => {
  const migrated = normalizeBotConfig({
    queue_confirmation_message: '✅ Atendimento encaminhado para {departamento}. Aguarde um momento; um de nossos especialistas responderá em breve.'
  });
  assert.match(migrated.queue_confirmation_message, /\*Atendimento encaminhado\*/);
  assert.match(migrated.queue_confirmation_message, /\{nome\}/);

  const custom = normalizeBotConfig({ queue_confirmation_message: 'Minha mensagem personalizada' });
  assert.equal(custom.queue_confirmation_message, 'Minha mensagem personalizada');
});
