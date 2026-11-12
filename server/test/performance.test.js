const test = require('node:test');
const assert = require('node:assert/strict');
const performanceService = require('../src/services/performance.service');

test('calcula o intervalo mensal sem misturar o mês seguinte', () => {
  const august = performanceService._test.parseMonth('2026-08', new Date(2026, 7, 15));
  assert.equal(august.key, '2026-08');
  assert.equal(august.previousKey, '2026-07');
  assert.equal(august.days, 31);
  assert.equal(august.isCurrent, true);
});

test('calcula indicadores reais de atendimentos, SLA e avaliações', () => {
  const ticket = {
    id: '1', agent_name: 'Ana', encerrado_por: 'Ana', status: 'finalizado',
    created_at: '2026-08-01T10:00:00Z', assumed_at: '2026-08-01T10:05:00Z',
    closed_at: '2026-08-01T10:35:00Z', sla_minutes_target: 10
  };
  const metrics = performanceService._test.calculateMetrics({
    createdTickets: [ticket], closedTickets: [ticket], activeTickets: [],
    ratings: [{ agent_name: 'Ana', score: 5 }],
    period: { days: 31, isCurrent: false }, agent: { name: 'Ana' }
  });
  assert.equal(metrics.total, 1);
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.tma, '00:30:00');
  assert.equal(metrics.tme, '00:05:00');
  assert.equal(metrics.slaPercent, 100);
  assert.equal(metrics.ratingAverage, 5);
});

test('inverte a comparação de tempos porque menor é melhor', () => {
  const comparison = performanceService._test.buildComparison(
    { total: 12, completed: 10, tmaSeconds: 60, tmeSeconds: 30, slaPercent: 95, ratingAverage: 4.8, satisfactionPercent: 90 },
    { total: 10, completed: 8, tmaSeconds: 120, tmeSeconds: 60, slaPercent: 90, ratingAverage: 4.5, satisfactionPercent: 80 }
  );
  assert.equal(comparison.total, 20);
  assert.equal(comparison.tma, 50);
  assert.equal(comparison.sla, 5);
});

test('calcula o TME a partir da entrada real na fila', () => {
  const ticket = {
    id: 'queue-time', status: 'finalizado',
    created_at: '2026-08-01T10:00:00Z', queued_at: '2026-08-01T10:03:00Z',
    assumed_at: '2026-08-01T10:05:00Z', closed_at: '2026-08-01T10:15:00Z'
  };
  const metrics = performanceService._test.calculateMetrics({
    createdTickets: [ticket], closedTickets: [ticket], activeTickets: [], ratings: [],
    period: { days: 31, isCurrent: false }
  });
  assert.equal(metrics.tme, '00:02:00');
});

test('atendimentos de funcionários não entram nos indicadores de clientes', () => {
  const customer = {
    id: 'customer', is_employee: false, agent_name: 'Ana', status: 'finalizado',
    created_at: '2026-08-01T10:00:00Z', assumed_at: '2026-08-01T10:02:00Z', closed_at: '2026-08-01T10:12:00Z'
  };
  const employee = {
    id: 'employee', is_employee: true, agent_name: 'Ana', status: 'finalizado',
    created_at: '2026-08-01T11:00:00Z', assumed_at: '2026-08-01T11:01:00Z', closed_at: '2026-08-01T11:03:00Z'
  };
  const metrics = performanceService._test.calculateMetrics({
    createdTickets: [customer, employee],
    closedTickets: [customer, employee],
    activeTickets: [],
    ratings: [
      { ticket_id: customer.id, agent_name: 'Ana', score: 5 },
      { ticket_id: employee.id, agent_name: 'Ana', score: 1 }
    ],
    period: { days: 31, isCurrent: false }
  });

  assert.equal(metrics.total, 1);
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.ratingAverage, 5);
  assert.equal(metrics.ratingCount, 1);
});

test('grupos do WhatsApp não entram nos indicadores', () => {
  assert.equal(performanceService._test.isCustomerTicket({ is_employee: false, is_group: true }), false);
  assert.equal(performanceService._test.isCustomerTicket({ is_employee: false, is_group: false }), true);
});

test('calcula atendimentos e média de avaliação diária por atendente', () => {
  const daily = performanceService._test.calculateDailyAgentStats({
    closedTickets: [
      { id: 'today-1', user_id: 'agent-1', status: 'finalizado', closed_at: '2026-09-02T13:00:00Z' },
      { id: 'today-2', agent_name: 'Ana', status: 'finalizado', closed_at: '2026-09-02T16:00:00Z' },
      { id: 'yesterday', agent_name: 'Ana', status: 'finalizado', closed_at: '2026-09-01T16:00:00Z' },
      { id: 'employee', agent_name: 'Ana', is_employee: true, status: 'finalizado', closed_at: '2026-09-02T17:00:00Z' }
    ],
    ratings: [
      { ticket_id: 'today-1', agent_name: 'Ana', score: 5, created_at: '2026-09-02T14:00:00Z' },
      { ticket_id: 'today-2', agent_name: 'Ana', score: 3, created_at: '2026-09-02T17:00:00Z' },
      { ticket_id: 'yesterday', agent_name: 'Ana', score: 1, created_at: '2026-09-01T17:00:00Z' },
      { ticket_id: 'employee', agent_name: 'Ana', score: 1, created_at: '2026-09-02T18:00:00Z' }
    ],
    agent: { id: 'agent-1', name: 'Ana' },
    dateKey: '2026-09-02'
  });

  assert.equal(daily.completed, 2);
  assert.equal(daily.ratingAverage, 4);
  assert.equal(daily.ratingCount, 2);
});

test('permite invalidar o cache de desempenho em memória', () => {
  assert.doesNotThrow(() => {
    performanceService.clearCache();
    performanceService.clearCurrentMonthCache();
    performanceService._test.clearPerformanceCache();
    performanceService._test.clearCurrentMonthCache();
  });
});

test('pagina registros sem depender de count do PostgREST', async () => {
  const calls = [];
  const rows = await performanceService._test.fetchAll(() => ({
    range(from, to) {
      calls.push([from, to]);
      return Promise.resolve({
        data: from === 0 ? Array.from({ length: 1000 }, (_, index) => ({ id: index })) : [{ id: 1000 }],
        error: null
      });
    }
  }));

  assert.equal(rows.length, 1001);
  assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
});
