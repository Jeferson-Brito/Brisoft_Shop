const test = require('node:test');
const assert = require('node:assert/strict');

const ticketService = require('../src/services/ticket.service');

test('reconhece erro de ausência da coluna user_id na tabela messages', () => {
  const isMissing = ticketService._test.isMissingMessageUserIdColumn;

  assert.equal(isMissing({ code: '42703', message: 'column "user_id" of relation "messages" does not exist' }), true);
  assert.equal(isMissing({ code: 'PGRST204', message: "Could not find the 'user_id' column of 'messages' in the schema cache" }), true);
  assert.equal(isMissing({ message: "Could not find the 'user_id' column of 'messages' in the schema cache" }), true);
  assert.equal(isMissing({ code: '23505', message: 'duplicate key value violates unique constraint' }), false);
  assert.equal(isMissing(null), false);
});

test('reconhece erro de ausência das colunas de tracking de conversa', () => {
  const isMissing = ticketService._test.isMissingConversationTrackingColumns;

  assert.equal(isMissing({ code: 'PGRST204', message: "Could not find the 'sender_type' column of 'messages' in the schema cache" }), true);
  assert.equal(isMissing({ code: '42703', message: 'column "platform_messages" does not exist' }), true);
  assert.equal(isMissing({ message: "Could not find the 'handled_via' column of 'tickets' in the schema cache" }), true);
  assert.equal(isMissing({ code: '23505', message: 'duplicate key value' }), false);
});

test('reconhece erro de ausência das colunas de mensagem remota do WhatsApp', () => {
  const isMissing = ticketService._test.isMissingRemoteMessageColumns;

  assert.equal(isMissing({ code: 'PGRST204', message: "Could not find the 'remote_message_id' column of 'messages' in the schema cache" }), true);
  assert.equal(isMissing({ code: '42703', message: 'column "whatsapp_account_id" does not exist' }), true);
  assert.equal(isMissing({ code: '23505', message: 'duplicate key value' }), false);
});

test('reconhece erro de ausência das colunas de interação entre mensagens', () => {
  const isMissing = ticketService._test.isMissingMessageInteractionColumns;

  assert.equal(isMissing({ code: 'PGRST204', message: "Could not find the 'reply_preview' column of 'messages'" }), true);
  assert.equal(isMissing({ message: 'column "deleted_at" does not exist' }), true);
  assert.equal(isMissing({ code: '23505', message: 'duplicate key value' }), false);
});

test('gera prévia limpa para respostas a texto e mídia', () => {
  const preview = ticketService._test.messagePreview;

  assert.equal(preview({ text: '*Maria:*\n\nVou verificar para você.' }), 'Vou verificar para você.');
  assert.equal(preview({ type: 'audio', text: '' }), '🎙️ Áudio');
});
