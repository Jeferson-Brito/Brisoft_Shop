const test = require('node:test');
const assert = require('node:assert/strict');

const cloudStorage = require('../src/services/cloud-storage.service');

test('empacota e restaura todos os arquivos da sessão com verificação de integridade', () => {
  const source = [
    { name: 'creds.json', buffer: Buffer.from('{"registered":true}') },
    { name: 'pre-key-1.json', buffer: Buffer.from('{"key":1}') }
  ];
  const restored = cloudStorage._test.parseSessionSnapshot(cloudStorage._test.createSessionSnapshot(source));
  assert.deepEqual(restored.map(file => file.name), ['creds.json', 'pre-key-1.json']);
  assert.equal(restored[0].buffer.toString(), source[0].buffer.toString());
  assert.equal(restored[1].buffer.toString(), source[1].buffer.toString());
});

test('recusa pacote de sessão alterado ou corrompido', () => {
  const snapshot = cloudStorage._test.createSessionSnapshot([
    { name: 'creds.json', buffer: Buffer.from('{}') }
  ]);
  snapshot[Math.floor(snapshot.length / 2)] ^= 0xff;
  assert.throws(() => cloudStorage._test.parseSessionSnapshot(snapshot));
});
