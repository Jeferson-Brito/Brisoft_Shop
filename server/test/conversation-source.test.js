const test = require('node:test');
const assert = require('node:assert/strict');
const ticketService = require('../src/services/ticket.service');

test('classifica a origem do atendimento sem perder atendimentos mistos', () => {
  const { mergeHandledVia } = ticketService._test;
  assert.equal(mergeHandledVia('pending', 'platform'), 'platform');
  assert.equal(mergeHandledVia('pending', 'whatsapp_device'), 'whatsapp_device');
  assert.equal(mergeHandledVia('platform', 'whatsapp_device'), 'mixed');
  assert.equal(mergeHandledVia('whatsapp_device', 'platform'), 'mixed');
  assert.equal(mergeHandledVia('mixed', 'platform'), 'mixed');
});

test('usa o JID telefônico para enviar mensagens e mantém o LID apenas como fallback', () => {
  const { preferredWhatsAppJid, phoneFromWhatsAppIdentity } = ticketService._test;
  assert.equal(
    preferredWhatsAppJid('55 (83) 93858-515', '25117639839856@lid'),
    '558393858515@s.whatsapp.net'
  );
  assert.equal(preferredWhatsAppJid('', '25117639839856@lid'), '25117639839856@lid');
  assert.equal(phoneFromWhatsAppIdentity('', '25117639839856@lid'), '');
  assert.equal(phoneFromWhatsAppIdentity('', '558393858515@s.whatsapp.net'), '558393858515');
});

test('preserva o JID original ao alterar mensagem enviada pelo aparelho', () => {
  const { messageMutationWhatsAppJid } = ticketService._test;
  const ticket = {
    phone: '558393858515',
    jid: '558393858515@s.whatsapp.net',
    raw_jid: '25117639839856@lid'
  };
  assert.equal(messageMutationWhatsAppJid(ticket, true), '25117639839856@lid');
  assert.equal(messageMutationWhatsAppJid(ticket, false), '558393858515@s.whatsapp.net');
  assert.equal(messageMutationWhatsAppJid({ is_group: true, group_jid: '120363000000@g.us' }, true), '120363000000@g.us');
});
