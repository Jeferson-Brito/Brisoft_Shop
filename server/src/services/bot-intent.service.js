function normalizeBotInput(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseConfiguredKeywords(value, fallback = '') {
  return String(value || fallback)
    .split(',')
    .map(normalizeBotInput)
    .filter(Boolean);
}

function containsPhrase(input, phrase) {
  return (` ${input} `).includes(` ${phrase} `);
}

function levenshteinDistance(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function extractMenuOption(value, optionCount) {
  const input = normalizeBotInput(value);
  if (!input || !Number.isInteger(optionCount) || optionCount < 1) return null;
  if (/^\d+$/.test(input)) {
    const option = Number.parseInt(input, 10);
    return option >= 1 && option <= optionCount ? option : null;
  }
  const match = input.match(/\b(?:opcao|numero|n|escolho|escolher|quero|prefiro)\s*(?:de\s+)?(\d{1,2})\b/);
  if (!match) return null;
  const option = Number.parseInt(match[1], 10);
  return option >= 1 && option <= optionCount ? option : null;
}

function departmentAliases(departmentName) {
  const name = normalizeBotInput(departmentName);
  const aliases = new Set([name]);
  const words = name.split(' ').filter(word => word.length > 2 && !['com', 'para', 'dos', 'das'].includes(word));
  if (words.length > 1) aliases.add(words.map(word => word[0]).join(''));
  if (name.includes('recursos humanos')) ['rh', 'pessoal'].forEach(alias => aliases.add(alias));
  if (name.includes('financeir')) ['financeiro', 'financas', 'cobranca', 'boleto', 'pagamento'].forEach(alias => aliases.add(alias));
  if (name.includes('suporte') || name.includes('tecnic')) ['suporte', 'ajuda tecnica', 'assistencia tecnica', 'ti'].forEach(alias => aliases.add(alias));
  if (name.includes('comercial')) ['comercial', 'vendas', 'vendedor', 'orcamento'].forEach(alias => aliases.add(alias));
  if (name.includes('suprimentos')) ['suprimentos', 'compras', 'fornecedor'].forEach(alias => aliases.add(alias));
  if (name.includes('operacional')) ['operacional', 'operacao'].forEach(alias => aliases.add(alias));
  return [...aliases].filter(Boolean);
}

function routingSubject(value) {
  return normalizeBotInput(value)
    .replace(/\b(?:eu\s+)?(?:quero|gostaria|preciso|desejo|poderia|pode|favor)\b/g, ' ')
    .replace(/\b(?:falar|conversar|ser atendido|atendimento|encaminhar|transferir|direcionar|ir)\b/g, ' ')
    .replace(/\b(?:com|pelo|pela|para|pro|ao|a|o|de|do|da|no|na|setor|departamento|area)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDepartmentIntent(value, departments = [], { acceptDepartmentName = true } = {}) {
  const input = normalizeBotInput(value);
  if (!input || !Array.isArray(departments) || departments.length === 0) return null;

  const option = extractMenuOption(input, departments.length);
  if (option) return { department: departments[option - 1], source: 'option', confidence: 1 };
  if (!acceptDepartmentName) return null;

  const subject = routingSubject(input) || input;
  const scored = departments.map(department => {
    const name = normalizeBotInput(department.name);
    let score = 0;
    let source = null;
    if (input === name || subject === name) {
      score = 100;
      source = 'exact';
    } else if (containsPhrase(input, name)) {
      score = 92;
      source = 'phrase';
    }

    for (const alias of departmentAliases(name)) {
      if (subject === alias || input === alias) {
        if (score < 88) { score = 88; source = 'alias'; }
      } else if (alias.length >= 3 && containsPhrase(input, alias)) {
        if (score < 78) { score = 78; source = 'alias_phrase'; }
      } else if (alias.length >= 5 && subject.length >= 5 && levenshteinDistance(subject, alias) <= (alias.length >= 9 ? 2 : 1)) {
        if (score < 70) { score = 70; source = 'typo'; }
      }
    }
    return { department, score, source };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored[1] && scored[1].score === scored[0].score) return null;
  return { department: scored[0].department, source: scored[0].source, confidence: scored[0].score / 100 };
}

function matchesHumanHandoff(value, configured = '') {
  const input = normalizeBotInput(value);
  if (!input) return false;
  if (/\bnao\s+(?:quero|preciso|desejo)\s+(?:falar\s+com\s+)?(?:atendente|humano|pessoa)\b/.test(input)) return false;
  const keywords = parseConfiguredKeywords(configured, 'atendente,humano,pessoa,falar com alguem');
  if (keywords.some(keyword => input === keyword || (keyword.includes(' ') && containsPhrase(input, keyword)))) return true;
  return [
    /\b(?:quero|preciso|chama|chamar)\s+(?:um\s+|uma\s+)?(?:atendente|humano|pessoa)\b/,
    /\b(?:quero|preciso|gostaria|desejo|posso|pode)\s+(?:falar|conversar)\s+com\s+(?:um\s+|uma\s+)?(?:atendente|humano|pessoa|alguem)\b/,
    /\b(?:me\s+)?(?:transfere|encaminha|direciona|coloca)\s+(?:para|pra|pro|a|ao)?\s*(?:um\s+|uma\s+)?(?:atendente|humano|pessoa)\b/,
    /\batendimento\s+humano\b/
  ].some(pattern => pattern.test(input));
}

function matchesMenuRequest(value, configured = '') {
  const input = normalizeBotInput(value);
  if (!input) return false;
  const keywords = parseConfiguredKeywords(configured, 'oi,ola,bom dia,boa tarde,boa noite,menu,inicio,ajuda');
  const greetingKeywords = new Set(['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite']);
  if (keywords.some(keyword => input === keyword || (greetingKeywords.has(keyword) && input.startsWith(`${keyword} `)))) return true;
  return /\b(?:mostrar|abrir|voltar|retornar|ver)\s+(?:ao\s+|o\s+|para\s+o\s+)?menu\b/.test(input)
    || /\b(?:comecar|iniciar)\s+(?:de\s+)?novo\b/.test(input)
    || /\b(?:ver|escolher)\s+(?:as\s+)?opcoes\b/.test(input);
}

function matchesNewServiceRequest(value, configured = '') {
  const input = normalizeBotInput(value);
  if (!input) return false;
  const keywords = parseConfiguredKeywords(configured, 'menu,novo atendimento,outro departamento,mudar departamento,falar com outro setor');
  if (keywords.some(keyword => input === keyword || (keyword.includes(' ') && containsPhrase(input, keyword)))) return true;
  return /\b(?:quero|preciso|gostaria)\s+(?:de\s+)?(?:um\s+)?novo\s+atendimento\b/.test(input)
    || /\b(?:quero|preciso|gostaria)\s+(?:falar|ir|mudar)\s+(?:com|para|pra|pro|de)?\s*(?:um\s+)?outro\s+(?:setor|departamento)\b/.test(input);
}

function matchesExternalClosureMessage(value) {
  const input = normalizeBotInput(value);
  if (!input || /\bnao\s+(?:foi|esta|sera)?\s*(?:encerrado|finalizado)\b/.test(input)) return false;
  return /\b(?:atendimento|chamado|conversa)\s+(?:foi\s+|esta\s+)?(?:encerrado|finalizado|concluido)\b/.test(input)
    || /\b(?:encerramos|finalizamos|concluimos)\s+(?:(?:o|a|seu|sua)\s+){0,2}(?:atendimento|chamado|conversa)\b/.test(input);
}

function resolveNameConfirmation(value) {
  const input = normalizeBotInput(value);
  if (!input) return null;
  if (/^(?:1|sim|s|correto|isso|confirmo|certo|esta certo|ta certo|sim correto|sim esta certo)$/.test(input)) return 'confirm';
  if (/^(?:2|nao|n|corrigir|correcao|errado|esta errado|ta errado|nao esta certo|quero corrigir)$/.test(input)) return 'correct';
  if (/^(?:sim|isso|correto|certo)\b.*\b(?:certo|correto|isso)?$/.test(input)) return 'confirm';
  if (/^(?:nao\b.*\b(?:corrigir|errado|correcao)|quero\s+corrigir\b)/.test(input)) return 'correct';
  return null;
}

function resolveResumeChoice(value) {
  const input = normalizeBotInput(value);
  if (!input) return null;
  if (/^(?:1|sim|continuar|retomar|mesmo|anterior|continuar no mesmo|mesmo departamento|setor anterior)$/.test(input)) return 'resume';
  if (/^(?:2|outro|novo|mudar|diferente|outro departamento|escolher outro|quero mudar|mudar de setor)$/.test(input)) return 'other';
  if (/\b(?:continuar|retomar|voltar)\b.*\b(?:mesmo|anterior|setor|departamento)\b/.test(input)) return 'resume';
  if (/\b(?:prefiro|quero|escolher|mudar|ir para)\b.*\b(?:outro|novo|diferente)\b/.test(input)) return 'other';
  return null;
}

function matchesCustomerCancellation(value, configured = '') {
  const input = normalizeBotInput(value);
  if (!input) return false;

  // Evita encerrar quando o cliente nega explicitamente a intenção de cancelar.
  if (/\bnao\s+(quero|desejo|preciso)\s+(cancelar|encerrar|parar|finalizar)\b/.test(input)) {
    return false;
  }

  const keywords = parseConfiguredKeywords(configured, 'cancelar,encerrar,sair,parar,desistir,finalizar,0');

  if (keywords.some(keyword => input === keyword)) return true;

  const explicitIntentPatterns = [
    /\b(quero|desejo|pode|favor|gostaria de)\s+(cancelar|encerrar|finalizar|parar)\b/,
    /\b(cancela|cancelar|encerra|encerrar|finaliza|finalizar)\s+(o\s+)?(atendimento|chamado|conversa)\b/,
    /\b(nao quero mais|nao preciso mais|desisti|deixa pra la|deixe pra la|pode parar)\b/,
    /\b(quero sair|desejo sair|sair do atendimento)\b/
  ];
  if (explicitIntentPatterns.some(pattern => pattern.test(input))) return true;

  // Frases configuradas com duas ou mais palavras são intenções explícitas.
  return keywords.some(keyword => keyword.includes(' ') && input.includes(keyword));
}

function whatsappTimestampMs(value) {
  if (value === null || value === undefined) return null;
  let numeric;
  try {
    if (typeof value === 'object' && typeof value.toNumber === 'function') numeric = value.toNumber();
    else if (typeof value === 'object' && Number.isFinite(value.low)) numeric = value.low;
    else numeric = Number(value);
  } catch (_) {
    return null;
  }
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

function messageWasSentBeforePrompt(messageTimestamp, promptedAt, graceSeconds = 3) {
  const messageMs = whatsappTimestampMs(messageTimestamp);
  const promptMs = new Date(promptedAt || 0).getTime();
  if (!messageMs || !Number.isFinite(promptMs) || promptMs <= 0) return false;
  const grace = Number(graceSeconds);
  if (!Number.isFinite(grace) || grace <= 0) return false;
  const graceMs = grace * 1000;
  return messageMs <= promptMs + graceMs;
}

module.exports = {
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
  messageWasSentBeforePrompt,
  whatsappTimestampMs,
  _test: { levenshteinDistance, routingSubject, departmentAliases }
};
