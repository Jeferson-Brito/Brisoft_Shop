const test = require('node:test');
const assert = require('node:assert/strict');
const wallboardService = require('../src/services/wallboard.service');

const { normalizeConfig, calculateQueueState, calculateHealth } = wallboardService._test;

test('normaliza limites configuráveis do painel TV', () => {
  assert.deepEqual(normalizeConfig({ monthlyTarget: -10, soundCooldownSeconds: 1, warningSlaPercent: 99, criticalQueueSize: 0 }), {
    monthlyTarget: 0,
    soundEnabled: true,
    soundCooldownSeconds: 3,
    warningSlaPercent: 95,
    criticalQueueSize: 5
  });
});

test('classifica fila por proximidade e estouro do SLA exibindo o nome do cliente', () => {
  const now = new Date('2026-08-28T15:00:00Z').getTime();
  const queue = calculateQueueState([
    { id: 'abc-123', client_name: 'Maria Oliveira', status: 'aguardando', created_at: '2026-08-28T14:50:00Z', sla_minutes_target: 15 },
    { id: 'def-456', status: 'aguardando', created_at: '2026-08-28T14:40:00Z', sla_minutes_target: 15 },
    { id: 'ghi-789', status: 'em_atendimento', created_at: '2026-08-28T14:55:00Z' }
  ], 15, normalizeConfig({ warningSlaPercent: 60 }), now);
  assert.equal(queue.waiting, 2);
  assert.equal(queue.handling, 1);
  assert.equal(queue.slaAtRisk, 1);
  assert.equal(queue.slaBreached, 1);
  assert.equal(queue.queue[1].clientName, 'Maria Oliveira');
});

test('prioriza falha de conexão e estouro de SLA na saúde operacional', () => {
  const config = normalizeConfig({ criticalQueueSize: 5 });
  assert.equal(calculateHealth({ queueState: { waiting: 0, slaAtRisk: 0, slaBreached: 0 }, whatsappConnected: false, config }).level, 'critical');
  assert.equal(calculateHealth({ queueState: { waiting: 1, slaAtRisk: 0, slaBreached: 1 }, whatsappConnected: true, config }).level, 'critical');
  assert.equal(calculateHealth({ queueState: { waiting: 0, slaAtRisk: 0, slaBreached: 0 }, whatsappConnected: true, config }).level, 'healthy');
});

test('tempo da fila usa queued_at e não o início da conversa com o bot', () => {
  const now = new Date('2026-08-28T15:00:00Z').getTime();
  const queue = calculateQueueState([
    {
      id: 'queue-real-time', status: 'aguardando',
      created_at: '2026-08-28T14:30:00Z', queued_at: '2026-08-28T14:57:00Z',
      sla_minutes_target: 15
    }
  ], 15, normalizeConfig({ warningSlaPercent: 70 }), now);
  assert.equal(queue.oldestWaitSeconds, 180);
  assert.equal(queue.slaAtRisk, 0);
  assert.equal(queue.slaBreached, 0);
});
