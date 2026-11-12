<template>
  <div class="settings-view-grid" :class="{ standalone }" style="width:100%;">
    <!-- Coluna 1: Menu de Navegação das Configurações -->
    <div v-if="!standalone" class="settings-nav-sidebar">
      <div
        v-if="authStore.isAdmin || authStore.isSupervisor"
        class="settings-nav-item"
        :class="{ active: activeTab === 'conexoes' }"
        @click="activeTab = 'conexoes'"
      >
        <i class="fa-solid fa-plug"></i>
        <div class="settings-nav-meta">
          <span class="settings-nav-title">Conexões</span>
          <span class="settings-nav-desc">Contas do WhatsApp</span>
        </div>
      </div>

      <div
        v-if="authStore.isAdmin || authStore.isSupervisor"
        class="settings-nav-item"
        :class="{ active: activeTab === 'geral' }"
        @click="activeTab = 'geral'"
      >
        <i class="fa-solid fa-sliders"></i>
        <div class="settings-nav-meta">
          <span class="settings-nav-title">Informações da empresa</span>
          <span class="settings-nav-desc">Dados da empresa e identificação</span>
        </div>
      </div>

      <div
        v-if="authStore.isAdmin"
        class="settings-nav-item"
        :class="{ active: activeTab === 'departamentos' }"
        @click="activeTab = 'departamentos'"
      >
        <i class="fa-solid fa-building"></i>
        <div class="settings-nav-meta">
          <span class="settings-nav-title">Departamentos</span>
          <span class="settings-nav-desc">Filas de atendimento e cores</span>
        </div>
      </div>

    </div>

    <!-- Coluna 2: Área Principal de Configurações -->
    <div class="settings-main-form-area">
      <!-- ABA: CONEXÕES -->
      <div v-if="activeTab === 'conexoes'" class="settings-section-card">
        <div class="settings-section-header">
          <div>
            <span class="settings-section-heading">Conexões e WhatsApp</span>
            <div style="font-size:11px;color:#64748b;margin-top:3px;">
              {{ authStore.isAdmin ? 'Gerencie o servidor e todos os números de WhatsApp da empresa.' : 'Gerencie as contas de WhatsApp vinculadas ao seu departamento.' }}
            </div>
          </div>
        </div>
        <ConnectionsSettings />
      </div>

      <!-- ABA 1: GERAL -->
      <div v-else-if="activeTab === 'geral'" class="settings-section-card">
        <div class="settings-section-header">
          <div>
            <span class="settings-section-heading">Informações da empresa</span>
            <div class="settings-section-description">Dados usados para identificar sua operação dentro da plataforma.</div>
          </div>
          <button class="btn-primary" @click="saveGeneralSettings">
            <i class="fa-solid fa-floppy-disk"></i> Salvar alterações
          </button>
        </div>

        <div class="settings-form-grid-2">
          <div class="settings-field">
            <label>Nome da empresa</label>
            <input v-model="formGeneral.company_name" type="text" />
          </div>
          <div class="settings-field">
            <label>CNPJ principal</label>
            <input v-model="formGeneral.cnpj" type="text" />
          </div>
        </div>
      </div>

      <!-- ABA 2: DEPARTAMENTOS -->
      <div v-else-if="activeTab === 'departamentos'" class="settings-section-card">
        <div class="settings-section-header">
          <div>
            <span class="settings-section-heading">Departamentos de atendimento</span>
            <div class="settings-section-description">Organize filas, cores e responsabilidades da equipe.</div>
          </div>
          <button class="btn-primary" @click="openNewDepartment">
            <i class="fa-solid fa-plus"></i> Novo departamento
          </button>
        </div>

        <div class="settings-table-wrap"><table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th>Departamento</th>
              <th class="department-order-heading">Ordem no menu</th>
              <th>Cor de Identificação</th>
              <th>Descrição</th>
              <th style="text-align:right;">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, index) in settingsStore.departments" :key="d.id">
              <td style="font-weight:600;">{{ d.name }}</td>
              <td>
                <div class="department-order-cell">
                  <span class="department-order-number">{{ index + 1 }}</span>
                  <div class="department-order-controls">
                    <button class="btn-icon department-order-button" type="button" title="Subir no menu" :disabled="index === 0 || reorderingDepartments" @click="moveDepartment(index, -1)">
                      <i class="fa-solid fa-chevron-up"></i>
                    </button>
                    <button class="btn-icon department-order-button" type="button" title="Descer no menu" :disabled="index === settingsStore.departments.length - 1 || reorderingDepartments" @click="moveDepartment(index, 1)">
                      <i class="fa-solid fa-chevron-down"></i>
                    </button>
                  </div>
                </div>
              </td>
              <td>
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;">
                  <span style="width:14px;height:14px;border-radius:50%;" :style="{ backgroundColor: d.color || '#059669' }"></span>
                  <code>{{ d.color || '#059669' }}</code>
                </span>
              </td>
              <td style="font-size:12px;color:#64748b;">{{ d.description || '—' }}</td>
              <td style="text-align:right;">
                <button class="btn-icon" title="Editar departamento" @click="openEditDepartment(d)">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn-icon" style="color:#ef4444;" title="Excluir" @click="deleteDept(d)">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table></div>
      </div>

      <!-- ABA 3: CHATBOT -->
      <div v-else-if="activeTab === 'bot'" class="settings-section-card bot-section-card">
        <!-- Cabeçalho e subnav fixos no topo ao rolar a página -->
        <div class="bot-sticky-header">
          <div class="settings-section-header">
            <div>
              <span class="settings-section-heading">Chatbot do WhatsApp</span>
              <div class="settings-section-description">Organize o funcionamento do bot por assunto e altere somente o que precisa.</div>
            </div>
            <button class="btn-primary" :disabled="savingBot" @click="saveBotSettings">
              <i class="fa-solid fa-floppy-disk"></i> {{ savingBot ? 'Salvando...' : 'Salvar configurações' }}
            </button>
          </div>

          <nav class="bot-subnav" role="tablist" aria-label="Seções da configuração da IA">
            <button
              v-for="section in botSections"
              :key="section.id"
              class="bot-subnav-item"
              :class="{ active: botSection === section.id }"
              type="button"
              role="tab"
              :aria-selected="botSection === section.id"
              @click="botSection = section.id"
            >
              <span class="bot-subnav-icon"><i :class="section.icon"></i></span>
              <span class="bot-subnav-copy">
                <strong>{{ section.label }}</strong>
                <small>{{ section.description }}</small>
              </span>
            </button>
          </nav>
        </div>

        <div class="settings-content-stack bot-tab-content">
          <section v-if="botSection === 'overview'" class="bot-tab-panel" role="tabpanel">
            <div class="bot-panel-heading">
              <span class="bot-panel-heading-icon"><i class="fa-solid fa-gauge-high"></i></span>
              <div><strong>Visão geral do bot</strong><small>Ative o atendimento automático e defina os parâmetros principais.</small></div>
            </div>

            <div class="bot-status-card">
              <div>
                <strong>Bot automático</strong>
                <span>Quando desligado, novos contatos vão diretamente para o departamento padrão.</span>
              </div>
              <label class="bot-status-toggle">
                <input v-model="botConfig.enabled" type="checkbox" />
                {{ botConfig.enabled ? 'Ativado' : 'Desativado' }}
              </label>
            </div>

            <div class="settings-form-grid-2">
              <div>
                <label class="bot-field-label">Departamento padrão</label>
                <select v-model="botConfig.default_department_id" class="bot-field-control">
                  <option :value="null">Selecione um departamento</option>
                  <option v-for="department in settingsStore.departments" :key="department.id" :value="department.id">{{ department.name }}</option>
                </select>
                <span class="bot-field-help">Usado quando a conta do WhatsApp não possui departamento dedicado nem padrão individual.</span>
              </div>
              <div class="bot-number-grid">
                <div>
                  <label class="bot-field-label">Retomar atendimento por até</label>
                  <div class="bot-input-suffix"><input v-model.number="botConfig.resume_window_hours" class="bot-field-control" type="number" min="1" max="168" /><span>horas</span></div>
                </div>
                <div>
                  <label class="bot-field-label">Prazo para receber avaliação</label>
                  <div class="bot-input-suffix"><input v-model.number="botConfig.rating_window_minutes" class="bot-field-control" type="number" min="5" max="1440" /><span>min.</span></div>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="botSection === 'automation'" class="bot-tab-panel" role="tabpanel">
            <div class="bot-panel-heading">
              <span class="bot-panel-heading-icon purple"><i class="fa-solid fa-diagram-project"></i></span>
              <div><strong>Fluxo e automações</strong><small>Escolha como o bot identifica, encaminha e encerra cada conversa.</small></div>
            </div>

            <div>
              <div class="bot-group-title">Comportamentos do atendimento</div>
              <div class="bot-behavior-grid">
                <label v-for="option in botBehaviorOptions" :key="option.key" class="bot-behavior-option">
                  <input v-model="botConfig[option.key]" type="checkbox" />
                  <span><strong>{{ option.label }}</strong><small>{{ option.help }}</small></span>
                </label>
              </div>
            </div>

            <div class="bot-rule-card">
              <div class="bot-group-title">Limites de tentativa</div>
              <div class="bot-compact-grid">
                <div v-if="botConfig.auto_route_after_invalid">
                  <label class="bot-field-label">Respostas inválidas antes de encaminhar</label>
                  <input v-model.number="botConfig.invalid_attempt_limit" class="bot-field-control" type="number" min="1" max="10" />
                </div>
                <div>
                  <label class="bot-field-label">Proteção para mensagens rápidas</label>
                  <div class="bot-input-suffix"><input v-model.number="botConfig.rapid_message_grace_seconds" class="bot-field-control" type="number" min="0" max="15" /><span>seg.</span></div>
                  <span class="bot-field-help">Evita considerar como erro uma resposta enviada antes de o menu aparecer.</span>
                </div>
                <div v-if="botConfig.collect_customer_name">
                  <label class="bot-field-label">Tentativas para informar o nome</label>
                  <input v-model.number="botConfig.customer_name_attempt_limit" class="bot-field-control" type="number" min="1" max="5" />
                  <span class="bot-field-help">Após esse limite, o fluxo continua sem salvar um nome.</span>
                </div>
              </div>
            </div>

            <div>
              <div class="bot-group-title">Palavras reconhecidas pelo bot</div>
              <div class="settings-form-grid-2 bot-keyword-grid">
                <div>
                  <label class="bot-field-label">Reabrir o menu</label>
                  <input v-model="botConfig.menu_keywords" class="bot-field-control" type="text" />
                  <span class="bot-field-help">Exemplo: menu, ajuda, início.</span>
                </div>
                <div>
                  <label class="bot-field-label">Falar com um humano</label>
                  <input v-model="botConfig.human_handoff_keywords" class="bot-field-control" type="text" :disabled="!botConfig.human_handoff_enabled" />
                  <span class="bot-field-help">Encaminha ao departamento padrão.</span>
                </div>
                <div>
                  <label class="bot-field-label">Cancelar atendimento</label>
                  <input v-model="botConfig.cancel_keywords" class="bot-field-control" type="text" :disabled="!botConfig.allow_customer_cancel" />
                  <span class="bot-field-help">Exemplo: cancelar, sair, 0.</span>
                </div>
                <div>
                  <label class="bot-field-label">Iniciar outro atendimento</label>
                  <input v-model="botConfig.restart_service_keywords" class="bot-field-control" type="text" />
                  <span class="bot-field-help">Encerra a conversa atual e abre novamente o menu.</span>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="botSection === 'inactivity'" class="bot-tab-panel" role="tabpanel">
            <div class="bot-panel-heading">
              <span class="bot-panel-heading-icon amber"><i class="fa-regular fa-clock"></i></span>
              <div><strong>Inatividade</strong><small>Defina o que acontece quando uma conversa pelo celular fica sem novas mensagens.</small></div>
            </div>

            <div class="inactivity-settings-card">
              <div class="inactivity-settings-header">
                <div class="inactivity-settings-icon"><i class="fa-regular fa-clock"></i></div>
                <div class="inactivity-settings-title">
                  <strong>Encerramento automático</strong>
                  <span>Controla conversas atendidas diretamente pelo WhatsApp, fora da plataforma.</span>
                </div>
                <label class="inactivity-toggle">
                  <input v-model="botConfig.auto_close_external_service" type="checkbox" />
                  <span>{{ botConfig.auto_close_external_service ? 'Ativado' : 'Desativado' }}</span>
                </label>
              </div>

              <div v-if="botConfig.auto_close_external_service" class="inactivity-settings-body">
                <div>
                  <label class="bot-field-label">Encerrar após quanto tempo sem mensagens?</label>
                  <div class="inactivity-time-input">
                    <input v-model.number="botConfig.external_service_idle_minutes" class="bot-field-control" type="number" min="5" max="1440" />
                    <span>minutos</span>
                  </div>
                  <span class="bot-field-help">Aceita de 5 minutos a 24 horas. O tempo reinicia quando o cliente ou atendente envia uma mensagem.</span>
                </div>

                <label class="inactivity-action-option">
                  <input v-model="botConfig.send_rating_on_external_inactivity" type="checkbox" />
                  <span>
                    <strong>Enviar avaliação ao encerrar</strong>
                    <small>Aplica-se somente a clientes. Funcionários nunca recebem a pesquisa.</small>
                  </span>
                </label>

                <div class="inactivity-result-note">
                  <i class="fa-solid fa-arrow-rotate-right"></i>
                  <span>Depois do encerramento, uma nova mensagem do cliente inicia normalmente um novo fluxo no bot.</span>
                </div>
              </div>

              <div v-else class="inactivity-disabled-note">
                Os atendimentos pelo celular permanecerão em andamento até serem encerrados manualmente ou o cliente solicitar um novo atendimento.
              </div>
            </div>
          </section>

          <section v-else class="bot-tab-panel" role="tabpanel">
            <div class="bot-panel-heading bot-messages-heading">
              <span class="bot-panel-heading-icon green"><i class="fa-regular fa-message"></i></span>
              <div><strong>Mensagens automáticas</strong><small>Personalize os textos enviados ao cliente em cada etapa do atendimento.</small></div>
              <button class="btn-secondary" type="button" @click="restoreBotDefaults"><i class="fa-solid fa-arrow-rotate-left"></i> Restaurar textos padrão</button>
            </div>

            <div class="bot-variable-help">
              <i class="fa-solid fa-code"></i>
              <span>Use <code>{nome}</code>, <code>{departamento}</code>, <code>{opcoes}</code>, <code>{atendente}</code>, <code>{tentativa}</code>, <code>{limite}</code> e <code>{estrelas}</code>. No WhatsApp: <code>*negrito*</code>, <code>_itálico_</code> e <code>~riscado~</code>.</span>
            </div>

            <div class="bot-message-list">
              <div v-for="field in botMessageFields" :key="field.key" class="bot-message-editor">
                <div class="bot-message-editor-header">
                  <label class="bot-field-label">{{ field.label }}</label>
                  <span>{{ String(botConfig[field.key] || '').length }}/4000</span>
                </div>
                <textarea v-model="botConfig[field.key]" :rows="field.rows || 3" maxlength="4000" class="bot-field-control"></textarea>
                <span class="bot-field-help">{{ field.help }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>


    </div>

    <!-- Modais -->
    <!-- Modais -->

    <ModalDepartamento
      v-if="showModalDept"
      :department="editingDepartment"
      @close="closeDepartmentModal"
      @saved="settingsStore.fetchDepartments"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from '@/stores/settings.store'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import ModalDepartamento from '@/components/modals/ModalDepartamento.vue'
import ConnectionsSettings from '@/components/settings/ConnectionsSettings.vue'

const route = useRoute()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const ui = useUiStore()

const props = defineProps({
  initialTab: { type: String, default: 'geral' },
  standalone: { type: Boolean, default: false }
})
const activeTab = ref(props.initialTab)
const botSection = ref('overview')
const savingBot = ref(false)

// Sincronizar com route.query.tab (Topbar Bitrix24)
watch(
  () => route.query.tab,
  (tab) => {
    if (tab) activeTab.value = tab
  },
  { immediate: true }
)

// As rotas de configurações usam o mesmo componente. O Vue pode preservar a
// instância ao alternar entre elas, então sincronizamos a aba com a nova rota.
watch(
  () => props.initialTab,
  (tab) => {
    activeTab.value = tab
    if (tab === 'bot') botSection.value = 'overview'
  },
  { flush: 'sync' }
)

const showModalDept = ref(false)
const editingDepartment = ref(null)
const reorderingDepartments = ref(false)

const formGeneral = ref({
  company_name: 'Grupo Combate',
  cnpj: '12.345.678/0001-99'
})

const defaultBotMessages = {
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
}

const botConfig = ref({
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
  cancel_keywords: 'cancelar,encerrar,sair,parar,desistir,finalizar,0,cancelar atendimento,encerrar atendimento',
  restart_service_keywords: 'menu,novo atendimento,outro departamento,mudar departamento,falar com outro setor,falar com outro departamento',
  ...defaultBotMessages
})

const botBehaviorOptions = [
  { key: 'show_department_menu', label: 'Exibir menu de departamentos', help: 'Preenche a variável {opcoes} com as filas disponíveis.' },
  { key: 'accept_department_name', label: 'Aceitar o nome do departamento', help: 'Além do número, reconhece nomes e palavras relacionadas.' },
  { key: 'resume_recent_enabled', label: 'Oferecer retomada recente', help: 'Permite retornar ao setor do último atendimento.' },
  { key: 'auto_route_after_invalid', label: 'Encaminhar após erros', help: 'Evita que o cliente fique preso no menu.' },
  { key: 'accept_media_during_routing', label: 'Aceitar mídia durante o menu', help: 'Permite imagens, áudios e arquivos antes da escolha.' },
  { key: 'human_handoff_enabled', label: 'Permitir pedir atendimento humano', help: 'Reconhece palavras configuradas e encaminha para a fila padrão.' },
  { key: 'allow_customer_cancel', label: 'Permitir que o cliente cancele o atendimento', help: 'Encerra o chamado e tira da fila quando o cliente digita palavras como cancelar, sair ou 0.' },
  { key: 'collect_customer_name', label: 'Perguntar o nome de clientes desconhecidos', help: 'Solicita e confirma o nome antes do menu; desligue para pular esta etapa.' },
  { key: 'require_customer_last_name', label: 'Exigir nome e sobrenome', help: 'Reduz cadastros imprecisos exigindo pelo menos duas palavras.' },
  { key: 'send_queue_confirmation', label: 'Confirmar entrada na fila', help: 'Envia uma mensagem após escolher o departamento.' },
  { key: 'send_transfer_notice', label: 'Avisar sobre transferências', help: 'Notifica o cliente quando o setor for alterado.' },
  { key: 'send_rating_request', label: 'Solicitar avaliação', help: 'Envia a pesquisa ao encerrar atendimentos manualmente.' },
  { key: 'allow_agent_toggle_rating', label: 'Permitir escolha do atendente no encerramento', help: 'Exibe a opção no popup para o atendente escolher se envia ou não a avaliação. Se desativado, o envio é automático (quando a solicitação de avaliação estiver ativa).' }
]

const botSections = [
  { id: 'overview', label: 'Visão geral', description: 'Status e parâmetros principais', icon: 'fa-solid fa-gauge-high' },
  { id: 'automation', label: 'Fluxo e automações', description: 'Regras, limites e palavras-chave', icon: 'fa-solid fa-diagram-project' },
  { id: 'inactivity', label: 'Inatividade', description: 'Encerramento e avaliação', icon: 'fa-regular fa-clock' },
  { id: 'messages', label: 'Mensagens', description: 'Textos enviados pelo bot', icon: 'fa-regular fa-message' }
]

const botMessageFields = [
  { key: 'greeting_message', label: 'Saudação e menu inicial', rows: 6, help: 'Use {opcoes} onde deseja inserir a lista de departamentos.' },
  { key: 'disabled_routing_message', label: 'Bot desativado — encaminhamento automático', help: 'Enviada quando o contato é direcionado ao departamento padrão.' },
  { key: 'fallback_routing_message', label: 'Encaminhamento após tentativas inválidas', help: 'Enviada quando o limite de respostas não reconhecidas é atingido.' },
  { key: 'human_handoff_message', label: 'Encaminhamento solicitado para humano', help: 'Enviada quando o cliente pede atendimento humano.' },
  { key: 'customer_cancel_message', label: 'Mensagem de cancelamento pelo cliente', rows: 4, help: 'Enviada quando o cliente solicita cancelar ou encerrar o atendimento.' },
  { key: 'ask_customer_name_message', label: 'Pergunta do nome do cliente', help: 'Enviada apenas para números que ainda não possuem um contato cadastrado.' },
  { key: 'invalid_customer_name_message', label: 'Nome não reconhecido', help: 'Pode usar {tentativa} e {limite}.' },
  { key: 'confirm_customer_name_message', label: 'Confirmação do nome', rows: 4, help: 'Use {nome}. O nome só é salvo após o cliente confirmar.' },
  { key: 'customer_name_saved_message', label: 'Nome salvo com sucesso', help: 'Use {nome} para personalizar o agradecimento.' },
  { key: 'customer_name_skipped_message', label: 'Coleta de nome ignorada', help: 'Enviada quando o limite de tentativas é atingido.' },
  { key: 'resume_message', label: 'Retomada de atendimento recente', rows: 5, help: 'Use {departamento} para informar a última fila.' },
  { key: 'invalid_option_message', label: 'Opção inválida', rows: 4, help: 'Pode usar {tentativa}, {limite} e {opcoes}.' },
  { key: 'media_during_routing_message', label: 'Mídia não permitida durante o menu', help: 'Usada somente quando a opção de aceitar mídia estiver desligada.' },
  { key: 'queue_confirmation_message', label: 'Confirmação de entrada na fila', help: 'Enviada após o departamento ser escolhido.' },
  { key: 'transfer_message', label: 'Aviso de transferência', help: 'Pode usar {departamento} e {atendente}.' },
  { key: 'rating_request_message', label: 'Pedido de avaliação', help: 'Oriente o cliente a responder de 1 a 5.' },
  { key: 'rating_thank_you_message', label: 'Agradecimento pela avaliação', help: 'Use {estrelas} para mostrar a nota recebida.' }
]





async function deleteDept(d) {
  if (!confirm(`Deseja realmente excluir o departamento ${d.name}?`)) return
  try {
    const res = await settingsStore.deleteDepartment(d.id)
    if (res.success) {
      ui.showToast('Departamento excluído com sucesso!')
    } else {
      ui.showToast(`⚠️ ${res.error}`, 'error')
    }
  } catch (error) {
    ui.showToast(error.response?.data?.error || 'Erro ao excluir departamento.', 'error')
  }
}

function openNewDepartment() {
  editingDepartment.value = null
  showModalDept.value = true
}

function openEditDepartment(department) {
  editingDepartment.value = department
  showModalDept.value = true
}

function closeDepartmentModal() {
  showModalDept.value = false
  editingDepartment.value = null
}

async function moveDepartment(index, direction) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= settingsStore.departments.length || reorderingDepartments.value) return

  const previousOrder = [...settingsStore.departments]
  const reordered = [...previousOrder]
  ;[reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]]
  settingsStore.departments = reordered
  reorderingDepartments.value = true

  try {
    const result = await settingsStore.reorderDepartments(reordered.map(department => department.id))
    if (!result.success) throw new Error(result.error || 'Não foi possível alterar a ordem.')
    ui.showToast('Ordem do menu atualizada.')
  } catch (error) {
    settingsStore.departments = previousOrder
    ui.showToast(error.response?.data?.error || error.message || 'Erro ao alterar a ordem dos departamentos.', 'error')
  } finally {
    reorderingDepartments.value = false
  }
}

async function saveGeneralSettings() {
  try {
    await settingsStore.saveSetting('company_info', formGeneral.value)
    ui.showToast('Configurações salvas com sucesso!')
  } catch (error) {
    ui.showToast(error.response?.data?.error || 'Erro ao salvar configurações', 'error')
  }
}

async function loadSavedSettings() {
  try {
    await settingsStore.fetchSettings()
    if (settingsStore.settings.company_info) formGeneral.value = { ...formGeneral.value, ...settingsStore.settings.company_info }
    if (settingsStore.settings.bot_config) botConfig.value = { ...botConfig.value, ...settingsStore.settings.bot_config }
  } catch (error) {
    ui.showToast('Não foi possível carregar as configurações do bot.', 'error')
  }
}

async function saveBotSettings() {
  if ((!botConfig.value.enabled || botConfig.value.auto_route_after_invalid || botConfig.value.human_handoff_enabled) && !botConfig.value.default_department_id) {
    ui.showToast('Selecione o departamento padrão para o roteamento automático.', 'error')
    return
  }
  if (botConfig.value.auto_close_external_service) {
    const idleMinutes = Number(botConfig.value.external_service_idle_minutes)
    if (!Number.isInteger(idleMinutes) || idleMinutes < 5 || idleMinutes > 1440) {
      ui.showToast('Defina a inatividade entre 5 e 1440 minutos.', 'error')
      return
    }
  }
  savingBot.value = true
  try {
    const data = await settingsStore.saveSetting('bot_config', botConfig.value)
    if (data.success) {
      if (data.value) botConfig.value = { ...botConfig.value, ...data.value }
      ui.showToast('Configurações do bot salvas com sucesso!')
    }
  } catch (error) {
    ui.showToast(error.response?.data?.error || 'Erro ao salvar configurações do bot.', 'error')
  } finally {
    savingBot.value = false
  }
}

function restoreBotDefaults() {
  botConfig.value = { ...botConfig.value, ...defaultBotMessages }
  ui.showToast('Textos padrão restaurados. Clique em salvar para confirmar.')
}

onMounted(async () => {
  const tasks = [settingsStore.fetchDepartments()]
  if (authStore.isAdmin) tasks.push(loadSavedSettings())
  await Promise.all(tasks)
})
</script>

<style scoped>
.bot-section-card {
  position: relative;
}
.bot-sticky-header {
  position: sticky;
  top: 0;
  z-index: 25;
  background: #ffffff;
  margin: -22px -22px 0 -22px;
  padding: 20px 22px 14px 22px;
  border-top-left-radius: 14px;
  border-top-right-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid #edf1f5;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
}
.bot-subnav {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 6px;
  background: #f8fafc;
  border: 1px solid #edf2f7;
  border-radius: 12px;
}
.bot-subnav-item { min-width:0;padding:10px 12px;border:1px solid transparent;border-radius:9px;display:flex;align-items:center;gap:10px;background:transparent;color:#64748b;text-align:left;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease,transform .15s ease; }
.bot-subnav-item:hover { border-color:#d1fae5;background:#fff;transform:translateY(-1px); }
.bot-subnav-item.active { border-color:#a7f3d0;background:#fff;color:#059669;box-shadow:0 4px 14px rgba(5,150,105,.08); }
.bot-subnav-icon { width:32px;height:32px;border-radius:8px;display:grid;place-items:center;flex:none;background:#e2e8f0;color:#64748b;font-size:12px;transition:background-color .15s ease,color .15s ease; }
.bot-subnav-item.active .bot-subnav-icon { background:#d1fae5;color:#059669; }
.bot-subnav-copy { min-width:0;display:flex;flex-direction:column;gap:2px; }
.bot-subnav-copy strong { overflow:hidden;color:#334155;font-size:12px;font-weight:600;text-overflow:ellipsis;white-space:nowrap; }
.bot-subnav-item.active .bot-subnav-copy strong { color:#047857; }
.bot-subnav-copy small { overflow:hidden;color:#94a3b8;font-size:10px;font-weight:400;text-overflow:ellipsis;white-space:nowrap; }
.bot-tab-content { gap:0; }
.bot-tab-panel { display:flex;flex-direction:column;gap:20px;animation:bot-tab-enter .16s ease-out; }
.bot-panel-heading { padding:2px 0 13px;border-bottom:1px solid #edf1f5;display:flex;align-items:center;gap:10px; }
.bot-panel-heading-icon { width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:none;background:#d1fae5;color:#059669;font-size:13px; }
.bot-panel-heading-icon.purple { background:#ede9fe;color:#7c3aed; }
.bot-panel-heading-icon.amber { background:#fef3c7;color:#d97706; }
.bot-panel-heading-icon.green { background:#dcfce7;color:#059669; }
.bot-panel-heading>div { min-width:0;display:flex;flex:1;flex-direction:column;gap:2px; }
.bot-panel-heading strong { color:#1e293b;font-size:13px;font-weight:600; }
.bot-panel-heading small { color:#64748b;font-size:10.5px;line-height:1.4; }
.bot-group-title { margin-bottom:8px;color:#334155;font-size:11px;font-weight:600; }
.bot-rule-card { padding:14px;border:1px solid #e2e8f0;border-radius:11px;background:#fbfcfe; }
.bot-input-suffix { position:relative; }
.bot-input-suffix .bot-field-control { padding-right:48px; }
.bot-input-suffix>span { position:absolute;top:50%;right:10px;color:#94a3b8;font-size:10.5px;font-weight:600;transform:translateY(-50%);pointer-events:none; }
.bot-keyword-grid>div { min-width:0; }
.bot-field-control:disabled { background:#f8fafc;color:#94a3b8;cursor:not-allowed; }
.bot-messages-heading .btn-secondary { flex:none; }
.bot-variable-help { padding:10px 12px;border:1px solid #a7f3d0;border-radius:9px;display:flex;align-items:flex-start;gap:8px;background:#f0fdf4;color:#475569;font-size:10.5px;line-height:1.55; }
.bot-variable-help>i { margin-top:3px;color:#059669; }
.bot-variable-help code { padding:1px 4px;border-radius:4px;background:#d1fae5;color:#065f46;font-size:10px; }
.bot-message-list { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px; }
.bot-message-editor { min-width:0;padding:13px;border:1px solid #e2e8f0;border-radius:10px;background:#fbfcfe;transition:border-color .15s ease,box-shadow .15s ease; }
.bot-message-editor:focus-within { border-color:#a7f3d0;background:#fff;box-shadow:0 4px 16px rgba(5,150,105,.06); }
.bot-message-editor-header { display:flex;align-items:center;justify-content:space-between;gap:10px; }
.bot-message-editor-header>span { color:#94a3b8;font-size:9px;white-space:nowrap; }
.bot-message-editor textarea { min-height:78px;resize:vertical;line-height:1.45; }
@keyframes bot-tab-enter { from { opacity:0;transform:translateY(3px); } to { opacity:1;transform:translateY(0); } }
.department-order-heading { width:150px; }
.department-order-cell { display:flex;align-items:center;gap:8px; }
.department-order-number { width:24px;height:24px;border-radius:7px;background:#ecfdf5;color:#059669;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700; }
.department-order-controls { display:flex;align-items:center;gap:3px; }
.department-order-button { width:27px;height:27px;font-size:10px;color:#64748b; }
.department-order-button:disabled { opacity:.28; }
.bot-field-label { font-size:11px;font-weight:500;color:#475569;display:block;margin-bottom:6px; }
.bot-field-control { width:100%;min-height:39px;box-sizing:border-box;font-size:12px;padding:8px 11px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;transition:border-color .15s ease,box-shadow .15s ease; }
.bot-field-control:focus { outline:none;border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.1); }
.bot-field-help { font-size:10.5px;color:#94a3b8;margin-top:4px;display:block;line-height:1.4; }
button:disabled { opacity:.55;cursor:not-allowed; }
.inactivity-settings-card { border:1px solid #a7f3d0;border-radius:11px;background:#f0fdf4;overflow:hidden; }
.inactivity-settings-header { display:flex;align-items:center;gap:10px;padding:14px; }
.inactivity-settings-icon { width:34px;height:34px;border-radius:8px;background:#d1fae5;color:#059669;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.inactivity-settings-title { display:flex;flex-direction:column;gap:2px;flex:1;min-width:0; }
.inactivity-settings-title strong { color:#1e293b;font-size:13px; }
.inactivity-toggle { display:flex;align-items:center;gap:7px;color:#334155;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap; }
.inactivity-settings-body { display:grid;grid-template-columns:minmax(220px,1fr) minmax(240px,1fr);gap:14px;padding:14px;border-top:1px solid #a7f3d0;background:#fff; }
.inactivity-time-input { display:flex;align-items:center;gap:8px; }
.inactivity-time-input .bot-field-control { max-width:130px; }
.inactivity-time-input span { color:#64748b;font-size:11.5px;font-weight:600; }
.inactivity-action-option { display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer; }
.inactivity-action-option input { margin-top:2px; }
.inactivity-action-option span { display:flex;flex-direction:column;gap:3px; }
.inactivity-action-option strong { color:#334155;font-size:11.5px; }
.inactivity-action-option small { color:#64748b;font-size:10.5px;line-height:1.35; }
.inactivity-result-note { grid-column:1 / -1;display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:7px;background:#f0fdf4;color:#166534;font-size:10.5px; }
.inactivity-disabled-note { padding:11px 14px;border-top:1px solid #dbeafe;color:#64748b;font-size:10.5px;background:#fff; }
@media (max-width: 980px) { .bot-subnav { grid-template-columns:repeat(2,minmax(0,1fr)); } .bot-message-list { grid-template-columns:1fr; } }
@media (max-width: 800px) { .inactivity-settings-body { grid-template-columns:1fr; } .inactivity-result-note { grid-column:auto; } .inactivity-settings-header { align-items:flex-start;flex-wrap:wrap; } .inactivity-toggle { margin-left:44px; } .bot-messages-heading { align-items:flex-start;flex-wrap:wrap; } .bot-messages-heading .btn-secondary { width:100%;justify-content:center; } }
@media (max-width: 760px) { .bot-sticky-header { margin:-15px -15px 0 -15px;padding:15px 15px 10px 15px;border-top-left-radius:11px;border-top-right-radius:11px;gap:10px; } }
@media (max-width: 560px) { .bot-subnav { grid-template-columns:1fr 1fr;gap:5px; } .bot-subnav-item { padding:8px; } .bot-subnav-copy small { display:none; } .bot-subnav-icon { width:28px;height:28px; } .bot-panel-heading { align-items:flex-start; } }
@media (max-width: 480px) { .bot-sticky-header { margin:-13px -13px 0 -13px;padding:13px 13px 8px 13px; } }
</style>
