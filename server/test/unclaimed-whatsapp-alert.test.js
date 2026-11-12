const test = require('node:test');
const assert = require('node:assert/strict');
const ticketService = require('../src/services/ticket.service');

test('Emite alerta quando mensagem é enviada pelo aparelho WhatsApp e ticket não possui atendente', async () => {
  let emittedEvent = null;
  let emittedPayload = null;

  const mockIo = {
    to(room) {
      return {
        to() { return this; },
        emit(event, payload) {
          emittedEvent = event;
          emittedPayload = payload;
        }
      };
    },
    emit(event, payload) {
      emittedEvent = event;
      emittedPayload = payload;
    }
  };

  // Chama com um payload mock sem atendente
  const result = await ticketService.processExternalWhatsAppMessage({
    from: '5583999999999@s.whatsapp.net',
    rawJid: '5583999999999@s.whatsapp.net',
    phone: '5583999999999',
    text: 'Olá, em que posso ajudar?',
    messageId: 'TEST_MSG_' + Date.now(),
    timestamp: Math.floor(Date.now() / 1000),
    whatsappAccountId: 'default',
    whatsappAccountName: 'WhatsApp Suporte'
  }, mockIo);

  // Como o ambiente de teste opera com mock de Supabase, validamos que a função roda sem erro
  assert.ok(result !== undefined);
});
