const test = require('node:test');
const assert = require('node:assert/strict');

const whatsappService = require('../src/services/whatsapp.service');

test('identifica mídia dentro de mensagens temporárias e de visualização única', () => {
  const imageMessage = { mimetype: 'image/jpeg', caption: 'Teste' };
  const wrapped = {
    ephemeralMessage: {
      message: {
        viewOnceMessageV2: {
          message: { imageMessage }
        }
      }
    }
  };
  assert.equal(whatsappService._test.unwrapMessageContent(wrapped).imageMessage, imageMessage);
});

test('remove caracteres inseguros de identificadores usados em arquivos', () => {
  assert.equal(whatsappService._test.safeFileToken('../abc,123'), 'abc123');
});

test('obtém o texto da mensagem original usada em uma reação', () => {
  assert.equal(
    whatsappService._test.messageContentPreview({ extendedTextMessage: { text: 'Teste de emoji' } }),
    'Teste de emoji'
  );
  assert.equal(
    whatsappService._test.messageContentPreview({ imageMessage: {} }),
    '📷 Imagem'
  );
});

test('armazena e recupera o tamanho da mídia em bytes no cache', () => {
  const ticketService = require('../src/services/ticket.service');
  ticketService._test.rememberMediaSize('test-image-large.png', 6 * 1024 * 1024);
  
  assert.equal(
    ticketService.getMediaSize('/media/test-image-large.png', 'test-image-large.png'),
    6 * 1024 * 1024
  );
  assert.equal(
    ticketService.getMediaSize('https://example.com/api/media/test-image-large.png'),
    6 * 1024 * 1024
  );
});

