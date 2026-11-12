<template>
  <!-- Mensagens de Sistema / Notificações / Dividers -->
  <div
    v-if="isSystemMessage"
    class="chat-divider-row"
  >
    <div class="chat-divider-pill" style="white-space:pre-wrap;">{{ formattedSystemText }}</div>
  </div>

  <!-- Mensagens do Cliente (Incoming) -->
  <div v-else-if="msg.sender === 'client'" class="chat-bubble-row">
    <div
      class="initial-avatar"
      style="width:28px;height:28px;font-size:10px;flex-shrink:0;"
      :style="{ backgroundColor: avatarColor || '#2563eb' }"
    >
      <img v-if="avatarUrl && !avatarFailed" :src="avatarUrl" alt="Foto do cliente" referrerpolicy="no-referrer" @error="avatarFailed = true" />
      <span v-else>{{ initials || 'CL' }}</span>
    </div>
    <div class="message-bubble-shell incoming-shell">
      <button v-if="msg.id && interactive" ref="actionsTriggerRef" type="button" class="message-actions-trigger" aria-label="Opções da mensagem" @click.stop="toggleActions">
        <i class="ri-arrow-down-s-line"></i>
      </button>
    <div class="chat-bubble incoming">
      <!-- Identificação de quem enviou (Cliente / Participante do Grupo) -->
      <div v-if="incomingSenderInfo" class="message-author-chip incoming">
        <i :class="incomingSenderInfo.icon" class="author-icon"></i>
        <span class="author-name">{{ incomingSenderInfo.name }}</span>
        <span v-if="incomingSenderInfo.badge" class="author-badge incoming">{{ incomingSenderInfo.badge }}</span>
      </div>
      <div v-if="replyPreview" class="message-reply-preview">
        <strong>{{ replySender || 'Mensagem respondida' }}</strong>
        <span>{{ replyPreview }}</span>
      </div>
      <div v-if="isReaction" class="reaction-card">
        <div class="reaction-quote">{{ reactionData.preview }}</div>
        <div class="reaction-result">
          <span class="reaction-emoji">{{ reactionData.emoji }}</span>
          <span>{{ reactionData.removed ? 'Reação removida' : 'Reagiu a esta mensagem' }}</span>
        </div>
      </div>

      <div v-if="hasMedia && mediaLoading" class="media-status-card">
        <i class="ri-loader-4-line ri-spin"></i>
        <span>Carregando mídia...</span>
      </div>

      <div v-else-if="hasMedia && mediaUnavailable" class="media-status-card media-status-error">
        <i class="ri-error-warning-line"></i>
        <span>Não foi possível carregar esta mídia.</span>
        <button type="button" class="media-retry-button" @click="retryMedia">Tentar novamente</button>
      </div>

      <!-- Card para Mídia Grande (> 5MB) sob demanda -->
      <div v-if="isLargeMediaItem && !showLargeInline" class="large-media-box" :class="{ outgoing: msg.sender === 'agent' }">
        <div class="large-media-header">
          <div class="large-media-icon">
            <i :class="isVideo ? 'ri-film-line' : 'ri-image-line'"></i>
          </div>
          <div class="large-media-meta">
            <span class="large-media-title">{{ isVideo ? 'Vídeo' : 'Imagem' }}</span>
            <span class="large-media-size">{{ formattedMediaSize }}</span>
            <span class="large-media-badge"><i class="ri-error-warning-line"></i> Acima de 5 MB</span>
          </div>
        </div>
        <div class="large-media-actions">
          <button
            type="button"
            class="btn-download-large-media"
            :disabled="downloadingToPc"
            @click.stop="downloadToPc"
          >
            <i v-if="downloadingToPc" class="ri-loader-4-line ri-spin"></i>
            <i v-else class="ri-download-2-line"></i>
            <span>{{ downloadingToPc ? 'Baixando...' : (downloadedBlobUrl ? 'Baixar novamente' : 'Baixar mídia') }}</span>
          </button>
          <button
            v-if="downloadedBlobUrl"
            type="button"
            class="btn-view-inline"
            @click.stop="showLargeInline = true"
          >
            <i class="ri-eye-line"></i>
            <span>Visualizar no chat</span>
          </button>
        </div>
      </div>

      <!-- Imagem -->
      <div v-else-if="isImage" style="margin-bottom:6px;">
        <img
          :src="resolvedMediaSrc"
          alt="Imagem recebida"
          style="max-width:260px;max-height:260px;border-radius:8px;cursor:pointer;object-fit:cover;display:block;"
          @click="showImageZoom = true"
          @error="mediaLoadError = true"
        />
        <div v-if="isLargeMediaItem && showLargeInline" style="margin-top:4px;">
          <button type="button" class="btn-view-inline" style="width:auto;padding:4px 8px;font-size:11px;" @click.stop="downloadToPc">
            <i class="ri-download-2-line"></i> Baixar no PC
          </button>
        </div>
      </div>

      <!-- Áudio / Mensagem de Voz -->
      <div v-else-if="isAudio" class="custom-audio-player incoming" style="margin-bottom:6px;">
        <button type="button" class="audio-play-btn" :class="{ playing: isPlayingAudio }" title="Tocar áudio" @click.stop="toggleAudioPlayback">
          <i :class="isPlayingAudio ? 'ri-pause-line' : 'ri-play-line'"></i>
        </button>
        <div class="audio-waveform-container" @click.stop="seekAudio">
          <div class="audio-waveform-bars">
            <span
              v-for="(barHeight, bIdx) in waveformHeights"
              :key="bIdx"
              class="audio-bar"
              :class="{ active: (bIdx / waveformHeights.length) <= audioProgress }"
              :style="{ height: `${barHeight}px` }"
            ></span>
          </div>
        </div>
        <span class="audio-duration">{{ formattedAudioDuration }}</span>
        <audio
          ref="audioElementRef"
          :src="resolvedMediaSrc"
          preload="metadata"
          style="display:none;"
          @timeupdate="onAudioTimeUpdate"
          @loadedmetadata="onAudioLoadedMetadata"
          @ended="onAudioEnded"
          @error="mediaLoadError = true"
        ></audio>
      </div>

      <!-- Vídeo -->
      <div v-else-if="isVideo" style="margin-bottom:6px;">
        <video controls preload="metadata" :src="resolvedMediaSrc" style="max-width:280px;max-height:260px;border-radius:8px;display:block;" @error="mediaLoadError = true"></video>
        <div v-if="isLargeMediaItem && showLargeInline" style="margin-top:4px;">
          <button type="button" class="btn-view-inline" style="width:auto;padding:4px 8px;font-size:11px;" @click.stop="downloadToPc">
            <i class="ri-download-2-line"></i> Baixar no PC
          </button>
        </div>
      </div>

      <!-- Documento -->
      <div v-else-if="isDocument" style="margin-bottom:6px;">
        <a
          :href="resolvedMediaSrc"
          target="_blank"
          download
          style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;color:#2563eb;text-decoration:none;font-weight:600;font-size:12px;"
        >
          <i class="ri-file-download-line" style="font-size:16px;"></i>
          <span>{{ documentName }}</span>
        </a>
      </div>

      <!-- Texto / Legenda -->
      <div v-if="displayText" style="white-space:pre-wrap;">{{ displayText }}</div>
      <div class="chat-bubble-time">{{ displayTime }}</div>
    </div>
    </div>
  </div>

  <!-- Mensagens do Atendente (Outgoing) -->
  <div v-else class="chat-bubble-row outgoing">
    <div class="message-bubble-shell outgoing-shell">
      <button v-if="!isDeleted && interactive" ref="actionsTriggerRef" type="button" class="message-actions-trigger" aria-label="Opções da mensagem" @click.stop="toggleActions">
        <i class="ri-arrow-down-s-line"></i>
      </button>
    <div class="chat-bubble outgoing">
      <!-- Identificação de quem enviou (Atendente, Bot, WhatsApp direto) -->
      <div v-if="!isDeleted && outgoingSenderInfo" class="message-author-chip outgoing">
        <i :class="outgoingSenderInfo.icon" class="author-icon"></i>
        <span class="author-name">{{ outgoingSenderInfo.name }}</span>
        <span v-if="outgoingSenderInfo.badge" class="author-badge" :class="outgoingSenderInfo.type">
          {{ outgoingSenderInfo.badge }}
        </span>
      </div>

      <div v-if="replyPreview" class="message-reply-preview">
        <strong>{{ replySender || 'Mensagem respondida' }}</strong>
        <span>{{ replyPreview }}</span>
      </div>

      <div v-if="isDeleted" class="deleted-message">
        <i class="ri-forbid-2-line"></i> Esta mensagem foi excluída
      </div>

      <div v-else-if="isReaction" class="reaction-card">
        <div class="reaction-quote">{{ reactionData.preview }}</div>
        <div class="reaction-result">
          <span class="reaction-emoji">{{ reactionData.emoji }}</span>
          <span>{{ reactionData.removed ? 'Reação removida' : 'Reagiu a esta mensagem' }}</span>
        </div>
      </div>

      <div v-if="hasMedia && mediaLoading" class="media-status-card">
        <i class="ri-loader-4-line ri-spin"></i>
        <span>Carregando mídia...</span>
      </div>

      <div v-else-if="hasMedia && mediaUnavailable" class="media-status-card media-status-error">
        <i class="ri-error-warning-line"></i>
        <span>Não foi possível carregar esta mídia.</span>
        <button type="button" class="media-retry-button" @click="retryMedia">Tentar novamente</button>
      </div>

      <!-- Card para Mídia Grande (> 5MB) sob demanda -->
      <div v-if="isLargeMediaItem && !showLargeInline" class="large-media-box" :class="{ outgoing: msg.sender === 'agent' }">
        <div class="large-media-header">
          <div class="large-media-icon">
            <i :class="isVideo ? 'ri-film-line' : 'ri-image-line'"></i>
          </div>
          <div class="large-media-meta">
            <span class="large-media-title">{{ isVideo ? 'Vídeo' : 'Imagem' }}</span>
            <span class="large-media-size">{{ formattedMediaSize }}</span>
            <span class="large-media-badge"><i class="ri-error-warning-line"></i> Acima de 5 MB</span>
          </div>
        </div>
        <div class="large-media-actions">
          <button
            type="button"
            class="btn-download-large-media"
            :disabled="downloadingToPc"
            @click.stop="downloadToPc"
          >
            <i v-if="downloadingToPc" class="ri-loader-4-line ri-spin"></i>
            <i v-else class="ri-download-2-line"></i>
            <span>{{ downloadingToPc ? 'Baixando...' : (downloadedBlobUrl ? 'Baixar novamente' : 'Baixar mídia') }}</span>
          </button>
          <button
            v-if="downloadedBlobUrl"
            type="button"
            class="btn-view-inline"
            @click.stop="showLargeInline = true"
          >
            <i class="ri-eye-line"></i>
            <span>Visualizar no chat</span>
          </button>
        </div>
      </div>

      <!-- Imagem enviada pelo atendente -->
      <div v-else-if="isImage" style="margin-bottom:6px;">
        <img
          :src="resolvedMediaSrc"
          alt="Imagem enviada"
          style="max-width:260px;max-height:260px;border-radius:8px;cursor:pointer;object-fit:cover;display:block;"
          @click="showImageZoom = true"
          @error="mediaLoadError = true"
        />
        <div v-if="isLargeMediaItem && showLargeInline" style="margin-top:4px;">
          <button type="button" class="btn-view-inline" style="width:auto;padding:4px 8px;font-size:11px;" @click.stop="downloadToPc">
            <i class="ri-download-2-line"></i> Baixar no PC
          </button>
        </div>
      </div>

      <!-- Áudio enviado -->
      <div v-else-if="isAudio" class="custom-audio-player outgoing" style="margin-bottom:6px;">
        <button type="button" class="audio-play-btn" :class="{ playing: isPlayingAudio }" title="Tocar áudio" @click.stop="toggleAudioPlayback">
          <i :class="isPlayingAudio ? 'ri-pause-line' : 'ri-play-line'"></i>
        </button>
        <div class="audio-waveform-container" @click.stop="seekAudio">
          <div class="audio-waveform-bars">
            <span
              v-for="(barHeight, bIdx) in waveformHeights"
              :key="bIdx"
              class="audio-bar"
              :class="{ active: (bIdx / waveformHeights.length) <= audioProgress }"
              :style="{ height: `${barHeight}px` }"
            ></span>
          </div>
        </div>
        <span class="audio-duration">{{ formattedAudioDuration }}</span>
        <audio
          ref="audioElementRef"
          :src="resolvedMediaSrc"
          preload="metadata"
          style="display:none;"
          @timeupdate="onAudioTimeUpdate"
          @loadedmetadata="onAudioLoadedMetadata"
          @ended="onAudioEnded"
          @error="mediaLoadError = true"
        ></audio>
      </div>

      <!-- Vídeo enviado -->
      <div v-else-if="isVideo" style="margin-bottom:6px;">
        <video controls preload="metadata" :src="resolvedMediaSrc" style="max-width:280px;max-height:260px;border-radius:8px;display:block;" @error="mediaLoadError = true"></video>
        <div v-if="isLargeMediaItem && showLargeInline" style="margin-top:4px;">
          <button type="button" class="btn-view-inline" style="width:auto;padding:4px 8px;font-size:11px;" @click.stop="downloadToPc">
            <i class="ri-download-2-line"></i> Baixar no PC
          </button>
        </div>
      </div>

      <!-- Documento enviado -->
      <div v-else-if="isDocument" style="margin-bottom:6px;">
        <a
          :href="resolvedMediaSrc"
          target="_blank"
          download
          style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1d4ed8;text-decoration:none;font-weight:600;font-size:12px;"
        >
          <i class="ri-file-download-line" style="font-size:16px;"></i>
          <span>{{ documentName }}</span>
        </a>
      </div>

      <!-- Texto / Legenda -->
      <div v-if="displayText" style="white-space:pre-wrap;">{{ displayText }}</div>
      <div class="chat-bubble-time">
        {{ displayTime }}
        <span v-if="msg.edited_at && !isDeleted" class="edited-label">editada</span>
        <i class="ri-check-double-line" style="margin-left:3px;"></i>
      </div>
    </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showActions" class="message-actions-menu" :style="actionsMenuStyle" @click.stop>
      <button type="button" @click="chooseReply"><i class="ri-reply-line"></i> Responder</button>
      <button v-if="canCopyMessage" type="button" @click="copyMessage"><i class="ri-file-copy-line"></i> Copiar</button>
      <button v-if="canEditMessage" type="button" @click="chooseEdit"><i class="ri-edit-line"></i> Editar</button>
      <button v-if="canDeleteMessage" type="button" class="danger" @click="chooseDelete"><i class="ri-delete-bin-line"></i> Excluir para todos</button>
    </div>
  </Teleport>

  <!-- Zoom de Imagem (Modal Lightbox) -->
  <Teleport to="body">
    <div
      v-if="showImageZoom"
      class="modal-overlay active"
      style="z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;cursor:pointer;"
      @click="showImageZoom = false"
    >
      <div style="position:relative;max-width:90vw;max-height:90vh;">
        <img
          :src="resolvedMediaSrc"
          alt="Imagem ampliada"
          style="max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);object-fit:contain;"
        />
        <button
          type="button"
          class="btn-icon"
          style="position:absolute;top:-12px;right:-12px;background:#ffffff;border-radius:50%;width:32px;height:32px;box-shadow:0 4px 6px rgba(0,0,0,0.3);"
          @click.stop="showImageZoom = false"
        >
          <i class="ri-close-line"></i>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  cleanMediaDisplayText,
  getDocumentDisplayName,
  getMediaSource,
  getProtectedMediaPath,
  LARGE_MEDIA_THRESHOLD_BYTES,
  formatFileSize,
  getMediaDownloadName
} from '@/utils/media-message'
import { loadProtectedMedia, fetchMediaInfo } from '@/utils/protected-media-cache'

const companyTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

const props = defineProps({
  interactive: { type:Boolean, default:true },
  msg: {
    type: Object,
    required: true
  },
  initials: {
    type: String,
    default: 'CL'
  },
  avatarColor: {
    type: String,
    default: '#2563eb'
  },
  avatarUrl: {
    type: String,
    default: ''
  },
  currentUserId: {
    type: [String, Number],
    default: null
  },
  isGroup: {
    type: Boolean,
    default: false
  },
  allowDeviceMessageMutations: {
    type: Boolean,
    default: false
  },
  currentUserName: {
    type: String,
    default: ''
  },
  clientName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['reply', 'edit', 'delete', 'copied'])

const showImageZoom = ref(false)
const showActions = ref(false)
const actionsTriggerRef = ref(null)
const actionsMenuStyle = ref({})
const mediaLoading = ref(false)
const mediaLoadError = ref(false)
const avatarFailed = ref(false)

watch(() => props.avatarUrl, () => { avatarFailed.value = false })

const displayTime = computed(() => {
  const timestamp = props.msg?.created_at || props.msg?.createdAt
  if (timestamp) {
    const date = new Date(timestamp)
    if (!Number.isNaN(date.getTime())) return companyTimeFormatter.format(date)
  }

  return props.msg?.time || ''
})

const isBotStateMessage = computed(() => {
  const t = props.msg?.text || ''
  return typeof t === 'string' && t.startsWith('[Chatbot][State]')
})

const isSystemMessage = computed(() => {
  if (isBotStateMessage.value) return false
  const t = props.msg?.text || ''
  return (
    props.msg?.type === 'divider' ||
    props.msg?.type === 'system' ||
    props.msg?.sender === 'system' ||
    t.startsWith('[Chatbot]') ||
    t.startsWith('🤖') ||
    t.startsWith('Atendimento assumido') ||
    t.startsWith('✅') ||
    t.startsWith('⭐') ||
    t.startsWith('📜') ||
    t.startsWith('⚡') ||
    t.startsWith('🔄') ||
    t.startsWith('📌 NOTA INTERNA') ||
    t.includes('Atendimento finalizado') ||
    t.includes('Atendimento encerrado') ||
    t.includes('Atendimento assumido') ||
    t.includes('Histórico anterior') ||
    t.includes('Atendimento Atual') ||
    t.includes('Avaliação do cliente')
  )
})

const formattedSystemText = computed(() => {
  return (props.msg?.text || '').replace(/\*/g, '')
})

// Identifica URL e tipo de mídia
const mediaSrc = computed(() => {
  return getMediaSource(props.msg)
})

const isImage = computed(() => {
  if (props.msg?.deleted_at) return false
  if (props.msg?.type === 'image' || props.msg?.type === 'sticker') return true
  if (mediaSrc.value && (mediaSrc.value.endsWith('.jpg') || mediaSrc.value.endsWith('.png') || mediaSrc.value.endsWith('.webp') || mediaSrc.value.endsWith('.jpeg'))) return true
  return false
})

const isAudio = computed(() => {
  if (props.msg?.deleted_at) return false
  if (props.msg?.type === 'audio') return true
  if (mediaSrc.value && (mediaSrc.value.endsWith('.ogg') || mediaSrc.value.endsWith('.mp3') || mediaSrc.value.endsWith('.m4a') || mediaSrc.value.endsWith('.wav'))) return true
  return false
})

const isVideo = computed(() => {
  if (props.msg?.deleted_at) return false
  if (props.msg?.type === 'video') return true
  if (mediaSrc.value && (mediaSrc.value.endsWith('.mp4') || mediaSrc.value.endsWith('.webm') || mediaSrc.value.endsWith('.mov'))) return true
  return false
})

const isDocument = computed(() => {
  if (props.msg?.deleted_at) return false
  if (props.msg?.type === 'document') return true
  if (mediaSrc.value && !isImage.value && !isAudio.value && !isVideo.value) return true
  return false
})

const discoveredSize = ref(null)
const downloadingToPc = ref(false)
const showLargeInline = ref(false)
const downloadedBlobUrl = ref(null)

const effectiveMediaSize = computed(() => {
  if (discoveredSize.value !== null) return discoveredSize.value
  const fromMsg = props.msg?.media_size ?? props.msg?.file_size
  if (fromMsg !== undefined && fromMsg !== null && !Number.isNaN(Number(fromMsg))) return Number(fromMsg)
  return null
})

const isLargeMediaItem = computed(() => {
  // Áudio nunca tem limite de MB ("áudio não pode ter limite de MB")
  if (isAudio.value) return false
  if (!isImage.value && !isVideo.value) return false
  if (effectiveMediaSize.value !== null) {
    return effectiveMediaSize.value > LARGE_MEDIA_THRESHOLD_BYTES
  }
  return false
})

const formattedMediaSize = computed(() => {
  return formatFileSize(effectiveMediaSize.value || 0)
})

const downloadFileName = computed(() => {
  return getMediaDownloadName(props.msg, mediaSrc.value)
})

async function downloadToPc() {
  if (downloadingToPc.value || !mediaSrc.value) return
  downloadingToPc.value = true
  try {
    const blobUrl = resolvedMediaSrc.value || await loadProtectedMedia(mediaSrc.value)
    resolvedMediaSrc.value = blobUrl
    downloadedBlobUrl.value = blobUrl

    const a = document.createElement('a')
    a.href = blobUrl
    a.download = downloadFileName.value || (isVideo.value ? 'video.mp4' : 'imagem.jpg')
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch (error) {
    console.error('Falha ao baixar mídia para o PC:', error)
    mediaLoadError.value = true
  } finally {
    downloadingToPc.value = false
  }
}

watch(showLargeInline, show => {
  if (show && !resolvedMediaSrc.value && mediaSrc.value) {
    resolveMedia(mediaSrc.value)
  }
})

const resolvedMediaSrc = ref(null)

async function resolveMedia(source) {
  resolvedMediaSrc.value = null
  mediaLoading.value = false
  mediaLoadError.value = false
  if (!source) return

  if ((isImage.value || isVideo.value) && effectiveMediaSize.value === null) {
    fetchMediaInfo(source).then(info => {
      if (info?.size) discoveredSize.value = info.size
    }).catch(() => {})
  }

  // Mídias > 5MB não são baixadas automaticamente
  if (isLargeMediaItem.value && !showLargeInline.value && !downloadedBlobUrl.value) {
    return
  }

  mediaLoading.value = true
  if (getProtectedMediaPath(source)) {
    try {
      resolvedMediaSrc.value = await loadProtectedMedia(source)
    } catch (error) {
      mediaLoadError.value = true
      console.error('Não foi possível carregar o anexo protegido.', error)
    } finally {
      mediaLoading.value = false
    }
    return
  }

  try {
    const url = new URL(source, window.location.origin)
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'blob:') {
      resolvedMediaSrc.value = url.href
      mediaLoading.value = false
    }
  } catch {
    mediaLoadError.value = true
    mediaLoading.value = false
    resolvedMediaSrc.value = null
  }
}

watch(mediaSrc, resolveMedia, { immediate: true })

function retryMedia() {
  if (mediaSrc.value) resolveMedia(mediaSrc.value)
}

const hasMedia = computed(() => !isDeleted.value && (isImage.value || isAudio.value || isVideo.value || isDocument.value))
const mediaUnavailable = computed(() => mediaLoadError.value || !mediaSrc.value || (!resolvedMediaSrc.value && (!isLargeMediaItem.value || showLargeInline.value)))

const reactionData = computed(() => {
  if (props.msg?.type !== 'reaction') return null
  try {
    const parsed = JSON.parse(props.msg?.text || '{}')
    return {
      emoji: parsed.emoji || '👍',
      preview: parsed.preview || 'Mensagem',
      removed: parsed.removed === true
    }
  } catch {
    return { emoji: '👍', preview: props.msg?.text || 'Mensagem', removed: false }
  }
})
const isReaction = computed(() => Boolean(reactionData.value))
const isDeleted = computed(() => Boolean(props.msg?.deleted_at))
const replyPreview = computed(() => props.msg?.reply_preview || '')
const replySender = computed(() => props.msg?.reply_sender || '')

const documentName = computed(() => {
  return getDocumentDisplayName(props.msg, mediaSrc.value)
})

// Extrai *Nome*:\n\nTexto ou *Nome:* Texto para mensagens do atendente
const agentMatch = computed(() => {
  const text = props.msg?.text || ''
  return text.match(/^\*(.+?):?\*:?\s*([\s\S]*)$/)
})

const agentName = computed(() => agentMatch.value ? agentMatch.value[1] : null)
const isDirectWhatsapp = computed(() => props.msg?.sender_type === 'whatsapp_device'
  || String(props.msg?.sender_name || '').startsWith('WhatsApp (')
  || String(agentName.value || '').startsWith('WhatsApp ('))

// Identificação completa de quem enviou mensagem de saída (lado direito: Atendente / Bot / WhatsApp)
const outgoingSenderInfo = computed(() => {
  const text = String(props.msg?.text || '')

  // 1. Bot / Assistente Virtual
  if (
    props.msg?.sender_type === 'bot' ||
    props.msg?.message_context === 'bot' ||
    props.msg?.sender_name === 'Bot' ||
    props.msg?.is_bot ||
    text.startsWith('[Chatbot]')
  ) {
    return {
      type: 'bot',
      name: 'Assistente Virtual',
      badge: 'Bot',
      icon: 'ri-robot-line'
    }
  }

  // 2. WhatsApp conectado diretamente (Aparelho ou WhatsApp Web)
  if (
    props.msg?.sender_type === 'whatsapp_device' ||
    String(props.msg?.sender_name || '').startsWith('WhatsApp (') ||
    String(agentName.value || '').startsWith('WhatsApp (') ||
    isDirectWhatsapp.value
  ) {
    const rawName = props.msg?.sender_name || agentName.value || 'WhatsApp'
    return {
      type: 'whatsapp',
      name: rawName.includes('(') ? rawName : 'WhatsApp (Aparelho)',
      badge: 'Aparelho',
      icon: 'ri-whatsapp-line'
    }
  }

  // 3. Atendente Humano
  let name = agentName.value || props.msg?.sender_name || props.msg?.agent_name
  if (!name || name.toLowerCase() === 'agent' || name.toLowerCase() === 'atendente') {
    if (props.msg?.user_id && String(props.msg.user_id) === String(props.currentUserId) && props.currentUserName) {
      name = props.currentUserName
    } else {
      name = 'Atendente'
    }
  }

  return {
    type: 'agent',
    name: name,
    badge: null,
    icon: 'ri-user-line'
  }
})

// Identificação completa de quem enviou mensagem de entrada (lado esquerdo: Cliente / Membro do Grupo)
const incomingSenderInfo = computed(() => {
  if (props.isGroup) {
    return {
      name: props.msg?.sender_name || 'Participante',
      icon: 'ri-group-line',
      badge: null
    }
  }

  const name = props.msg?.sender_name || props.clientName || 'Cliente'
  return {
    name: name,
    icon: 'ri-user-line',
    badge: null
  }
})

const canManageOutgoingMessage = computed(() => props.msg?.sender === 'agent'
  && Boolean(props.msg?.id)
  && (isDirectWhatsapp.value
    ? props.allowDeviceMessageMutations
    : (Boolean(props.currentUserId) && String(props.msg?.user_id || '') === String(props.currentUserId)))
  && !isDeleted.value)

const canEditMessage = computed(() => canManageOutgoingMessage.value
  && (!props.msg?.type || props.msg.type === 'text')
  && Boolean(displayText.value))
const canDeleteMessage = computed(() => canManageOutgoingMessage.value)

const displayText = computed(() => {
  if (isDeleted.value) return ''
  if (isReaction.value) return ''
  let raw = agentMatch.value ? agentMatch.value[2] : props.msg?.text || ''
  if (raw.startsWith('[Chatbot]')) {
    raw = raw.replace(/^\[Chatbot\]\s*/, '')
  }
  return cleanMediaDisplayText(raw, Boolean(mediaSrc.value))
})
const canCopyMessage = computed(() => Boolean(displayText.value))

function toggleActions() {
  showActions.value = !showActions.value
  if (showActions.value) positionActionsMenu()
}

function positionActionsMenu() {
  const rect = actionsTriggerRef.value?.getBoundingClientRect()
  if (!rect) return
  const width = 178
  const estimatedHeight = canDeleteMessage.value ? 154 : 82
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, props.msg?.sender === 'agent' ? rect.right - width : rect.left))
  const belowTop = rect.bottom + 5
  const top = belowTop + estimatedHeight <= window.innerHeight - 8
    ? belowTop
    : Math.max(8, rect.top - estimatedHeight - 5)
  actionsMenuStyle.value = { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${width}px` }
}

function closeActions() {
  showActions.value = false
}

function chooseReply() {
  closeActions()
  emit('reply', props.msg)
}

function chooseEdit() {
  closeActions()
  emit('edit', props.msg)
}

function chooseDelete() {
  closeActions()
  emit('delete', props.msg)
}

async function copyMessage() {
  const text = displayText.value || replyPreview.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    emit('copied')
  } catch {
    emit('copied', false)
  }
  closeActions()
}

const audioElementRef = ref(null)
const isPlayingAudio = ref(false)
const audioCurrentTime = ref(0)
const audioDuration = ref(0)
const waveformHeights = [4, 7, 12, 16, 9, 6, 14, 18, 11, 8, 15, 12, 7, 14, 16, 10, 6, 13, 9, 5, 12, 8, 14, 10, 6, 11, 8, 4]

const audioProgress = computed(() => {
  if (!audioDuration.value || audioDuration.value === 0) return 0
  return Math.min(1, Math.max(0, audioCurrentTime.value / audioDuration.value))
})

const formattedAudioDuration = computed(() => {
  const targetTime = isPlayingAudio.value ? audioCurrentTime.value : (audioDuration.value || 0)
  const mins = Math.floor(targetTime / 60)
  const secs = Math.floor(targetTime % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
})

function toggleAudioPlayback() {
  if (!audioElementRef.value) return
  if (isPlayingAudio.value) {
    audioElementRef.value.pause()
    isPlayingAudio.value = false
  } else {
    document.querySelectorAll('audio').forEach(el => {
      if (el !== audioElementRef.value) el.pause()
    })
    audioElementRef.value.play().catch(e => console.warn('Erro ao tocar áudio:', e))
    isPlayingAudio.value = true
  }
}

function onAudioTimeUpdate() {
  if (audioElementRef.value) {
    audioCurrentTime.value = audioElementRef.value.currentTime
  }
}

function onAudioLoadedMetadata() {
  if (audioElementRef.value && Number.isFinite(audioElementRef.value.duration)) {
    audioDuration.value = audioElementRef.value.duration
  }
}

function onAudioEnded() {
  isPlayingAudio.value = false
  audioCurrentTime.value = 0
}

function seekAudio(event) {
  if (!audioElementRef.value || !audioDuration.value) return
  const rect = event.currentTarget.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const ratio = Math.min(1, Math.max(0, clickX / rect.width))
  audioElementRef.value.currentTime = ratio * audioDuration.value
  audioCurrentTime.value = audioElementRef.value.currentTime
}

onMounted(() => {
  document.addEventListener('click', closeActions)
  window.addEventListener('resize', closeActions)
  window.addEventListener('scroll', closeActions, true)
})
onUnmounted(() => {
  document.removeEventListener('click', closeActions)
  window.removeEventListener('resize', closeActions)
  window.removeEventListener('scroll', closeActions, true)
})
</script>

<style scoped>
.initial-avatar { overflow: hidden; }
.initial-avatar img { width: 100%; height: 100%; object-fit: cover; }

.direct-whatsapp-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 5px;
  padding: 1.5px 5px;
  border-radius: 4px;
  background: #dcfce7;
  color: #15803d;
  font-size: 9px;
  font-weight: 700;
}

.message-bubble-shell {
  position: relative;
  max-width: min(72%, 720px);
}

.message-bubble-shell > .chat-bubble {
  max-width: 100%;
}

.message-actions-trigger {
  position: absolute;
  z-index: 5;
  top: 5px;
  right: 5px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, .9);
  color: #64748b;
  box-shadow: 0 1px 4px rgba(15, 23, 42, .14);
  opacity: 0;
  cursor: pointer;
  transition: opacity .15s ease, background .15s ease;
}

.message-bubble-shell:hover .message-actions-trigger,
.message-actions-trigger:focus-visible {
  opacity: 1;
}

.message-actions-menu {
  z-index: 100000;
  min-width: 154px;
  padding: 5px;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, .16);
}

.message-actions-menu button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}

.message-actions-menu button:hover { background: #f1f5f9; }
.message-actions-menu button.danger { color: #dc2626; }

.message-reply-preview {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 7px;
  padding: 6px 8px;
  border-left: 3px solid #2563eb;
  border-radius: 5px;
  background: rgba(255, 255, 255, .64);
  color: #64748b;
  font-size: 10.5px;
  line-height: 1.35;
}

.message-reply-preview strong { color: #1d4ed8; }
.message-reply-preview span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deleted-message { display: flex; align-items: center; gap: 6px; color: #64748b; font-style: italic; }
.edited-label { margin-left: 5px; color: #64748b; font-size: 9px; }
/* ─── Identificação do Autor da Mensagem ─────────────────────────────────── */
.message-author-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  margin-bottom: 4px;
}

.message-author-chip.outgoing {
  color: rgba(255, 255, 255, 0.95);
}

.message-author-chip.incoming {
  color: #059669;
}

.author-icon {
  font-size: 11.5px;
  opacity: 0.9;
  display: inline-flex;
  align-items: center;
}

.author-name {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.author-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.author-badge.bot {
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
}

.author-badge.whatsapp {
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.author-badge.incoming {
  background: #ecfdf5;
  color: #059669;
}

.group-message-sender { margin-bottom: 4px; color: #059669; font-size: 10.5px; font-weight: 700; }

@media (hover: none) {
  .message-actions-trigger { opacity: .72; }
}

.media-status-card {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  padding: 10px 12px;
  margin-bottom: 6px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #f8fbff;
  color: #475569;
  font-size: 11.5px;
}

.media-status-error {
  border-color: #fecaca;
  background: #fff7f7;
  color: #b91c1c;
}

.media-retry-button {
  margin-left: auto;
  padding: 4px 8px;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  background: #fff;
  color: #b91c1c;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.media-retry-button:hover {
  background: #fee2e2;
}

.reaction-card {
  min-width: 180px;
  max-width: 280px;
}

.reaction-quote {
  padding: 7px 9px;
  border-left: 3px solid #60a5fa;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.62);
  color: #475569;
  font-size: 11px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reaction-result {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-top: 7px;
  color: #334155;
  font-size: 11px;
  font-weight: 600;
}

.reaction-emoji {
  font-size: 22px;
  line-height: 1;
}

.chat-divider-row {
  display: flex;
  justify-content: center;
  margin: 8px 0;
  width: 100%;
}

.chat-divider-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: #f1f5f9;
  border: none;
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 14px;
  border-radius: 999px;
  max-width: 90%;
  line-height: 1.4;
  box-shadow: none;
}

.large-media-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 240px;
  max-width: 300px;
  padding: 10px 12px;
  margin-bottom: 6px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.large-media-box.outgoing {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.large-media-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.large-media-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: #e2e8f0;
  color: #2563eb;
  font-size: 18px;
  flex-shrink: 0;
}

.large-media-box.outgoing .large-media-icon {
  background: #dbeafe;
  color: #1d4ed8;
}

.large-media-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.large-media-title {
  font-weight: 700;
  font-size: 12.5px;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.large-media-size {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.large-media-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9.5px;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  padding: 1px 5px;
  border-radius: 4px;
  width: fit-content;
  margin-top: 2px;
}

.large-media-actions {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.btn-download-large-media {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 7px 12px;
  border: 0;
  border-radius: 6px;
  background: #2563eb;
  color: #ffffff;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-download-large-media:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-download-large-media:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-view-inline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 5px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-view-inline:hover {
  background: #f1f5f9;
}

/* Custom Audio Player */
.custom-audio-player {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 210px;
  max-width: 290px;
  padding: 3px 2px;
}

.custom-audio-player .audio-play-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 11px;
  transition: transform 0.12s ease, background-color 0.15s ease;
}

.custom-audio-player.incoming .audio-play-btn {
  background: #e6f7f2;
  color: #059669;
}

.custom-audio-player.incoming .audio-play-btn:hover {
  background: #d1fae5;
  transform: scale(1.05);
}

.custom-audio-player.outgoing .audio-play-btn {
  background: #ffffff;
  color: #059669;
}

.custom-audio-player.outgoing .audio-play-btn:hover {
  background: #f8fafc;
  transform: scale(1.05);
}

.audio-waveform-container {
  flex: 1;
  display: flex;
  align-items: center;
  height: 28px;
  cursor: pointer;
  padding: 0 4px;
}

.audio-waveform-bars {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  height: 22px;
}

.audio-bar {
  flex: 1;
  width: 2px;
  min-width: 2px;
  border-radius: 1px;
  transition: height 0.15s ease, background-color 0.15s ease;
}

.custom-audio-player.incoming .audio-bar {
  background: #cbd5e1;
}

.custom-audio-player.incoming .audio-bar.active {
  background: #059669;
}

.custom-audio-player.outgoing .audio-bar {
  background: rgba(255, 255, 255, 0.45);
}

.custom-audio-player.outgoing .audio-bar.active {
  background: #ffffff;
}

.audio-duration {
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
  min-width: 26px;
  text-align: right;
}

.custom-audio-player.incoming .audio-duration {
  color: #64748b;
}

.custom-audio-player.outgoing .audio-duration {
  color: rgba(255, 255, 255, 0.9);
}
</style>
