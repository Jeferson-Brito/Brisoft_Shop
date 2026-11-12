const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBotInput,
  matchesCustomerCancellation,
  matchesHumanHandoff,
  matchesMenuRequest,
  matchesNewServiceRequest,
  matchesExternalClosureMessage,
  extractMenuOption,
  resolveDepartmentIntent,
  resolveNameConfirmation,
  resolveResumeChoice,
  messageWasSentBeforePrompt
} = require('../src/services/bot-intent.service');

const keywords = 'cancelar,encerrar,sair,parar,desistir,finalizar,0,não quero mais,cancelar atendimento';

test('normaliza acentos, pontuação e caracteres invisíveis', () => {
  assert.equal(normalizeBotInput('  NÃO\u200B quero mais!  '), 'nao quero mais');
});

test('reconhece cancelamento direto e frases naturais', () => {
  for (const message of ['cancelar', '0', 'Pode cancelar', 'não quero mais atendimento', 'não preciso mais', 'deixa pra lá', 'quero encerrar o chamado']) {
    assert.equal(matchesCustomerCancellation(message, keywords), true, message);
  }
});

test('não confunde negação ou dúvida com pedido de cancelamento', () => {
  for (const message of ['não quero cancelar', 'como cancelar um boleto?', 'talvez eu cancele depois', 'continuar atendimento']) {
    assert.equal(matchesCustomerCancellation(message, keywords), false, message);
  }
});

test('entende respostas naturais para opções e retomada', () => {
  assert.equal(extractMenuOption('quero a opção 2', 5), 2);
  assert.equal(extractMenuOption('número 3', 5), 3);
  assert.equal(resolveResumeChoice('quero continuar no mesmo'), 'resume');
  assert.equal(resolveResumeChoice('prefiro outro departamento'), 'other');
  assert.equal(resolveResumeChoice('6'), null, 'número de departamento não é válido no menu de retomada');
  assert.equal(resolveNameConfirmation('sim, está certo'), 'confirm');
  assert.equal(resolveNameConfirmation('não, quero corrigir'), 'correct');
});

test('reconhece departamento por número, frase, sigla, sinônimo e pequeno erro', () => {
  const departments = [
    { id: '1', name: 'Financeiro' },
    { id: '2', name: 'Recursos Humanos' },
    { id: '3', name: 'Suporte Técnico' }
  ];
  assert.equal(resolveDepartmentIntent('opção 2', departments).department.name, 'Recursos Humanos');
  assert.equal(resolveDepartmentIntent('quero falar com o RH', departments).department.name, 'Recursos Humanos');
  assert.equal(resolveDepartmentIntent('preciso de um boleto', departments).department.name, 'Financeiro');
  assert.equal(resolveDepartmentIntent('financeirro', departments).department.name, 'Financeiro');
  assert.equal(resolveDepartmentIntent('uma coisa qualquer', departments), null);
});

test('reconhece pedido humano e menu sem aceitar negações', () => {
  assert.equal(matchesHumanHandoff('quero falar com uma pessoa'), true);
  assert.equal(matchesHumanHandoff('quero um atendente'), true);
  assert.equal(matchesHumanHandoff('não quero falar com atendente'), false);
  assert.equal(matchesMenuRequest('pode mostrar o menu?'), true);
  assert.equal(matchesMenuRequest('começar de novo'), true);
  assert.equal(matchesMenuRequest('oi, tudo bem?'), true);
});

test('distingue novo atendimento e encerramento de uma saudação comum', () => {
  assert.equal(matchesNewServiceRequest('oiii'), false);
  assert.equal(matchesNewServiceRequest('quero falar com outro departamento'), true);
  assert.equal(matchesNewServiceRequest('novo atendimento'), true);
  assert.equal(matchesExternalClosureMessage('Seu atendimento foi finalizado.'), true);
  assert.equal(matchesExternalClosureMessage('Finalizamos o seu atendimento'), true);
  assert.equal(matchesExternalClosureMessage('O atendimento não foi encerrado'), false);
});

test('identifica mensagem enviada antes de o prompt ficar disponível', () => {
  const promptedAt = '2026-08-28T12:00:02.000Z';
  assert.equal(messageWasSentBeforePrompt(1787918400, promptedAt, 3), true);
  assert.equal(messageWasSentBeforePrompt(1787918410, promptedAt, 3), false);
  assert.equal(messageWasSentBeforePrompt(null, promptedAt, 3), false);
});
