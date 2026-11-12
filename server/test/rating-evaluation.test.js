const test = require('node:test');
const assert = require('node:assert/strict');
const ticketService = require('../src/services/ticket.service');

test('parseRatingInput reconhece notas válidas e variações com estrelas sem confundir com frases', () => {
  const { parseRatingInput } = ticketService._test;

  assert.equal(parseRatingInput('5'), 5);
  assert.equal(parseRatingInput(' 5 '), 5);
  assert.equal(parseRatingInput('5 ⭐'), 5);
  assert.equal(parseRatingInput('5 estrelas'), 5);
  assert.equal(parseRatingInput('5 estrela'), 5);
  assert.equal(parseRatingInput('5*'), 5);
  assert.equal(parseRatingInput('1'), 1);

  // Não confunde com frases ou outros números
  assert.equal(parseRatingInput('5 caixas chegaram hoje'), null);
  assert.equal(parseRatingInput('10'), null);
  assert.equal(parseRatingInput('opcao 5'), null);
  assert.equal(parseRatingInput(null), null);
  assert.equal(parseRatingInput(''), null);
});

test('isRatingEligibleTicket aceita avaliação após 45min quando o ticket está aguardando avaliação (awaiting_rating: true)', () => {
  const { isRatingEligibleTicket } = ticketService._test;
  const nowMs = Date.now();

  // Caso da Lídia: ticket finalizado há 74 minutos, awaiting_rating: true
  const ticketLidia = {
    id: 'c977c1d3-c03c-413e-8d6d-d70a8479cae3',
    status: 'finalizado',
    updated_at: new Date(nowMs - 74 * 60 * 1000).toISOString(),
    is_employee: false,
    awaiting_rating: true
  };
  assert.equal(isRatingEligibleTicket(ticketLidia, 45, nowMs), true);

  // Se já foi avaliado anteriormente (awaiting_rating: false) e passou da janela (74min > 45min):
  const ticketAlreadyRated = {
    id: 'ticket-2',
    status: 'finalizado',
    updated_at: new Date(nowMs - 74 * 60 * 1000).toISOString(),
    is_employee: false,
    awaiting_rating: false
  };
  assert.equal(isRatingEligibleTicket(ticketAlreadyRated, 45, nowMs), false);

  // Dentro da janela de 45 minutos (ex: 30min), é válido mesmo que awaiting_rating seja falso/legado:
  const ticketWithinWindow = {
    id: 'ticket-3',
    status: 'finalizado',
    updated_at: new Date(nowMs - 30 * 60 * 1000).toISOString(),
    is_employee: false,
    awaiting_rating: false
  };
  assert.equal(isRatingEligibleTicket(ticketWithinWindow, 45, nowMs), true);

  // Passou de 24 horas (ex: 26 horas): não é mais elegível
  const ticketExpiredDay = {
    id: 'ticket-4',
    status: 'finalizado',
    updated_at: new Date(nowMs - 26 * 60 * 60 * 1000).toISOString(),
    is_employee: false,
    awaiting_rating: true
  };
  assert.equal(isRatingEligibleTicket(ticketExpiredDay, 45, nowMs), false);

  // Atendimento de funcionário nunca é elegível a avaliação
  const ticketEmployee = {
    id: 'ticket-5',
    status: 'finalizado',
    updated_at: new Date(nowMs - 10 * 60 * 1000).toISOString(),
    is_employee: true,
    awaiting_rating: true
  };
  assert.equal(isRatingEligibleTicket(ticketEmployee, 45, nowMs), false);
});
