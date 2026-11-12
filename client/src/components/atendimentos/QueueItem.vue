<template>
  <div
    class="queue-item-card"
    role="button"
    tabindex="0"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
    :class="{
      active: ticket.id === (standalone ? activeId : ticketStore.activeTicketId),
      unread: ticket.unreadCount > 0,
      'incoming-call': isIncomingCall
    }"
    @click="handleClick"
  >
    <!-- Avatar com Indicador Online -->
    <div class="queue-avatar-wrap">
      <div
        class="queue-avatar-circle"
        :style="avatarColorStyle"
      >
        <img
          v-if="ticket.avatar_url && !avatarFailed"
          :src="ticket.avatar_url"
          :alt="displayName"
          referrerpolicy="no-referrer"
          @error="avatarFailed = true"
        />
        <span v-else>{{ fallbackInitials }}</span>
      </div>
      <span class="avatar-online-dot" :class="statusDotClass"></span>
    </div>

    <!-- Conteúdo do Card -->
    <div class="queue-item-body">
      <!-- Linha 1: Nome do Contato + Horário -->
      <div class="queue-row-header">
        <div class="queue-name-box">
          <strong class="queue-contact-name" :title="displayName">{{ displayName }}</strong>
          <span v-if="ticket.is_group" class="queue-group-icon" title="Grupo WhatsApp">
            <span class="queue-icon-box-sm"><i class="ri-group-line"></i></span>
          </span>
          <span
            v-if="isIncomingCall"
            class="queue-call-icon"
            :title="ticket.incomingCall?.isVideo ? 'Chamada de vídeo' : 'Chamada de voz'"
          >
            <span class="queue-icon-box-sm"><i :class="ticket.incomingCall?.isVideo ? 'ri-video-chat-line' : 'ri-phone-line'"></i></span>
          </span>
        </div>
        <span class="queue-item-time">{{ relativeTime }}</span>
      </div>

      <!-- Linha 2: Snippet da Última Mensagem -->
      <div class="queue-row-preview">
        <span class="queue-preview-text" :class="{ 'is-unread': ticket.unreadCount > 0 }">
          {{ cleanPreview(ticket.preview) }}
        </span>
      </div>

      <!-- Linha 3: Tags (Departamento, Funcionário/Alarme) + Badge de Não Lidos -->
      <div class="queue-row-tags">
        <div class="queue-tags-left">
          <!-- Tag Departamento -->
          <span class="tag-department-chip" :title="deptName || 'Monitorando 24h'">
            <span class="dept-icon-box"><i class="ri-folder-line"></i></span>
            <span>{{ deptName || 'Monitorando 24h' }}</span>
          </span>

          <!-- Tag Funcionário ou Alerta -->
          <span v-if="ticket.is_employee" class="tag-role-pill employee" title="Funcionário da empresa">
            Funcionário
          </span>
          <span v-else-if="ticket.has_alarm || ticket.department?.toLowerCase().includes('alarme')" class="tag-role-pill alarm" title="Alarme Ativado">
            Alarme ativado
          </span>
        </div>

        <!-- Badge de Mensagens Não Lidas (Círculo Verde) -->
        <span v-if="ticket.unreadCount > 0" class="queue-unread-circle" title="Mensagens não lidas">
          {{ ticket.unreadCount }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useTicketStore } from '@/stores/tickets.store'
import { splitPersonLabel } from '@/utils/person-display'

const props = defineProps({
  standalone: {type:Boolean,default:false},
  activeId: {type:String,default:null},
  ticket: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['select'])
const ticketStore = props.standalone ? null : useTicketStore()
const clockTick = ref(Date.now())
const avatarFailed = ref(false)
let clockTimer = null

onMounted(() => {
  clockTimer = setInterval(() => { clockTick.value = Date.now() }, 30000)
})

onBeforeUnmount(() => clearInterval(clockTimer))
watch(() => props.ticket.avatar_url, () => { avatarFailed.value = false })

function handleClick() {
  if (!props.standalone) ticketStore.selectTicket(props.ticket.id)
  emit('select', props.ticket.id)
}

const person = computed(() => splitPersonLabel(props.ticket.clientName || props.ticket.client_name || 'Cliente'))
const displayName = computed(() => person.value.name || 'Cliente')

const fallbackInitials = computed(() => {
  const clean = displayName.value.trim()
  if (!clean) return props.ticket.is_group ? 'GR' : 'CL'
  if (/^[A-Za-z]?\d+/.test(clean)) {
    return clean.slice(0, 3).toUpperCase()
  }
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
})

const avatarColorStyle = computed(() => {
  const name = displayName.value.trim()
  const palettes = [
    { bg: '#eff6ff', color: '#2563eb' },
    { bg: '#fef3c7', color: '#d97706' },
    { bg: '#ccfbf1', color: '#0d9488' },
    { bg: '#ffe4e6', color: '#e11d48' },
    { bg: '#f3e8ff', color: '#7c3aed' },
    { bg: '#e0f2fe', color: '#0284c7' }
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const idx = Math.abs(hash) % palettes.length
  return { backgroundColor: palettes[idx].bg, color: palettes[idx].color }
})

const deptName = computed(() => props.ticket.department || props.ticket.departments?.name || props.ticket.deptInitial || 'Monitorando 24h')
const isIncomingCall = computed(() => props.ticket.incomingCall?.status === 'ringing')

const relativeTime = computed(() => {
  const t = props.ticket.time
  if (!t) return ''
  if (t.includes(':')) {
    const parts = t.split(':')
    return `${parts[0]}:${parts[1]}`
  }
  return t
})

function cleanPreview(preview) {
  if (!preview) return 'Conversa iniciada'
  let clean = String(preview).replace(/^WhatsApp:\s*/i, '').trim()
  if (clean.startsWith('[Chatbot]')) return 'Interação com o assistente'
  clean = clean.replace(/^\[[^\]]+\]\s*/, '').trim()
  clean = clean
    .replace(/📹?\s*\[Vídeo\]/i, 'Vídeo')
    .replace(/📷?\s*\[Imagem\]/i, 'Imagem')
    .replace(/🎙️?\s*\[Mensagem de Voz\]/i, 'Mensagem de voz')
    .replace(/🎵?\s*\[Áudio\]/i, 'Áudio')
  return clean || 'Nova mensagem'
}

const statusDotClass = computed(() => {
  if (props.ticket.status_dot) return props.ticket.status_dot
  if (props.ticket.presence === 'away' || props.ticket.is_away) return 'away'
  if (props.ticket.presence === 'offline' || props.ticket.is_offline) return 'offline'
  return 'online'
})
</script>

<style scoped>
/* ─── Card da Fila (Estilo da Imagem de Referência) ────────────────────────── */
.queue-item-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  background: #ffffff;
  transition: all 0.15s ease;
  user-select: none;
  box-sizing: border-box;
}

.queue-item-card:hover {
  background: #f8fafc;
}

/* Card Ativo com Borda Esquerda Verde e Fundo Verde Suave */
.queue-item-card.active {
  background: #eefbf4 !important;
}

.queue-item-card.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 32px;
  background-color: #059669;
  border-radius: 0 4px 4px 0;
}

/* ─── Avatar com Ponto Online ────────────────────────────────────────────── */
.queue-avatar-wrap {
  position: relative;
  flex-shrink: 0;
  margin-top: 1px;
}

.queue-avatar-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.queue-avatar-circle img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid #ffffff;
}

.avatar-online-dot.away {
  background: #f59e0b;
}

.avatar-online-dot.offline {
  background: #cbd5e1;
}

/* ─── Corpo do Card ──────────────────────────────────────────────────────── */
.queue-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* Linha 1: Nome + Hora */
.queue-row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.queue-name-box {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.queue-contact-name {
  font-family: var(--font-heading);
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-group-icon {
  color: #2563eb;
  display: inline-flex;
}

.queue-call-icon {
  color: #ef4444;
  display: inline-flex;
}

.queue-icon-box-sm {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.queue-icon-box-sm i {
  font-size: 12px;
  line-height: 1;
}

.queue-item-time {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 400;
  flex-shrink: 0;
}

/* Linha 2: Snippet */
.queue-row-preview {
  display: flex;
  align-items: center;
}

.queue-preview-text {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
}

.queue-preview-text.is-unread {
  color: #1e293b;
  font-weight: 500;
}

/* Linha 3: Tags + Badge Não Lidos */
.queue-row-tags {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 3px;
}

.queue-tags-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.tag-department-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f1f5f9;
  border: none;
  color: #475569;
  font-size: 10.5px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 6px;
  white-space: nowrap;
}

.dept-icon-box {
  width: 13px;
  height: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dept-icon-box i {
  font-size: 11px;
  color: #64748b;
  line-height: 1;
}

.tag-role-pill {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  border: none;
  white-space: nowrap;
}

.tag-role-pill.employee,
.tag-role-pill.alarm {
  background: #ffedd5;
  color: #ea580c;
}

/* Badge Verde Circular de Não Lidos */
.queue-unread-circle {
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: #059669;
  color: #ffffff;
  font-size: 10.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
  margin-left: auto;
}
</style>
