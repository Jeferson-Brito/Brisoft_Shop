<template><div class="chat-column"><template v-if="conversation"><header class="chat-header"><div class="chat-header-left"><button class="chat-back-btn" aria-label="Voltar para fila" @click="$emit('back')"><span class="header-icon-box"><i class="ri-arrow-left-s-line"></i></span></button><div class="chat-header-title-box"><div class="chat-header-avatar" style="background:#e0f2fe;color:#0284c7">CT</div><div class="chat-contact-copy"><div class="chat-contact-name-line"><h2 class="chat-contact-title">{{conversation.customer_name}}</h2></div><div class="chat-contact-subtitle"><span class="chat-department-line"><i class="ri-folder-line"></i>{{conversation.department_name||'Assistente do catálogo'}}</span></div></div></div></div><div class="chat-header-tools"><button class="header-tool-btn" title="Pesquisar mensagens" aria-label="Pesquisar mensagens" @click="showSearch=!showSearch"><span class="tool-icon-box"><i class="ri-search-line"></i></span></button><button class="header-tool-btn" title="Transferir atendimento" aria-label="Transferir atendimento" @click="$emit('transfer')"><span class="tool-icon-box"><i class="ri-arrow-left-right-line"></i></span></button><div class="actions-dropdown-wrapper"><button class="header-tool-btn" title="Mais opções" aria-label="Mais opções" @click="showActions=!showActions"><span class="tool-icon-box"><i class="ri-more-2-line"></i></span></button><div v-if="showActions" class="actions-menu-dropdown"><button class="actions-menu-item" @click="$emit('transfer');showActions=false"><span class="menu-icon-box"><i class="ri-arrow-left-right-line"></i></span><span>Transferir atendimento</span></button><button v-if="conversation.status!=='closed'" class="actions-menu-item" @click="$emit('close-conversation');showActions=false"><span class="menu-icon-box"><i class="ri-check-double-line"></i></span><span>Encerrar atendimento</span></button><RouterLink v-if="conversation.channel!=='whatsapp'" class="actions-menu-item" :to="{path:'/simulador',query:{conversa:conversation.id}}"><span class="menu-icon-box"><i class="ri-user-line"></i></span><span>Ver como cliente de teste</span></RouterLink></div></div></div></header><div v-if="showSearch" class="shop-message-search"><input v-model="search" placeholder="Buscar mensagem nesta conversa…" aria-label="Pesquisar mensagens"/></div><div ref="messagesBox" class="chat-messages-container" id="chatMessagesBox"><div class="chat-date-sticky-wrapper"><div class="chat-date-pill">{{conversation.channel==='whatsapp'?'WhatsApp':'Conversa de teste'}} · {{new Date(conversation.created_at).toLocaleDateString('pt-BR')}}</div></div><ChatBubble v-for="item in displayMessages" :key="item.id" :msg="item" :interactive="false" initials="CT" avatar-color="#e0f2fe" :current-user-id="auth.user?.id" :current-user-name="auth.userName" :client-name="conversation.customer_name"/><div v-if="conversation.channel==='whatsapp'" class="shop-chat-system">{{deliverySummary}} <button v-if="auth.isAdmin&&failedMessage" class="btn-secondary" :disabled="busy" @click="$emit('retry-message',failedMessage.id)">Tentar envio novamente</button></div><div v-if="!displayMessages.length" class="shop-chat-system">Nenhuma mensagem encontrada.</div></div><div v-if="conversation.status==='bot'" class="shop-chat-handoff"><span>Assistente ativo. Encaminhe a conversa para responder como equipe.</span><button class="btn-primary" @click="$emit('transfer')">Transferir</button></div><div v-else-if="conversation.status==='closed'" class="shop-chat-handoff">Conversa encerrada. O histórico foi preservado.</div><form v-else class="chat-footer" @submit.prevent="send"><div class="chat-input-row"><div class="chat-input-actions"><button type="button" class="btn-icon" disabled title="Anexos em breve"><span class="composer-icon-box"><i class="ri-attachment-2"></i></span></button><button type="button" class="btn-icon" title="Inserir emoji" @click="message+=' 😊'"><span class="composer-icon-box"><i class="ri-emotion-happy-line"></i></span></button></div><textarea v-model="message" rows="1" :disabled="busy" maxlength="1000" aria-label="Resposta da equipe" placeholder="Escreva uma mensagem..." @keydown.enter.exact.prevent="send"></textarea><button class="btn-primary composer-send-btn" :disabled="busy||!message.trim()" title="Enviar (Enter)" aria-label="Enviar resposta"><span class="composer-icon-box"><i class="ri-send-plane-2-line"></i></span></button></div></form></template><EmptyChatAnimation v-else/></div></template>
<script setup>
import { computed,nextTick,ref,watch } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import ChatBubble from '@/components/atendimentos/ChatBubble.vue'
import EmptyChatAnimation from '@/components/atendimentos/EmptyChatAnimation.vue'
import { normalize } from '@/utils/shop'
const props=defineProps({conversation:{type:Object,default:null},busy:{type:Boolean,default:false}}),emit=defineEmits(['send','transfer','back','close-conversation','retry-message'])
const auth=useAuthStore(),message=ref(''),search=ref(''),showSearch=ref(false),showActions=ref(false),messagesBox=ref(null)
const failedMessage=computed(()=>{const latest=props.conversation?.messages.filter(m=>m.role!=='customer').at(-1);return latest?.delivery_status==='failed'?latest:null})
const deliverySummary=computed(()=>{const m=props.conversation?.messages.filter(m=>m.role!=='customer').at(-1);const labels={pending:'Envio aguardando processamento.',sending:'Enviando mensagem ao WhatsApp…',accepted:'Mensagem aceita pela API do WhatsApp.',failed:'Falha no envio da mensagem. Confira as configurações.',unknown:'Envio sem confirmação. Confira no celular antes de reenviar.',cancelled:'Resposta automática cancelada após encaminhamento à equipe.'};return m?.error_code===131031?'A Meta bloqueou a conta de teste. É necessário verificar o status no suporte da Meta.':labels[m?.delivery_status]||'Canal oficial de teste.'})
const displayMessages=computed(()=>{
 if(!props.conversation)return []
 const messages=props.conversation.messages.map(m=>({...m,sender:m.role==='customer'?'client':'agent',is_bot:m.role==='assistant',sender_name:m.role==='assistant'?'Assistente da loja':m.department_name,user_name:m.role==='assistant'?'Assistente da loja':m.department_name+' · '+(m.actor||'Equipe'),user_id:m.role==='staff'?auth.user?.id:null,time:new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}))
 for(const transfer of props.conversation.transfers)messages.push({id:transfer.id,sender:'system',text:(transfer.from||'Assistente')+' → '+transfer.to+(transfer.reason?' · '+transfer.reason:''),created_at:transfer.created_at})
 return messages.sort((a,b)=>a.created_at.localeCompare(b.created_at)).filter(m=>!search.value||normalize(m.text).includes(normalize(search.value)))
})
async function scroll(){await nextTick();if(messagesBox.value&&!search.value)messagesBox.value.scrollTop=messagesBox.value.scrollHeight}
watch(()=>props.conversation?.version,scroll)
watch(()=>props.conversation?.id,()=>{message.value='';search.value='';showActions.value=false;scroll()})
function send(){if(!props.busy&&message.value.trim())emit('send',message.value)}
defineExpose({clearMessage:()=>{message.value=''}})
</script>

<style scoped>
.chat-contact-title {
  font-family: var(--font-heading);
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.chat-contact-chevron {
  font-size: 14px;
  color: #94a3b8;
  transition: transform 0.2s ease;
}

.chat-contact-chevron.rotate-180 {
  transform: rotate(180deg);
}

.header-icon-box,
.tool-icon-box,
.scroll-icon-box,
.composer-icon-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-icon-box i,
.tool-icon-box i,
.scroll-icon-box i,
.composer-icon-box i {
  font-size: 15px;
  line-height: 1;
}

.badge-icon-box,
.subtitle-icon-box,
.metrics-chevron-box {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.badge-icon-box i,
.subtitle-icon-box i,
.metrics-chevron-box i {
  font-size: 11px;
  line-height: 1;
}

.menu-icon-box,
.searchbar-icon-box,
.alert-icon-box,
.metrics-icon-box,
.kpi-close-icon-box,
.kpi-collapsed-icon-box,
.kpi-collapsed-chevron-box {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-icon-box i,
.searchbar-icon-box i,
.alert-icon-box i,
.metrics-icon-box i,
.kpi-close-icon-box i,
.kpi-collapsed-icon-box i,
.kpi-collapsed-chevron-box i {
  font-size: 14px;
  line-height: 1;
}

.btn-icon-box-sm {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-icon-box-sm i {
  font-size: 13px;
  line-height: 1;
}

.pulse-icon-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pulse-icon-box i {
  font-size: 16px;
  line-height: 1;
}

.message-delete-icon-box {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-delete-icon-box i {
  font-size: 20px;
  line-height: 1;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.chat-header-avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  overflow: hidden;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.chat-header-avatar img { width: 100%; height: 100%; object-fit: cover; }
.employee-contact-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 2px 8px;
  border: none;
  border-radius: 10px;
  background: #fff7ed;
  color: #ea580c;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.handling-channel-indicator {
  position: relative;
  width: 30px;
  height: 30px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex: none;
  background: #eff6ff;
  color: #1f62d0;
  font-size: 13px;
  cursor: help;
  outline: none;
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
}

.group-contact-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 6px;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.handling-channel-indicator:hover,
.handling-channel-indicator:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(37, 99, 235, .12);
}

.handling-channel-indicator.device { border-color: #a7f3d0; background: #ecfdf5; color: #047857; }
.handling-channel-indicator.mixed { border-color: #ddd6fe; background: #f5f3ff; color: #6d28d9; }

.handling-channel-popover {
  position: absolute;
  z-index: 80;
  top: calc(100% + 9px);
  right: 0;
  width: 246px;
  padding: 11px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  color: #334155;
  box-shadow: 0 12px 30px rgba(15, 23, 42, .14);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  pointer-events: none;
  transition: opacity .14s ease, transform .14s ease, visibility .14s ease;
}

.handling-channel-popover::before {
  content: '';
  position: absolute;
  top: -5px;
  right: 10px;
  width: 9px;
  height: 9px;
  border-left: 1px solid #e2e8f0;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
  transform: rotate(45deg);
}

.handling-channel-indicator:hover .handling-channel-popover,
.handling-channel-indicator:focus .handling-channel-popover {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.handling-channel-popover strong {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #0f172a;
  font-size: 11.5px;
  font-weight: 600;
}

.handling-channel-popover p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 10.5px;
  font-weight: 400;
  line-height: 1.45;
}


.chat-message-searchbar {
  min-height: 42px;
  padding: 6px 12px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  background: #f8fafc;
  color: #94a3b8;
}
.incoming-call-banner { flex:none;display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 14px;border-bottom:1px solid #bbf7d0;background:linear-gradient(90deg,#ecfdf5,#f0fdf4);color:#166534;position:relative;z-index:25; }
.incoming-call-banner.video { border-bottom-color:#bfdbfe;background:linear-gradient(90deg,#eff6ff,#f5f8ff);color:#1d4ed8; }
.incoming-call-banner.ended { border-bottom-color:#e2e8f0;background:#f8fafc;color:#64748b; }
.incoming-call-pulse { width:34px;height:34px;flex:none;border-radius:50%;display:grid;place-items:center;background:#16a34a;color:#fff;box-shadow:0 0 0 0 rgba(22,163,74,.35);animation:incoming-call-pulse 1.35s infinite; }
.incoming-call-banner.video .incoming-call-pulse { background:#2563eb;box-shadow:0 0 0 0 rgba(37,99,235,.35); }.incoming-call-banner.ended .incoming-call-pulse { background:#94a3b8;animation:none;box-shadow:none; }
.incoming-call-banner>div { min-width:0;flex:1;display:flex;flex-direction:column;gap:2px; }.incoming-call-banner strong { font-size:11.5px; }.incoming-call-banner small { overflow:hidden;color:currentColor;font-size:9.5px;opacity:.78;white-space:nowrap;text-overflow:ellipsis; }.incoming-call-time { font-size:9px;opacity:.72; }
.incoming-call-banner>button { width:27px;height:27px;border:0;border-radius:7px;background:transparent;color:currentColor;cursor:pointer; }.incoming-call-banner>button:hover { background:rgba(255,255,255,.75); }
.incoming-call-slide-enter-active,.incoming-call-slide-leave-active { transition:opacity .18s ease,transform .18s ease; }.incoming-call-slide-enter-from,.incoming-call-slide-leave-to { opacity:0;transform:translateY(-7px); }
@keyframes incoming-call-pulse { 70% { box-shadow:0 0 0 8px transparent; } 100% { box-shadow:0 0 0 0 transparent; } }

.chat-message-searchbar > i { font-size: 11px; }
.chat-message-searchbar input {
  min-width: 120px;
  flex: 1;
  height: 30px;
  padding: 0 10px;
  border: 1px solid #dbe3ec;
  border-radius: 7px;
  background: #ffffff;
  color: #0f172a;
  font-size: 11.5px;
  outline: none;
}
.chat-message-searchbar input:focus { border-color: #93c5fd; box-shadow: 0 0 0 2px rgba(59, 130, 246, .1); }
.chat-search-counter { min-width: 102px; color: #64748b; font-size: 10.5px; text-align: right; }
.chat-message-searchbar button {
  width: 27px;
  height: 27px;
  border: 0;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}
.chat-message-searchbar button:hover:not(:disabled) { background: #e8f1ff; color: #2563eb; }
.chat-message-searchbar button:disabled { opacity: .35; cursor: default; }
.chat-search-slide-enter-active,.chat-search-slide-leave-active { transition: opacity .14s ease, transform .14s ease; }
.chat-search-slide-enter-from,.chat-search-slide-leave-to { opacity: 0; transform: translateY(-5px); }
.chat-message-search-anchor { border-radius: 10px; transition: background-color .16s ease; }
.chat-message-search-anchor.search-hit { background: rgba(250, 204, 21, .08); }
.chat-message-search-anchor.search-hit-active { background: rgba(250, 204, 21, .16); }
.chat-message-search-anchor.search-hit-active :deep(.chat-bubble) { box-shadow: 0 0 0 2px rgba(234, 179, 8, .45), 0 5px 15px rgba(15, 23, 42, .08); }

.composer-message-context {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding: 7px 9px;
  border: 1px solid #dbeafe;
  border-left: 3px solid #2563eb;
  border-radius: 8px;
  background: #f8fbff;
}

.composer-message-context-icon {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  flex: none;
  border-radius: 7px;
  background: #e8f1ff;
  color: #2563eb;
  font-size: 11px;
}

.composer-message-context-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.composer-message-context-copy strong { color: #1e40af; font-size: 10.5px; }
.composer-message-context-copy small { overflow: hidden; color: #64748b; font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }

.clipboard-image-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 62px;
  padding: 8px 10px;
  border: 1px solid #dbeafe;
  border-radius: 9px;
  background: #f8fbff;
}
.clipboard-image-preview img { width: 48px; height: 48px; flex: none; border-radius: 7px; object-fit: cover; }
.clipboard-image-preview span { display: grid; min-width: 0; flex: 1; gap: 3px; }
.clipboard-image-preview strong { color: #1e3a8a; font-size: 11.5px; }
.clipboard-image-preview small { color: #64748b; font-size: 10.5px; line-height: 1.35; }

.message-delete-overlay { z-index: 10050; display: grid; place-items: center; padding: 18px; }
.message-delete-dialog { width: min(420px, 100%); padding: 22px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; box-shadow: 0 24px 60px rgba(15, 23, 42, .25); }
.message-delete-dialog { display: grid; grid-template-columns: 42px 1fr; gap: 13px; }
.message-delete-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 11px; background: #fff1f2; color: #dc2626; font-size: 17px; }
.message-delete-dialog h3 { margin: 1px 0 6px; color: #0f172a; font-size: 15px; }
.message-delete-dialog p { margin: 0; color: #64748b; font-size: 12px; line-height: 1.55; }
.message-delete-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; padding-top: 15px; border-top: 1px solid #e2e8f0; }
.message-delete-actions button { min-height: 34px; padding: 0 13px; border-radius: 7px; font-size: 11.5px; font-weight: 700; cursor: pointer; }
.message-delete-actions button:disabled { opacity: .6; cursor: wait; }
.message-delete-confirm { border: 1px solid #ef4444; background: #ef4444; color: #fff; }
.message-delete-confirm:hover:not(:disabled) { background: #dc2626; }

.bot-history-toolbar {
  display: flex;
  justify-content: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  background: #fafbfc;
}

.bot-history-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 10px;
  border: 1px solid #d7dce2;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.bot-history-toggle:hover { border-color: #bfdbfe; color: var(--brand-primary); }
.bot-history-count {
  min-width: 16px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #eff6ff;
  color: var(--brand-primary);
  font-size: 9.5px;
  text-align: center;
}

.chat-footer {
  position: relative;
  padding: 8px 16px 12px;
  background: #ffffff;
  border-top: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-mode-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 2px;
}

.chat-mode-tabs-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.chat-footer-bottom-bar {
  display: flex;
  justify-content: flex-end;
  padding: 2px 2px 0;
}

.chat-metrics-bottom-btn {
  background: transparent;
  border: none;
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.chat-metrics-bottom-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.chat-metrics-bottom-btn.active {
  color: #059669;
}

.chat-kpi-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 14px 8px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  overflow-x: auto;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
}

.chat-kpi-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  transition: all 0.12s ease;
  flex-shrink: 0;
}

.chat-kpi-close-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

.chat-kpi-bar-collapsed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 11px;
  color: #64748b;
  cursor: pointer;
  transition: background-color 0.12s ease;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
}

.chat-kpi-bar-collapsed:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.chat-kpi-collapsed-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-kpi-bar .kpi-mini-card {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.chat-kpi-bar .kpi-mini-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}

.chat-kpi-bar .kpi-mini-info {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.chat-kpi-bar .kpi-mini-label {
  font-size: 9.5px;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
}

.chat-kpi-bar .kpi-mini-value {
  font-family: var(--font-heading);
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
}

.chat-mode-btn {
  background: none;
  border: none;
  padding: 0 0 4px 0;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
}

.chat-mode-btn.active {
  color: var(--brand-primary, #2563eb);
  border-bottom-color: var(--brand-primary, #2563eb);
}

.chat-input-row {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 6px;
  background: #ffffff;
  border: 1px solid #d7dce2;
  border-radius: 8px;
  padding: 4px 6px 4px 8px;
  min-height: 42px;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.chat-input-row:focus-within {
  border-color: #77a4df;
  box-shadow: 0 0 0 3px rgba(31, 98, 208, 0.08);
}

.chat-input-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.chat-input-actions .btn-icon {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.12s ease;
}

.chat-input-actions .btn-icon:hover {
  background: #f1f5f9;
  color: var(--brand-primary, #2563eb);
}

.chat-input-actions .btn-icon.active {
  color: var(--brand-primary, #2563eb);
  background: #eff6ff;
}

.chat-input-row textarea {
  flex: 1;
  width: 100%;
  border: none !important;
  outline: none !important;
  padding: 4px 8px !important;
  font-size: 13px;
  color: #0f172a;
  background: transparent !important;
  min-height: 22px !important;
  max-height: 100px;
  height: 22px;
  resize: none !important;
  font-family: inherit;
  box-sizing: border-box;
  line-height: 1.4;
}

.composer-popover {
  position: absolute;
  left: 20px;
  bottom: 58px;
  z-index: 80;
  width: min(360px, calc(100% - 40px));
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(16, 24, 40, 0.12);
}

.composer-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--text-main);
  font-size: 12px;
  font-weight: 650;
}

.composer-search {
  width: 100%;
  box-sizing: border-box;
  height: 32px;
  margin-bottom: 8px;
  padding: 0 10px;
  border: 1px solid #d7dce2;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
}

.quick-message-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.quick-message-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #f8fafc;
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  transition: all 0.12s ease;
}

.quick-message-option:hover { background: #eff6ff; border-color: #bfdbfe; }
.quick-message-option strong { font-size: 11.5px; color: var(--brand-primary); }
.quick-message-option span { font-size: 11px; line-height: 1.4; color: var(--text-muted); }
.composer-empty { padding: 16px; text-align: center; color: var(--text-light); font-size: 11.5px; }

.emoji-popover {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  width: 252px;
}

.emoji-option {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.emoji-option:hover { background: #f1f5f9; }

.composer-send-btn {
  width: 34px !important;
  height: 34px !important;
  min-width: 34px !important;
  padding: 0 !important;
  border-radius: 8px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
  background: #059669 !important;
  box-shadow: 0 1px 3px rgba(5, 150, 105, 0.25) !important;
  border: none !important;
  color: #ffffff !important;
  cursor: pointer;
  font-size: 14px !important;
  transition: all 0.15s ease;
}

.composer-send-btn:hover {
  background: #047857 !important;
  box-shadow: 0 2px 6px rgba(5, 150, 105, 0.35) !important;
}

.recording-status {
  min-width: 0;
  flex: 1;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 10px;
  color: #d92d20;
  font-size: 12px;
}

.recording-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d92d20;
  animation: recording-pulse 1.2s infinite;
}

.recording-status strong { flex: 1; font-weight: 600; }
.recording-cancel { color: #d92d20; }
.recording-send { color: #ffffff; background: var(--brand-primary); border-color: var(--brand-primary); }

@keyframes recording-pulse {
  50% { opacity: 0.35; transform: scale(0.8); }
}

.pending-upload-bubble {
  align-self: flex-end;
  width: min(330px, 78%);
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 14px 2px auto;
  padding: 9px 12px;
  border-radius: 8px;
  color: #14532d;
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
}

.pending-upload-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #ffffff;
  background: #168a52;
  font-size: 11px;
}

.pending-upload-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pending-upload-copy strong {
  overflow: hidden;
  color: #166534;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-upload-copy small { color: #4d7c5d; font-size: 10px; }
.pending-upload-track {
  width: 100%;
  height: 4px;
  overflow: hidden;
  margin-top: 3px;
  border-radius: 2px;
  background: rgba(22, 101, 52, 0.16);
}
.pending-upload-progress {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #168a52;
  transition: width 180ms ease;
}
.pending-upload-percent {
  min-width: 28px;
  color: #15803d;
  font-size: 10.5px;
  font-weight: 700;
  text-align: right;
}

.chat-date-sticky-wrapper {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: center;
  pointer-events: none;
  padding: 4px 0;
}

.chat-date-pill {
  pointer-events: auto;
  padding: 3px 14px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  border: none;
  box-shadow: none;
}

/* Botão Flutuante Rolar para o Final */
.scroll-bottom-btn {
  position: absolute;
  right: 20px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ffffff;
  color: #64748b;
  border: 1px solid var(--border-color);
  box-shadow: 0 3px 10px rgba(16, 24, 40, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
  z-index: 30;
  transition: all 0.15s ease;
}

.scroll-bottom-btn:hover {
  background: #f8fafc;
  color: var(--brand-primary);
  border-color: #bfdbfe;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.18s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Menu de Ações Suspenso */
.actions-dropdown-wrapper {
  position: relative;
  display: inline-flex;
}

.btn-actions-trigger {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-actions-trigger:hover,
.btn-actions-trigger.active {
  background: #f1f5f9;
  color: var(--text-main);
}

.actions-menu-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 190px;
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.1);
  padding: 4px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.actions-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-main);
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
}

.actions-menu-item:hover {
  background: #f1f5f9;
}

.actions-menu-item i {
  font-size: 12.5px;
  width: 16px;
  color: #64748b;
  text-align: center;
}

.actions-menu-item.danger {
  color: #d92d20;
}

.actions-menu-item.danger i {
  color: #d92d20;
}

.actions-menu-item.danger:hover {
  background: #fef2f2;
}

.conversation-loading{flex:1;min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#94a3b8;margin:auto}.conversation-loading-icon{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:#eff6ff;color:#2563eb;font-size:18px}.conversation-loading strong{font-size:13px;color:#334155}.conversation-loading span:not(.conversation-loading-icon){font-size:11px}

/* Botão voltar (mobile) */
.chat-back-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #f1f5f9;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: #475569;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
  margin-right: 6px;
  transition: background 0.15s;
}

.chat-back-btn:hover {
  background: #e2e8f0;
  color: var(--text-main);
}

.whatsapp-disconnected-alert-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  margin: 0 16px 8px 16px;
  animation: fadeIn 0.2s ease;
}

.whatsapp-disconnected-alert-box i {
  font-size: 14px;
  color: #dc2626;
  flex-shrink: 0;
}

.chat-input-row.is-disconnected {
  opacity: 0.85;
}

@media (max-width: 768px) {
  .chat-column {
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
  }

  .chat-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .chat-back-btn {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
    flex-shrink: 0;
    margin-right: 0 !important;
  }

  .chat-header {
    padding: 8px 10px;
    gap: 8px;
  }

  .chat-header-title-box {
    max-width: 100%;
    flex: 1;
    min-width: 0;
  }

  .chat-header-avatar {
    width: 34px !important;
    height: 34px !important;
    min-width: 34px !important;
  }

  .chat-header-tools > .header-tool-btn:nth-child(1),
  .chat-header-tools > .header-tool-btn:nth-child(2),
  .history-dropdown-wrapper {
    display: none !important;
  }

  .chat-footer {
    padding: 6px 10px max(14px, env(safe-area-inset-bottom, 14px)) !important;
    padding-left: max(10px, env(safe-area-inset-left, 10px));
    padding-right: max(10px, env(safe-area-inset-right, 10px));
  }

  .chat-kpi-bar-collapsed {
    padding: 4px 10px;
  }

  .chat-kpi-bar {
    grid-template-columns: repeat(2, 1fr);
    padding: 8px;
    gap: 6px;
  }
}
</style>
