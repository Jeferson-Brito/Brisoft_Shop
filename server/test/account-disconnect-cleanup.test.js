const test = require('node:test');
const assert = require('node:assert/strict');
const ticketService = require('../src/services/ticket.service');

test('handleAccountDisconnected lida com parâmetros ausentes com segurança', async () => {
  const result = await ticketService.handleAccountDisconnected(null);
  assert.equal(result.success, false);
  assert.equal(result.closedCount, 0);
  assert.equal(result.inactivedGroupsCount, 0);

  const resultEmpty = await ticketService.handleAccountDisconnected('');
  assert.equal(resultEmpty.success, false);
});

test('handleAccountDisconnected aceita motivos manual_disconnect e device_logout', async () => {
  // Teste de chamada com conta fictícia que não possui tickets no Supabase
  const fakeIo = {
    events: [],
    emit(event, data) {
      this.events.push({ event, data });
    },
    to() {
      return this;
    }
  };

  const result = await ticketService.handleAccountDisconnected('non-existent-account-id', 'manual_disconnect', fakeIo);
  assert.equal(result.success, true);
  assert.equal(result.closedCount, 0);
  assert.equal(result.inactivedGroupsCount, 0);
});

test('makeInitials gera iniciais limpas e não quebra com emojis nem gera surrogates inválidos', () => {
  const { makeInitials } = ticketService._test;
  
  // Grupo com emoji como #soucombatente 🛡️
  const initialsCombatente = makeInitials('#soucombatente 🛡️');
  assert.equal(initialsCombatente, 'SO');
  
  // Grupo com emoji no início
  const initialsShield = makeInitials('🛡️ Suporte Técnico');
  assert.equal(initialsShield, 'ST');
  
  // Grupo somente com emojis
  const initialsEmojiOnly = makeInitials('🛡️🔥');
  assert.equal(initialsEmojiOnly, '🛡️');

  // Serialização JSON nunca deve falhar ou conter surrogates soltos
  const json = JSON.stringify({ initials: initialsCombatente, emojiInitials: initialsEmojiOnly });
  assert.ok(json.includes('SO'));
});

test('handleAccountDisconnected preserva o timestamp original de desconexão em chamadas repetidas (evita reset em loops de reconexão)', async () => {
  const fakeIo = { emit() {}, to() { return this; } };
  const accountId = 'test-preserve-time-acc';

  await ticketService.handleAccountDisconnected(accountId, 'connection_lost', fakeIo);
  const info1 = ticketService._test.getChannelDisconnectInfo('whatsapp:' + accountId);
  assert.ok(info1 && info1.disconnected_at);
  const originalTime = info1.disconnected_at;

  // Simula retry 100ms depois
  await new Promise(r => setTimeout(r, 50));
  await ticketService.handleAccountDisconnected(accountId, 'connection_lost', fakeIo);
  const info2 = ticketService._test.getChannelDisconnectInfo('whatsapp:' + accountId);

  // O timestamp original DEVE ser preservado
  assert.equal(info2.disconnected_at, originalTime);

  // Limpa conta de teste
  await ticketService.handleAccountReconnected(accountId, fakeIo);
});

test('desconexão não usa a hora em que a conta conectou nem uma data fixa', () => {
  const { getChannelDisconnectInfo } = ticketService._test;
  assert.equal(getChannelDisconnectInfo('whatsapp:conta-orfa', []), null);
  assert.equal(getChannelDisconnectInfo('whatsapp:conta-antiga', [{
    id: 'conta-antiga',
    status: 'disconnected',
    phone: null,
    lastConnectedAt: '2020-01-01T00:00:00.000Z'
  }]), null);

  const disconnectedAt = '2026-10-01T12:00:00.000Z';
  const info = getChannelDisconnectInfo('whatsapp:conta-nova', [{
    id: 'conta-nova',
    status: 'disconnected',
    phone: null,
    lastConnectedAt: '2020-01-01T00:00:00.000Z',
    lastDisconnectedAt: disconnectedAt
  }]);
  assert.equal(info.disconnected_at, disconnectedAt);
});

test('cleanupExpiredDisconnectedTickets executa sem lançar exceções', async () => {
  const fakeIo = { emit() {}, to() { return this; } };
  const fakeWhatsapp = { getAccounts: () => [] };
  const result = await ticketService.cleanupExpiredDisconnectedTickets(fakeIo, fakeWhatsapp);
  assert.ok(typeof result.discarded === 'number');
  assert.ok(typeof result.retained === 'number');
});


