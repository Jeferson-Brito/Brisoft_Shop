function textOf(message) {
  return String(message?.text || '')
}

export function isExplicitBotMessage(message) {
  const text = textOf(message)
  return message?.message_context === 'bot'
    || message?.sender_type === 'bot'
    || message?.sender === 'bot'
    || text.startsWith('[Chatbot]')
    || text.includes('[Chatbot]')
    || /^\[WhatsApp\]\s*Encaminhado diretamente para a fila:/i.test(text)
}

export function classifyBotInteractions(messages = []) {
  const classified = messages.map(message => ({ message, isBotInteraction: isExplicitBotMessage(message) }))
  const indexesByTicket = new Map()

  classified.forEach((item, index) => {
    const ticketId = item.message?.ticket_id || '__current__'
    const indexes = indexesByTicket.get(ticketId) || []
    indexes.push(index)
    indexesByTicket.set(ticketId, indexes)
  })

  for (const indexes of indexesByTicket.values()) {
    const explicitBotIndexes = indexes.filter(index => classified[index].isBotInteraction)
    if (!explicitBotIndexes.length) continue

    const handoffIndex = indexes.find(index => /\[Chatbot\]\s*Cliente escolheu:/i.test(textOf(classified[index].message)))
    const fallbackEnd = explicitBotIndexes[explicitBotIndexes.length - 1]
    const interactionEnd = handoffIndex ?? fallbackEnd

    for (const index of indexes) {
      if (index > interactionEnd) continue
      const message = classified[index].message
      if (message?.sender === 'client') classified[index].isBotInteraction = true
    }
  }

  return classified
}
