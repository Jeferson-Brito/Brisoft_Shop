const { supabase, isSupabaseConfigured } = require('../config/supabase');

const BOT_CONFIG_CACHE_TTL_MS = 60 * 1000;
let botConfigCache = null;
let botConfigCacheExpiresAt = 0;
let botConfigLoadPromise = null;

const DEFAULT_BOT_CONFIG = Object.freeze({
  enabled: true,
  default_department_id: null,
  show_department_menu: true,
  accept_department_name: true,
  resume_recent_enabled: true,
  resume_window_hours: 24,
  rating_window_minutes: 45,
  invalid_attempt_limit: 3,
  rapid_message_grace_seconds: 3,
  auto_close_external_service: true,
  external_service_idle_minutes: 60,
  send_rating_on_external_inactivity: true,
  auto_route_after_invalid: true,
  send_queue_confirmation: true,
  send_transfer_notice: true,
  send_rating_request: true,
  allow_agent_toggle_rating: false,
  accept_media_during_routing: true,
  human_handoff_enabled: true,
  allow_customer_cancel: true,
  collect_customer_name: true,
  require_customer_last_name: false,
  customer_name_attempt_limit: 3,
  menu_keywords: 'oi,olá,ola,bom dia,boa tarde,boa noite,menu,início,inicio,ajuda',
  human_handoff_keywords: 'atendente,humano,pessoa,falar com alguém,falar com alguem',
  cancel_keywords: 'cancelar,encerrar,sair,parar,desistir,finalizar,0,0️⃣,cancelar atendimento,encerrar atendimento,nao quero mais,não quero mais',
  restart_service_keywords: 'menu,novo atendimento,outro departamento,mudar departamento,falar com outro setor,falar com outro departamento',
  greeting_message: 'Olá, *{nome}*! 👋\n\nBem-vindo ao atendimento do *Grupo Combate*.\n\n🏢 *Com qual departamento deseja falar?*\n\n{opcoes}\n\n_Responda com o número ou o nome do departamento._',
  disabled_routing_message: 'Olá, *{nome}*! 👋\n\n📩 Recebemos sua mensagem e encaminhamos seu atendimento para *{departamento}*.\n\n_Aguarde um momento. Um de nossos atendentes responderá em breve._',
  fallback_routing_message: '🔄 *Atendimento encaminhado*\n\n{nome}, para agilizar seu atendimento, direcionamos sua conversa para *{departamento}*.\n\n_Um atendente responderá em breve._',
  human_handoff_message: '👤 *Atendimento humano solicitado*\n\nEntendido, {nome}! Encaminhamos sua conversa para *{departamento}*.\n\n_Um atendente continuará o atendimento._',
  customer_cancel_message: '🚫 *Atendimento encerrado*\n\n{nome}, seu atendimento foi cancelado conforme solicitado.\n\nSe precisar de ajuda novamente no futuro, basta nos enviar uma nova mensagem! Tenha um ótimo dia! 👋',
  ask_customer_name_message: 'Olá! 👋\n\nAntes de continuarmos, *qual é o seu nome?*\n\n_Digite apenas seu nome, por favor._',
  invalid_customer_name_message: '⚠️ *Não consegui identificar um nome válido.*\n\nDigite apenas seu nome, sem números ou outras informações.\n\n_Tentativa {tentativa} de {limite}._',
  confirm_customer_name_message: 'Só para confirmar: seu nome é *{nome}*?\n\n1️⃣  Sim\n2️⃣  Corrigir\n\n_Responda com 1 ou 2._',
  customer_name_saved_message: '✅ Obrigado, *{nome}*! Seu nome foi confirmado.',
  customer_name_skipped_message: 'Tudo bem! 👍\n\nVamos continuar sem salvar seu nome.',
  resume_message: 'Olá, *{nome}*! 👋\n\nVocê foi atendido recentemente pelo setor *{departamento}*. Deseja continuar por lá?\n\n1️⃣  Continuar com {departamento}\n2️⃣  Escolher outro departamento\n\n_Responda com 1 ou 2._',
  invalid_option_message: '⚠️ *Não consegui identificar o departamento.*\n\nEscolha uma das opções abaixo:\n\n{opcoes}\n\n_Tentativa {tentativa} de {limite}._',
  media_during_routing_message: '📎 Recebi seu arquivo. Antes de continuar, preciso saber o departamento desejado:\n\n{opcoes}\n\n_Responda com o número ou o nome do departamento._',
  queue_confirmation_message: '✅ *Atendimento encaminhado*\n\n{nome}, sua conversa foi direcionada para *{departamento}*.\n\n_Aguarde um momento. Um de nossos especialistas responderá em breve._',
  transfer_message: '🔄 *Atendimento transferido*\n\n{nome}, sua conversa foi direcionada para *{departamento}*.\n\n_Um atendente continuará o atendimento em breve._',
  rating_request_message: '✅ *Atendimento encerrado*\n\n{nome}, como você avalia o atendimento recebido?\n\n1️⃣  Muito insatisfeito\n2️⃣  Insatisfeito\n3️⃣  Regular\n4️⃣  Satisfeito\n5️⃣  Muito satisfeito\n\n_Responda apenas com um número de 1 a 5._',
  rating_thank_you_message: 'Obrigado pela sua avaliação, *{nome}*! {estrelas}\n\n_Sua opinião é muito importante para melhorarmos nosso atendimento._'
});

const LEGACY_DEFAULT_MESSAGES = Object.freeze({
  greeting_message: 'Olá, {nome}! Bem-vindo à nossa central de atendimento.\n\nCom qual departamento deseja falar?\n\n{opcoes}\n\nResponda com o número ou nome do departamento.',
  disabled_routing_message: 'Olá, {nome}! Recebemos sua mensagem e encaminhamos seu atendimento para {departamento}. Aguarde um de nossos atendentes.',
  fallback_routing_message: 'Para agilizar seu atendimento, encaminhei sua conversa para {departamento}. Um atendente responderá em breve.',
  human_handoff_message: 'Entendido! Encaminhei sua conversa para {departamento}. Um atendente continuará o atendimento.',
  customer_cancel_message: 'Seu atendimento foi cancelado conforme solicitado. Caso precise, envie uma nova mensagem.',
  ask_customer_name_message: 'Antes de continuarmos, qual é o seu nome?\n\nDigite apenas seu nome, por favor.',
  invalid_customer_name_message: 'Não consegui identificar um nome válido. Digite apenas seu nome, sem números ou outras informações.\n\nTentativa {tentativa} de {limite}.',
  confirm_customer_name_message: 'Entendi que seu nome é *{nome}*. Está correto?\n\n1️⃣ - Sim\n2️⃣ - Corrigir',
  customer_name_saved_message: 'Obrigado, {nome}! Seu nome foi confirmado.',
  customer_name_skipped_message: 'Tudo bem, vamos continuar sem salvar seu nome.',
  resume_message: 'Olá, {nome}! Você foi atendido recentemente pelo setor {departamento}.\n\n1️⃣ - Continuar com {departamento}\n2️⃣ - Escolher outro departamento\n\nResponda com 1 ou 2.',
  invalid_option_message: '⚠️ Não consegui identificar o departamento. Escolha uma das opções abaixo:\n\n{opcoes}\n\nTentativa {tentativa} de {limite}.',
  media_during_routing_message: 'Recebi seu arquivo, mas primeiro preciso saber o departamento desejado. Escolha uma opção:\n\n{opcoes}',
  queue_confirmation_message: '✅ Atendimento encaminhado para {departamento}. Aguarde um momento; um de nossos especialistas responderá em breve.',
  transfer_message: '🔄 Seu atendimento foi transferido para {departamento}. Um atendente continuará a conversa em breve.',
  rating_request_message: '✅ Seu atendimento foi encerrado!\n\nComo você avalia o atendimento recebido? Responda apenas com um número de 1 a 5.',
  rating_thank_you_message: 'Obrigado pela sua avaliação! {estrelas}\n\nSua opinião é muito importante para melhorarmos nosso atendimento.'
});

const LEGACY_FORMATTED_MESSAGE_VARIANTS = Object.freeze({
  greeting_message: 'Olá, *{nome}*! Bem-vindo ao atendimento do Grupo Combate.\n\nCom qual departamento deseja falar?\n\n{opcoes}\n\nResponda com o número ou nome do departamento.',
  disabled_routing_message: 'Olá, *{nome}*! Recebemos sua mensagem e encaminhamos seu atendimento para *{departamento}*. Aguarde um de nossos atendentes.',
  fallback_routing_message: 'Para agilizar seu atendimento, encaminhei sua conversa para *{departamento}*. Um atendente responderá em breve.',
  human_handoff_message: 'Entendido! Encaminhei sua conversa para *{departamento}*. Um atendente continuará o atendimento.',
  customer_cancel_message: '🚫 *Atendimento encerrado*\n\n{nome}, seu atendimento foi cancelado conforme solicitado.\n\nSe precisar de ajuda novamente no futuro, basta nos enviar uma nova mensagem! Tenha um ótimo dia! 👋',
  ask_customer_name_message: 'Antes de continuarmos, qual é o seu nome?\n\nDigite apenas seu nome, por favor.',
  invalid_customer_name_message: 'Não consegui identificar um nome válido. Digite apenas seu nome, sem números ou outras informações.\n\nTentativa {tentativa} de {limite}.',
  confirm_customer_name_message: 'Entendi que seu nome é *{nome}*. Está correto?\n\n1️⃣ - Sim\n2️⃣ - Corrigir',
  customer_name_saved_message: 'Obrigado, *{nome}*! Seu nome foi confirmado.',
  customer_name_skipped_message: 'Tudo bem, vamos continuar sem salvar seu nome.',
  resume_message: 'Olá, *{nome}*! Você foi atendido recentemente pelo setor *{departamento}*.\n\n1️⃣ - Continuar com *{departamento}*\n2️⃣ - Escolher outro departamento\n\nResponda com 1 ou 2.',
  invalid_option_message: '⚠️ Não consegui identificar o departamento. Escolha uma das opções abaixo:\n\n{opcoes}\n\nTentativa {tentativa} de {limite}.',
  media_during_routing_message: 'Recebi seu arquivo, mas primeiro preciso saber o departamento desejado. Escolha uma opção:\n\n{opcoes}',
  queue_confirmation_message: '✅ Atendimento encaminhado para *{departamento}*. Aguarde um momento; um de nossos especialistas responderá em breve.',
  transfer_message: '🔄 Seu atendimento foi transferido para *{departamento}*. Um atendente continuará a conversa em breve.',
  rating_request_message: '✅ *Seu atendimento foi encerrado*!\n\nGostaríamos da sua opinião. Como você avalia o atendimento que recebeu?\n\nResponda com apenas um número:\n\n1️⃣ - Muito insatisfeito\n2️⃣ - Insatisfeito\n3️⃣ - Regular\n4️⃣ - Satisfeito\n5️⃣ - Muito satisfeito',
  rating_thank_you_message: 'Obrigado pela sua avaliação! {estrelas}\n\nSua opinião é muito importante para melhorarmos nosso atendimento.'
});

const BOOLEAN_FIELDS = [
  'enabled', 'show_department_menu', 'accept_department_name', 'resume_recent_enabled',
  'auto_route_after_invalid', 'send_queue_confirmation', 'send_transfer_notice',
  'send_rating_request', 'allow_agent_toggle_rating', 'accept_media_during_routing', 'human_handoff_enabled',
  'allow_customer_cancel', 'collect_customer_name', 'require_customer_last_name',
  'auto_close_external_service', 'send_rating_on_external_inactivity'
];

const MESSAGE_FIELDS = [
  'greeting_message', 'disabled_routing_message', 'fallback_routing_message', 'human_handoff_message',
  'customer_cancel_message', 'ask_customer_name_message', 'invalid_customer_name_message', 'confirm_customer_name_message',
  'customer_name_saved_message', 'customer_name_skipped_message', 'resume_message', 'invalid_option_message',
  'media_during_routing_message', 'queue_confirmation_message', 'transfer_message',
  'rating_request_message', 'rating_thank_you_message'
];

function normalizeBotConfig(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const config = { ...DEFAULT_BOT_CONFIG };

  for (const field of BOOLEAN_FIELDS) {
    if (typeof source[field] === 'boolean') config[field] = source[field];
  }
  for (const field of MESSAGE_FIELDS) {
    if (typeof source[field] === 'string') {
      const savedMessage = source[field].slice(0, 4000);
      const isKnownLegacyMessage = savedMessage === LEGACY_DEFAULT_MESSAGES[field] || savedMessage === LEGACY_FORMATTED_MESSAGE_VARIANTS[field];
      config[field] = isKnownLegacyMessage ? DEFAULT_BOT_CONFIG[field] : savedMessage;
    }
  }
  for (const field of ['menu_keywords', 'human_handoff_keywords', 'cancel_keywords', 'restart_service_keywords']) {
    if (typeof source[field] === 'string') config[field] = source[field].slice(0, 1000);
  }

  config.default_department_id = typeof source.default_department_id === 'string' && source.default_department_id
    ? source.default_department_id
    : null;
  config.resume_window_hours = Math.min(168, Math.max(1, Number.parseInt(source.resume_window_hours, 10) || 24));
  config.rating_window_minutes = Math.min(1440, Math.max(5, Number.parseInt(source.rating_window_minutes, 10) || 45));
  config.invalid_attempt_limit = Math.min(10, Math.max(1, Number.parseInt(source.invalid_attempt_limit, 10) || 3));
  const rapidGrace = Number.parseInt(source.rapid_message_grace_seconds, 10);
  config.rapid_message_grace_seconds = Number.isFinite(rapidGrace) ? Math.min(15, Math.max(0, rapidGrace)) : 3;
  config.external_service_idle_minutes = Math.min(1440, Math.max(5, Number.parseInt(source.external_service_idle_minutes, 10) || 60));
  config.customer_name_attempt_limit = Math.min(5, Math.max(1, Number.parseInt(source.customer_name_attempt_limit, 10) || 3));
  return config;
}

async function getBotConfig() {
  if (botConfigCache && Date.now() < botConfigCacheExpiresAt) return { ...botConfigCache };
  if (!isSupabaseConfigured()) return { ...DEFAULT_BOT_CONFIG };
  if (!botConfigLoadPromise) {
    botConfigLoadPromise = (async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'bot_config')
        .maybeSingle();

      if (error) {
        console.warn('Não foi possível carregar as configurações do bot:', error.message);
        return { ...DEFAULT_BOT_CONFIG };
      }

      const config = normalizeBotConfig(data?.value);
      if (!data?.value?.greeting_message) {
        const legacy = await supabase.from('system_settings').select('value').eq('key', 'bot_greeting').maybeSingle();
        if (!legacy.error && typeof legacy.data?.value === 'string') config.greeting_message = legacy.data.value;
      }
      return config;
    })();
  }
  try {
    botConfigCache = await botConfigLoadPromise;
    botConfigCacheExpiresAt = Date.now() + BOT_CONFIG_CACHE_TTL_MS;
    return { ...botConfigCache };
  } finally {
    botConfigLoadPromise = null;
  }
}

function invalidateBotConfigCache() {
  botConfigCache = null;
  botConfigCacheExpiresAt = 0;
  botConfigLoadPromise = null;
}

function renderBotMessage(template, variables = {}) {
  if (!template) return '';
  return String(template).replace(/\{([a-z_]+)\}/gi, (match, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key] ?? '') : match;
  });
}

function departmentOptions(departments) {
  return (departments || []).map((department, index) => `${index + 1}️⃣ - ${department.name}`).join('\n');
}

module.exports = { DEFAULT_BOT_CONFIG, normalizeBotConfig, getBotConfig, invalidateBotConfigCache, renderBotMessage, departmentOptions };
