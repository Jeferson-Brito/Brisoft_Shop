<template><div class="queue-column"><div class="queue-header-row"><div class="queue-header-left"><h2 class="queue-title-bold">Fila de Atendimento</h2><span class="queue-pill-badge">{{shop.conversations.length}}</span></div><div class="queue-header-right"><button class="queue-filter-btn" title="Filtros e ordenação" aria-label="Filtros e ordenação" @click="filtersOpen=!filtersOpen"><span class="queue-icon-box"><i class="ri-equalizer-line"></i></span></button></div></div><div class="queue-status-tabs-row"><button v-for="item in tabs" :key="item.id" class="queue-status-tab" :class="{active:tab===item.id}" @click="tab=item.id"><span>{{item.label}}</span><span class="tab-counter">{{count(item.id)}}</span></button></div><div class="queue-search-row"><div class="queue-search-box"><span class="search-icon-box"><i class="ri-search-line"></i></span><input v-model="query" placeholder="Buscar atendimento..." aria-label="Buscar atendimento"/><button title="Atualizar conversas" class="queue-filter-btn" @click="$emit('refresh')"><i class="ri-refresh-line"></i></button></div></div><div v-if="filtersOpen" class="shop-queue-filter"><label>Departamento<select v-model="department"><option value="ALL">Todos os departamentos</option><option value="BOT">Assistente / sem departamento</option><option v-for="d in shop.departments" :key="d.id" :value="d.id">{{d.name}}</option></select></label></div><div class="shop-queue-simulation">Simulação local · WhatsApp não conectado</div><div class="queue-list-container"><div v-if="!visible.length" class="queue-empty-message"><span class="empty-icon-box"><i class="ri-folder-open-line"></i></span><span>Nenhum atendimento nesta fila</span><RouterLink to="/simulador" class="shop-queue-create">Criar conversa de teste</RouterLink></div><QueueItem v-for="chat in visible" :key="chat.id" standalone :active-id="activeId" :ticket="ticket(chat)" @select="$emit('select',chat.id)"/></div></div></template>
<script setup>
import { computed,ref } from 'vue'
import { useRoute } from 'vue-router'
import { useShopStore } from '@/stores/shop.store'
import { normalize } from '@/utils/shop'
import QueueItem from '@/components/atendimentos/QueueItem.vue'
defineProps({activeId:{type:String,default:null}})
defineEmits(['select','refresh'])
const shop=useShopStore(),route=useRoute(),tab=ref('all'),query=ref(''),department=ref(String(route.query.departamento||'ALL')),filtersOpen=ref(!!route.query.departamento)
const tabs=[{id:'all',label:'Todos'},{id:'waiting',label:'Aguardando'},{id:'human',label:'Em atend.'}]
const count=id=>shop.conversations.filter(c=>id==='all'||c.status===id).length
const visible=computed(()=>shop.conversations.filter(c=>(tab.value==='all'||c.status===tab.value)&&(department.value==='ALL'||department.value==='BOT'&&!c.department_id||c.department_id===department.value)&&normalize(c.customer_name+' '+c.last_message+' '+(c.department_name||'')).includes(normalize(query.value))))
const ticket=c=>({id:c.id,clientName:c.customer_name,department:c.department_name||'Assistente do catálogo',preview:c.last_message,time:new Date(c.updated_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),status:c.status==='human'?'em_atendimento':'aguardando',unreadCount:0})
</script>

<style scoped>
/* ─── Coluna da Fila (Estilo da Imagem de Referência) ─────────────────────── */
.queue-column {
  width: 290px;
  min-width: 270px;
  max-width: 300px;
  flex-shrink: 0;
  background-color: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}

/* 1. Header */
.queue-header-row {
  height: 52px;
  min-height: 52px;
  padding: 14px 12px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}

.queue-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.queue-title-bold {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  letter-spacing: -0.01em;
}

.queue-pill-badge {
  background: #d1fae5;
  color: #059669;
  border: none;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  line-height: 1.3;
}

.queue-header-right {
  display: flex;
  align-items: center;
  position: relative;
}

.queue-filter-btn {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s ease;
}

.queue-filter-btn:hover {
  background: #f8fafc;
  color: #0f172a;
}

.queue-filter-btn.is-open,
.queue-filter-btn.has-filter {
  background: #ecfdf5;
  color: #059669;
}

.filter-badge-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: #10b981;
  border: 1.5px solid #ffffff;
}

/* Popover de Filtros */
.queue-filter-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 290px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.06);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: filterPop 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.filter-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
  background: #fafafa;
}

.filter-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.filter-title-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #059669;
  font-size: 14px;
}

.filter-close-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.filter-close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.filter-popover-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 11.5px;
  font-weight: 600;
  color: #475569;
}

.filter-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.filter-select {
  width: 100%;
  height: 34px;
  padding: 0 28px 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  font-size: 12px;
  color: #1e293b;
  appearance: none;
  outline: none;
  transition: border-color 0.15s ease;
}

.filter-select:focus {
  border-color: #059669;
  box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.1);
}

.select-chevron {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: #94a3b8;
  display: flex;
  align-items: center;
  font-size: 14px;
}

.filter-checkbox-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f8fafc;
  padding: 8px 10px;
  border-radius: 8px;
}

.filter-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  user-select: none;
}

.filter-checkbox-label input[type="checkbox"] {
  accent-color: #059669;
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.filter-popover-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #f1f5f9;
  background: #fafafa;
}

.filter-reset-btn {
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: #ef4444;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.filter-reset-btn:hover {
  background: #fee2e2;
}

.filter-apply-btn {
  border: none;
  background: #059669;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 14px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.filter-apply-btn:hover {
  background: #047857;
}

/* Transição do popover */
.filter-fade-slide-enter-active,
.filter-fade-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.filter-fade-slide-enter-from,
.filter-fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 2. Trilho de Abas em Cápsula (Aguardando 30  Grupos 17  Em atend. 1) */
.queue-status-tabs-row {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 3px;
  margin: 0 12px 10px;
  gap: 2px;
}

.queue-status-tab {
  flex: 1;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.queue-status-tab:hover {
  color: #0f172a;
}

.queue-status-tab.active {
  background: #ffffff !important;
  color: #0f172a !important;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-counter {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.queue-status-tab.active .tab-counter {
  color: #94a3b8;
  font-weight: 500;
}

/* 3. Campo de Busca */
.queue-search-row {
  padding: 0 12px 10px;
}

.queue-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 12px;
  transition: all 0.15s ease;
}

.queue-search-box:focus-within {
  background: #ffffff;
  border-color: #059669;
  box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.1);
}

.search-mag-icon {
  font-size: 13px;
  color: #94a3b8;
  flex-shrink: 0;
}

.queue-search-box input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #0f172a;
  outline: none;
}

.queue-search-box input::placeholder {
  color: #94a3b8;
}

.clear-input-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  font-size: 11px;
}

/* 4. Lista de Itens */
.queue-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.queue-icon-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.queue-icon-box i {
  font-size: 15px;
  line-height: 1;
}

.search-icon-box {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  flex-shrink: 0;
}

.search-icon-box i {
  font-size: 14px;
  line-height: 1;
}

.clear-icon-box {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-icon-box i {
  font-size: 13px;
  line-height: 1;
}

.empty-icon-box {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon-box i {
  font-size: 28px;
  color: #cbd5e1;
  line-height: 1;
}

.queue-empty-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 16px;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 768px) {
  .queue-column {
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
    border-right: none !important;
  }
  .queue-list-container {
    padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
  }
}
</style>
