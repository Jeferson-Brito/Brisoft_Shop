const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAudioPayload } = require('../src/services/media-payload.service');

test('envia gravação MP4 como áudio normal compatível', () => {
  const buffer = Buffer.from('audio');
  assert.deepEqual(buildAudioPayload(buffer, 'audio/mp4;codecs=opus', true), {
    audio: buffer,
    mimetype: 'audio/mp4',
    ptt: false
  });
});

test('só ativa PTT quando solicitado explicitamente com OGG/Opus', () => {
  const payload = buildAudioPayload(Buffer.from('audio'), 'audio/ogg', true);
  assert.equal(payload.mimetype, 'audio/ogg; codecs=opus');
  assert.equal(payload.ptt, true);
});

test('mantém áudio anexado como reprodução normal', () => {
  const payload = buildAudioPayload(Buffer.from('audio'), 'audio/mpeg', false);
  assert.equal(payload.mimetype, 'audio/mpeg');
  assert.equal(payload.ptt, false);
});
