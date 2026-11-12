const test = require('node:test');
const assert = require('node:assert/strict');

const whatsappService = require('../src/services/whatsapp.service');

test('calcula backoff de reconexão com limite superior', () => {
  const { reconnectDelay } = whatsappService._test;
  assert.equal(reconnectDelay(1), 5000);
  assert.equal(reconnectDelay(2), 10000);
  assert.equal(reconnectDelay(3), 20000);
  assert.equal(reconnectDelay(99), 300000);
});

test('mantém mensagens recentes disponíveis para novas tentativas de descriptografia', () => {
  const cache = new whatsappService._test.ExpiringCache({ ttlMs: 1000, maxEntries: 2 });
  const key = whatsappService._test.messageCacheKey({ remoteJid: '558399999999:2@s.whatsapp.net', id: 'ABC' });
  cache.set(key, { conversation: 'Olá' });
  assert.deepEqual(cache.get('558399999999@s.whatsapp.net:ABC'), { conversation: 'Olá' });
  cache.del(key);
  assert.equal(cache.get(key), undefined);
});

test('localiza a mesma mensagem quando o retry troca telefone por LID', () => {
  const account = {
    messageCache: new whatsappService._test.ExpiringCache({ ttlMs: 1000, maxEntries: 10 })
  };
  const message = { conversation: 'Olá novamente' };
  whatsappService._test.cacheRetryMessage(account, {
    remoteJid: '558399999999@s.whatsapp.net',
    id: 'MESSAGE-123'
  }, message);
  assert.deepEqual(
    whatsappService._test.getCachedRetryMessage(account, {
      remoteJid: '25117639839856@lid',
      id: 'MESSAGE-123'
    }),
    message
  );
});

test('restaura mensagens persistidas sem renovar artificialmente sua validade', () => {
  const original = new whatsappService._test.ExpiringCache({ ttlMs: 1000, maxEntries: 2 });
  original.set('chat:ABC', { conversation: 'Mensagem importante' });
  const snapshot = original.snapshot();
  const restored = new whatsappService._test.ExpiringCache({ ttlMs: 999999, maxEntries: 2 });
  restored.restore(snapshot);
  assert.deepEqual(restored.get('chat:ABC'), { conversation: 'Mensagem importante' });
  assert.equal(restored.snapshot()[0].expiresAt, snapshot[0].expiresAt);
});

test('mantém habilitados os eventos de mensagens enviadas por outros dispositivos', () => {
  assert.equal(whatsappService._test.EMIT_OWN_EVENTS, true);
});

test('normaliza chamadas recebidas de voz e vídeo do WhatsApp', () => {
  assert.deepEqual(
    whatsappService._test.normalizeCallEvent({ id: 'CALL-1', from: '558399999999@s.whatsapp.net', status: 'offer', isVideo: true, date: 123 }),
    { callId: 'CALL-1', from: '558399999999@s.whatsapp.net', status: 'ringing', isVideo: true, isGroup: false, timestamp: 123 }
  );
  assert.equal(whatsappService._test.normalizeCallEvent({ id: 'CALL-1', status: 'timeout' }).status, 'ended');
});

test('não mantém a sessão artificialmente online para preservar o celular principal', () => {
  assert.equal(whatsappService._test.MARK_ONLINE_ON_CONNECT, false);
});

test('não troca um JID telefônico pelo LID ao exibir o destinatário', () => {
  const lidMap = new Map([
    ['558393858515@s.whatsapp.net', '25117639839856@lid'],
    ['25117639839856@lid', '558393858515@s.whatsapp.net']
  ]);
  assert.equal(
    whatsappService._test.getPhoneFromJid('558393858515@s.whatsapp.net', lidMap),
    '558393858515'
  );
  assert.equal(
    whatsappService._test.getPhoneFromJid('25117639839856@lid', lidMap),
    '558393858515'
  );
});

test('prioriza o telefone alternativo fornecido pelo WhatsApp para mensagens LID', () => {
  const message = {
    key: {
      remoteJid: '25117639839856@lid',
      remoteJidAlt: '558393858515@s.whatsapp.net'
    }
  };
  assert.equal(
    whatsappService._test.phoneJidFromMessageMetadata(message),
    '558393858515@s.whatsapp.net'
  );
});

test('não confunde o identificador numérico LID com um telefone', () => {
  const message = { key: { remoteJid: '25117639839856@lid' } };
  assert.equal(whatsappService._test.phoneJidFromMessageMetadata(message), '');
});

test('resolve LID pelo repositório interno antes de enviar', async () => {
  const account = {
    name: 'Teste',
    lidMap: new Map(),
    sock: {
      signalRepository: {
        lidMapping: {
          getPNForLID: async () => '558393858515@s.whatsapp.net'
        }
      }
    }
  };
  assert.equal(
    await whatsappService._test.resolveJid('25117639839856@lid', account),
    '558393858515@s.whatsapp.net'
  );
});

test('normaliza roteamento padrão para geral quando não especificado', () => {
  const result = whatsappService._test.normalizeAccountRouting({});
  assert.equal(result.routingMode, 'general');
  assert.equal(result.departmentId, null);
  assert.equal(result.departmentName, null);
});

test('normaliza roteamento dedicado para departamento', () => {
  const result = whatsappService._test.normalizeAccountRouting({
    routing_mode: 'department',
    department_id: 'dept-123-uuid',
    department_name: 'Suporte Técnico'
  });
  assert.equal(result.routingMode, 'department');
  assert.equal(result.departmentId, 'dept-123-uuid');
  assert.equal(result.departmentName, 'Suporte Técnico');
});

test('limpa departamento quando roteamento é alterado para geral', () => {
  const result = whatsappService._test.normalizeAccountRouting({
    routing_mode: 'general',
    department_id: 'dept-123-uuid',
    department_name: 'Suporte Técnico'
  });
  assert.equal(result.routingMode, 'general');
  assert.equal(result.departmentId, null);
  assert.equal(result.departmentName, null);
});

test('preserva um departamento padrão individual em conta com menu geral', () => {
  const result = whatsappService._test.normalizeAccountRouting({
    routing_mode: 'general',
    fallback_department_id: 'dept-comercial',
    fallback_department_name: 'Comercial'
  });
  assert.equal(result.routingMode, 'general');
  assert.equal(result.departmentId, null);
  assert.equal(result.fallbackDepartmentId, 'dept-comercial');
  assert.equal(result.fallbackDepartmentName, 'Comercial');
});

test('restaura o roteamento anterior quando a persistência falha', async () => {
  const account = {
    routingMode: 'department',
    departmentId: 'departamento-original',
    departmentName: 'Financeiro'
  };

  await assert.rejects(
    whatsappService._test.applyAccountRoutingWithPersistence(
      account,
      { routingMode: 'general', departmentId: null, departmentName: null },
      async () => { throw new Error('Supabase indisponível'); }
    ),
    /Supabase indisponível/
  );

  assert.deepEqual(account, {
    routingMode: 'department',
    departmentId: 'departamento-original',
    departmentName: 'Financeiro'
  });
});
