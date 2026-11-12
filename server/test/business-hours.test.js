const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBusinessHours, getDepartmentAvailability, formatSchedule } = require('../src/services/business-hours.service');

const schedule = normalizeBusinessHours({
  enabled: true,
  timezone: 'America/Sao_Paulo',
  days: {
    1: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }]
  }
});

test('considera atendimento 24 horas quando a regra está desativada', () => {
  assert.equal(getDepartmentAvailability({ business_hours: { enabled: false } }, new Date('2026-09-07T03:00:00Z')).isOpen, true);
});

test('respeita abertura, almoço e próxima reabertura do departamento', () => {
  assert.equal(getDepartmentAvailability({ business_hours: schedule }, new Date('2026-09-07T12:00:00Z')).isOpen, true); // 09h
  const lunch = getDepartmentAvailability({ business_hours: schedule }, new Date('2026-09-07T15:30:00Z')); // 12h30
  assert.equal(lunch.isOpen, false);
  assert.equal(lunch.nextOpenAt.toISOString(), '2026-09-07T16:00:00.000Z');
});

test('formata os períodos para a mensagem automática', () => {
  assert.match(formatSchedule(schedule), /Segunda-feira: 08:00 às 12:00 e 13:00 às 18:00/);
});
