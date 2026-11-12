const test = require('node:test');
const assert = require('node:assert/strict');

const ticketService = require('../src/services/ticket.service');

test('formata horários no fuso da empresa mesmo quando o servidor está em UTC', () => {
  assert.equal(ticketService._test.APP_TIME_ZONE, 'America/Sao_Paulo');
  assert.equal(ticketService._test.makeTimeStr(new Date('2026-08-31T17:24:00.000Z')), '14:24');
});
