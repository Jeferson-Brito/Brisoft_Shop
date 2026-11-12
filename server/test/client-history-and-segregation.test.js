const test = require('node:test');
const assert = require('node:assert/strict');
const ticketService = require('../src/services/ticket.service');

test('Segregação de chats: atendente comum não vê tickets em atendimento de outros atendentes se não for colaborador', async () => {
  const agent1 = { id: 'agent-1', name: 'Lucas Atendente', role: 'agent', department_id: 'dept-1' };
  const agent2 = { id: 'agent-2', name: 'Carla Atendente', role: 'agent', department_id: 'dept-1' };
  const admin = { id: 'admin-1', name: 'Gerente Admin', role: 'admin' };

  // Como o mock de teste opera em memória, validamos as funções de checagem de permissão
  const ticketAssumedByAgent1 = {
    id: 't-123',
    status: 'em_atendimento',
    user_id: 'agent-1',
    agent_name: 'Lucas Atendente',
    department_id: 'dept-1'
  };

  // Agent 1 tem acesso
  const hasAccessAgent1 = await ticketService.canUserAccessTicket(agent1, ticketAssumedByAgent1);
  assert.equal(hasAccessAgent1, true);

  // Agent 2 NÃO tem acesso porque o chat é do Agent 1 e Agent 2 não é colaborador
  const hasAccessAgent2 = await ticketService.canUserAccessTicket(agent2, ticketAssumedByAgent1);
  assert.equal(hasAccessAgent2, false);

  // Admin tem acesso
  const hasAccessAdmin = await ticketService.canUserAccessTicket(admin, ticketAssumedByAgent1);
  assert.equal(hasAccessAdmin, true);
});

test('Segregação de chats: chat aguardando na fila é visível para os atendentes do setor', async () => {
  const agent1 = { id: 'agent-1', name: 'Lucas Atendente', role: 'agent', department_id: 'dept-1' };
  const ticketWaiting = {
    id: 't-waiting',
    status: 'aguardando',
    user_id: null,
    agent_name: null,
    department_id: 'dept-1'
  };

  const canAccess = await ticketService.canUserAccessTicket(agent1, ticketWaiting);
  assert.equal(canAccess, true);
});

test('getClientTicketHistory: executa com segurança mesmo sem banco configurado', async () => {
  const agent1 = { id: 'agent-1', name: 'Lucas Atendente', role: 'agent', department_id: 'dept-1' };
  const res = await ticketService.getClientTicketHistory(agent1, 'non-existent-ticket-id');
  assert.ok(Array.isArray(res));
});
