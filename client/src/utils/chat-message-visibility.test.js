import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyBotInteractions } from './chat-message-visibility.js'

test('oculta a conversa inicial com o bot e mantém mensagens posteriores à fila', () => {
    const messages = [
      { id: '1', ticket_id: 't1', sender: 'client', text: 'oi' },
      { id: '2', ticket_id: 't1', sender: 'bot', text: 'Escolha um setor' },
      { id: '3', ticket_id: 't1', sender: 'client', text: '6' },
      { id: '4', ticket_id: 't1', sender: 'system', text: '[Chatbot] Cliente escolheu: Recursos Humanos' },
      { id: '5', ticket_id: 't1', sender: 'bot', text: 'Atendimento encaminhado' },
      { id: '6', ticket_id: 't1', sender: 'client', text: 'Ainda estou aguardando' }
    ]
    const result = classifyBotInteractions(messages)
  assert.equal(result.slice(0, 5).every(item => item.isBotInteraction), true)
  assert.equal(result[5].isBotInteraction, false)
})

test('usa a classificação persistida quando disponível', () => {
    const result = classifyBotInteractions([
      { sender: 'client', text: 'Meu nome é Ana', message_context: 'bot' },
      { sender: 'client', text: 'Preciso de ajuda', message_context: 'service' }
    ])
  assert.deepEqual(result.map(item => item.isBotInteraction), [true, false])
})

test('reconhece também o histórico legado de um WhatsApp dedicado', () => {
  const result = classifyBotInteractions([
    { id: '1', ticket_id: 'dedicado', sender: 'client', text: 'Boa tarde' },
    { id: '2', ticket_id: 'dedicado', sender: 'system', text: '[WhatsApp] Encaminhado diretamente para a fila: Suporte Técnico' },
    { id: '3', ticket_id: 'dedicado', sender: 'bot', text: 'Seu atendimento foi encaminhado.' },
    { id: '4', ticket_id: 'dedicado', sender: 'client', text: 'Preciso de ajuda com o sistema', message_context: 'service' }
  ])
  assert.deepEqual(result.map(item => item.isBotInteraction), [true, true, true, false])
})
