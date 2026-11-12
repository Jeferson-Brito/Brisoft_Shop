<template>
  <div class="internal-chat-layout">
    <!-- Coluna 1: Fila de Conversas Internas (Design idêntico à aba de Atendimentos) -->
    <aside class="internal-sidebar queue-column">
      <!-- 1. Header da Fila (Sem contador de chats abertos) -->
      <div class="queue-header-row">
        <div class="queue-header-left">
          <h2 class="queue-title-bold">Conversas Internas</h2>
        </div>
        <div class="queue-header-right">
          <button
            type="button"
            class="queue-filter-btn"
            title="Nova conversa ou grupo corporativo"
            @click="openNewChatModal('direct')"
          >
            <span class="queue-icon-box"><i class="ri-add-line"></i></span>
          </button>
        </div>
      </div>

      <!-- 2. Campo de Busca (Fila única, sem separação por abas) -->
      <div class="queue-search-row">
        <div class="queue-search-box">
          <span class="search-mag-icon"><i class="ri-search-line"></i></span>
          <input
            v-model="searchTerm"
            type="text"
            placeholder="Buscar conversa ou colega..."
          />
          <button
            v-if="searchTerm"
            type="button"
            class="clear-input-btn"
            @click="searchTerm = ''"
          >
            <i class="ri-close-line"></i>
          </button>
        </div>
      </div>



      <!-- 4. Lista da Fila (Scrollable, Design exato QueueItem) -->
      <div class="queue-list-container">
        <div v-if="filteredConversationsList.length === 0 && !searchTerm" class="queue-empty-message">
          <span class="empty-icon-box"><i class="ri-chat-smile-line"></i></span>
          <span>Nenhuma conversa nesta lista</span>
        </div>

        <div
          v-for="conv in filteredConversationsList"
          :key="conv.id"
          class="queue-item-card"
          :class="{
            active: chatStore.activeConversation?.id === conv.id,
            unread: (conv.unread_count || 0) > 0,
            pinned: isConversationPinned(conv.id)
          }"
          @click="selectConversationWithDetails(conv)"
          @contextmenu.prevent="openChatContextMenu($event, conv)"
          @touchstart="handleTouchStart($event, conv)"
          @touchend="handleTouchEnd"
          @touchmove="handleTouchMove"
        >
          <!-- Avatar com Indicador Online -->
          <div class="queue-avatar-wrap">
            <div
              v-if="conv.type !== 'direct'"
              class="queue-avatar-circle channel-avatar-circle"
            >
              <img v-if="conv.avatar_url" :src="conv.avatar_url" :alt="conv.name" />
              <i v-else :class="getChannelIcon(conv.type)"></i>
            </div>
            <div
              v-else
              class="queue-avatar-circle"
              :style="getAvatarStyle(conv.other_user)"
            >
              <img v-if="conv.other_user?.avatar_url" :src="conv.other_user.avatar_url" :alt="conv.name" />
              <span v-else>{{ getInitials(conv.name) }}</span>
            </div>
            <span
              v-if="conv.type === 'direct'"
              class="avatar-online-dot"
              :class="{ offline: !isUserOnline(conv.other_user?.id) }"
            ></span>
          </div>

          <!-- Conteúdo do Card -->
          <div class="queue-item-body">
            <!-- Linha 1: Nome + Horário + Pin -->
            <div class="queue-row-header">
              <div class="queue-name-box">
                <strong class="queue-contact-name" :title="conv.name">{{ conv.name }}</strong>
                <span v-if="conv.type === 'group'" class="queue-type-icon group" title="Grupo Interno">
                  <span class="queue-icon-box-sm"><i class="ri-team-line"></i></span>
                </span>
                <span v-else-if="conv.type === 'general'" class="queue-type-icon general" title="Canal Geral">
                  <span class="queue-icon-box-sm"><i class="ri-megaphone-line"></i></span>
                </span>
              </div>
              <div class="queue-meta-right">
                <span v-if="isConversationPinned(conv.id)" class="queue-pin-badge" title="Conversa fixada no topo">
                  <i class="ri-pushpin-2-fill"></i>
                </span>
                <span v-if="isConversationMuted(conv.id)" class="queue-mute-badge" title="Notificações silenciadas">
                  <i class="ri-notification-off-line"></i>
                </span>
                <span v-if="conv.last_message_at" class="queue-item-time">{{ formatTime(conv.last_message_at) }}</span>
              </div>
            </div>

            <!-- Linha 2: Snippet da Mensagem + Badge de Não Lidos -->
            <div class="queue-row-preview">
              <span class="queue-preview-text" :class="{ 'is-unread': (conv.unread_count || 0) > 0 }">
                {{ conv.last_message_text || (conv.type === 'direct' ? 'Conversa direta' : 'Canal corporativo') }}
              </span>
              <!-- Badge de Mensagens Não Lidas (Círculo Verde) -->
              <span v-if="(conv.unread_count || 0) > 0" class="queue-unread-circle" title="Mensagens não lidas">
                {{ conv.unread_count }}
              </span>
            </div>
          </div>
        </div>

        <!-- Se estiver buscando e houver colegas com quem ainda não há conversa -->
        <div v-if="searchTerm && otherColleaguesSearchMatches.length > 0" class="search-candidates-group">
          <div class="search-candidates-header">
            <span>INICIAR CONVERSA DIRETA</span>
          </div>
          <div
            v-for="member in otherColleaguesSearchMatches"
            :key="member.id"
            class="queue-item-card new-candidate-card"
            @click="openDirectChatWithDetails(member.id)"
          >
            <div class="queue-avatar-wrap">
              <div class="queue-avatar-circle" :style="getAvatarStyle(member)">
                <img v-if="member.avatar_url" :src="member.avatar_url" :alt="member.name" />
                <span v-else>{{ getInitials(member.name) }}</span>
              </div>
              <span class="avatar-online-dot" :class="{ offline: !isUserOnline(member.id) }"></span>
            </div>
            <div class="queue-item-body">
              <div class="queue-row-header">
                <div class="queue-name-box">
                  <strong class="queue-contact-name">{{ member.name }}</strong>
                </div>
                <span class="btn-start-chat-tag"><i class="ri-chat-new-line"></i> Iniciar</span>
              </div>
              <div class="queue-row-preview">
                <span class="queue-preview-text">{{ member.cargo || member.role || 'Colaborador' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Coluna 2: Janela de Conversa Ativa e Painel de Informações -->
    <main class="internal-chat-main">
      <div v-if="chatStore.activeConversation" class="chat-main-container" :class="{ 'with-drawer': showDetailsDrawer }">
        <!-- Painel Central de Mensagens -->
        <div class="chat-conversation-pane">
          <!-- Topo da Conversa -->
          <header class="chat-header">
            <div
              class="chat-header-info clickable-header-info"
              title="Clique para ver os detalhes da conversa"
              @click="openActiveChatDetails"
            >
              <div
                v-if="chatStore.activeConversation.type === 'direct'"
                class="member-avatar-wrapper header-avatar"
              >
                <div class="member-avatar" :style="getAvatarStyle(activeDirectUser)">
                  <img v-if="activeDirectUser?.avatar_url" :src="activeDirectUser.avatar_url" :alt="chatStore.activeConversation.name" />
                  <span v-else>{{ getInitials(chatStore.activeConversation.name) }}</span>
                </div>
                <span
                  class="member-status-dot"
                  :class="{ online: isUserOnline(activeDirectUser?.id) }"
                ></span>
              </div>

              <div v-else-if="chatStore.activeConversation.avatar_url" class="channel-avatar-wrapper header-avatar">
                <img :src="chatStore.activeConversation.avatar_url" class="channel-custom-avatar" :alt="chatStore.activeConversation.name" />
              </div>

              <div v-else class="channel-icon-box header-channel-icon">
                <i :class="getChannelIcon(chatStore.activeConversation.type)"></i>
              </div>

              <div class="chat-header-text">
                <h3 class="chat-title">{{ chatStore.activeConversation.name }}</h3>
                <p class="chat-subtitle" v-if="chatStore.activeConversation.type === 'direct'">
                  <span class="status-indicator-text" :class="{ online: isUserOnline(activeDirectUser?.id) }">
                    {{ getUserStatusText(activeDirectUser) }}
                  </span>
                  <span class="sep-dot">•</span>
                  <span>{{ activeDirectUser?.cargo || activeDirectUser?.role || 'Colaborador' }}</span>
                </p>
                <p class="chat-subtitle" v-else-if="chatStore.activeConversation.type === 'group'">
                  <span>{{ conversationParticipants.length }} participantes</span>
                </p>
              </div>
            </div>

            <div class="chat-header-actions">
              <!-- Botão: Ligação de voz (Em desenvolvimento) -->
              <button
                type="button"
                class="header-action-btn disabled-feature"
                title="Ligação de voz (Em breve)"
                @click="notifyVoiceCall"
              >
                <i class="ri-phone-line"></i>
              </button>

              <!-- Botão: Chamada de vídeo (Em desenvolvimento) -->
              <button
                type="button"
                class="header-action-btn disabled-feature"
                title="Chamada de vídeo (Em breve)"
                @click="notifyVideoCall"
              >
                <i class="ri-vidicon-line"></i>
              </button>

              <!-- Botão: Configurações e Gerenciamento do Grupo (Apenas para Responsáveis) -->
              <button
                v-if="chatStore.activeConversation.type !== 'direct' && canCurrentUserManageChannel"
                type="button"
                class="header-action-btn"
                title="Configurações e Membros do Canal"
                @click="openEditGroupModal"
              >
                <i class="ri-settings-3-line"></i>
              </button>

              <!-- Botão: Pesquisar nesta conversa -->
              <button
                type="button"
                class="header-action-btn"
                :class="{ active: showMessageSearch }"
                title="Pesquisar mensagens nesta conversa"
                @click="toggleMessageSearch"
              >
                <i class="ri-search-line"></i>
              </button>
            </div>
          </header>

          <!-- Barra Retrátil de Busca Textual na Conversa Ativa (Fase 3) -->
          <div v-if="showMessageSearch" class="conversation-search-bar">
            <div class="search-bar-input-box">
              <i class="ri-search-line"></i>
              <input
                ref="messageSearchInputRef"
                v-model="messageSearchQuery"
                type="text"
                placeholder="Pesquisar mensagens na conversa atual..."
                class="conv-search-input"
                @keydown.enter.prevent="nextSearchMatch"
                @keydown.esc="closeMessageSearch"
              />
              <button v-if="messageSearchQuery" type="button" class="btn-clear-query" @click="messageSearchQuery = ''">
                <i class="ri-close-line"></i>
              </button>
            </div>

            <div class="search-bar-nav">
              <span class="search-count-label">
                {{ messageSearchQuery ? (searchMatches.length > 0 ? `${currentSearchIndex + 1} de ${searchMatches.length}` : 'Nenhum resultado') : '' }}
              </span>
              <button
                type="button"
                class="search-nav-btn"
                :disabled="searchMatches.length === 0"
                title="Resultado anterior"
                @click="prevSearchMatch"
              >
                <i class="ri-arrow-up-s-line"></i>
              </button>
              <button
                type="button"
                class="search-nav-btn"
                :disabled="searchMatches.length === 0"
                title="Próximo resultado"
                @click="nextSearchMatch"
              >
                <i class="ri-arrow-down-s-line"></i>
              </button>
              <button
                type="button"
                class="search-close-btn"
                title="Fechar pesquisa (Esc)"
                @click="closeMessageSearch"
              >
                <i class="ri-close-line"></i>
              </button>
            </div>
          </div>

          <!-- Banner de Mensagens Fixadas (Fase 4) -->
          <div v-if="latestPinnedMessage" class="pinned-message-banner">
            <div class="pinned-banner-content" @click="scrollToMessage(latestPinnedMessage.id)">
              <i class="ri-pushpin-2-fill pin-icon"></i>
              <div class="pinned-text-box">
                <span class="pinned-label">Mensagem Fixada</span>
                <span class="pinned-snippet">{{ getMessageSnippet(latestPinnedMessage) }}</span>
              </div>
            </div>
            <button
              type="button"
              class="btn-unpin-banner"
              title="Desafixar mensagem"
              @click="chatStore.togglePinMessage(latestPinnedMessage.id)"
            >
              <i class="ri-close-line"></i>
            </button>
          </div>

          <!-- Área de Rolagem das Mensagens -->
          <div class="chat-messages-area" ref="messagesContainerRef">
            <div v-if="chatStore.isLoading" class="messages-loading">
              <i class="ri-loader-4-line spin-icon"></i>
              <span>Carregando histórico...</span>
            </div>

            <div v-else-if="chatStore.messages.length === 0" class="empty-chat-state">
              <div class="empty-icon-circle">
                <i class="ri-chat-smile-2-line"></i>
              </div>
              <h4>Início da conversa</h4>
              <p>Nenhuma mensagem enviada ainda. Envie uma saudação para começar a interagir!</p>
            </div>

            <div v-else class="messages-flow">
              <template
                v-for="(msg, index) in chatStore.messages"
                :key="msg.id || index"
              >
                <!-- Divisor de Data -->
                <div v-if="shouldShowDateDivider(chatStore.messages, index)" class="chat-date-divider">
                  <span class="date-badge">{{ formatDateDivider(msg.created_at) }}</span>
                </div>

                <!-- Mensagem de Sistema / Aviso no Canal -->
                <div
                  v-if="isSystemMessage(msg)"
                  :id="`msg-${msg.id}`"
                  class="system-message-row"
                >
                  <div class="system-message-pill">
                    <i class="ri-information-line"></i>
                    <span>{{ getSystemMessageText(msg) }}</span>
                  </div>
                </div>

                <!-- Mensagem Comum de Usuário -->
                <div
                  v-else
                  :id="`msg-${msg.id}`"
                  class="message-row"
                  :class="{
                    'message-mine': msg.sender_id === auth.user?.id,
                    'message-other': msg.sender_id !== auth.user?.id,
                    'search-target-matched': isMessageSearchMatched(msg.id),
                    'message-is-pinned': msg.is_pinned
                  }"
                >
                  <!-- Avatar do colega nas mensagens recebidas -->
                  <div
                    v-if="msg.sender_id !== auth.user?.id"
                    class="message-sender-avatar"
                    :style="getAvatarStyle(msg.sender)"
                    :title="msg.sender?.name"
                  >
                    <img v-if="msg.sender?.avatar_url" :src="msg.sender.avatar_url" :alt="msg.sender.name" />
                    <span v-else>{{ getInitials(msg.sender?.name) }}</span>
                  </div>

                  <div class="message-bubble-wrapper">
                    <!-- Barra de Ações Rápidas (Fase 4) -->
                    <div v-if="!msg.is_deleted" class="msg-actions-bar">
                      <!-- Reação Rápida com Popover -->
                      <div class="msg-action-item">
                        <button
                          type="button"
                          class="msg-action-trigger"
                          title="Reagir com emoji"
                          @click.stop="toggleReactionPopover(msg.id)"
                        >
                          <i class="ri-emotion-line"></i>
                        </button>
                        <div v-if="activeReactionPopoverId === msg.id" class="reactions-quick-popover" @click.stop>
                          <button
                            v-for="em in ['👍', '❤️', '😂', '🎉', '🚀', '👀']"
                            :key="em"
                            type="button"
                            class="quick-emoji-btn"
                            @click="addReaction(msg.id, em)"
                          >
                            {{ em }}
                          </button>
                        </div>
                      </div>

                      <!-- Responder -->
                      <button
                        type="button"
                        class="msg-action-trigger"
                        title="Responder mensagem"
                        @click="setReplyTo(msg)"
                      >
                        <i class="ri-reply-line"></i>
                      </button>

                      <!-- Mais Opções (...) -->
                      <div class="msg-action-item">
                        <button
                          type="button"
                          class="msg-action-trigger"
                          title="Mais opções"
                          @click.stop="toggleMoreMenu(msg.id)"
                        >
                          <i class="ri-more-2-fill"></i>
                        </button>
                        <div v-if="activeMoreMenuId === msg.id" class="msg-dropdown-menu" @click.stop>
                          <button type="button" class="dropdown-item" @click="chatStore.togglePinMessage(msg.id); activeMoreMenuId = null">
                            <i :class="msg.is_pinned ? 'ri-pushpin-line' : 'ri-pushpin-2-fill'"></i>
                            {{ msg.is_pinned ? 'Desafixar mensagem' : 'Fixar mensagem' }}
                          </button>
                          <button v-if="msg.text" type="button" class="dropdown-item" @click="copyMessageText(msg.text); activeMoreMenuId = null">
                            <i class="ri-file-copy-line"></i> Copiar texto
                          </button>
                          <button v-if="msg.sender_id === auth.user?.id && !msg.is_deleted && msg.text" type="button" class="dropdown-item" @click="startEditMessage(msg); activeMoreMenuId = null">
                            <i class="ri-edit-line"></i> Editar mensagem
                          </button>
                          <button v-if="(msg.sender_id === auth.user?.id || auth.user?.role === 'admin') && !msg.is_deleted" type="button" class="dropdown-item text-danger" @click="confirmDeleteMessage(msg.id); activeMoreMenuId = null">
                            <i class="ri-delete-bin-line"></i> Excluir mensagem
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="message-bubble-box" :class="{ 'is-deleted-bubble': msg.is_deleted }">
                      <!-- Tag de Mensagem Fixada -->
                      <div v-if="msg.is_pinned" class="msg-pinned-tag">
                        <i class="ri-pushpin-2-fill"></i> Fixada
                      </div>

                      <!-- Nome do remetente (apenas em canais ou se for de outro usuário) -->
                      <span
                        v-if="msg.sender_id !== auth.user?.id && chatStore.activeConversation.type !== 'direct'"
                        class="bubble-sender-name"
                      >
                        {{ msg.sender?.name || 'Colega' }}
                      </span>

                      <!-- Citação da Mensagem Respondida (se houver) -->
                      <div
                        v-if="msg.reply_to_id && findMessageById(msg.reply_to_id)"
                        class="quoted-reply-box"
                        @click="scrollToMessage(msg.reply_to_id)"
                      >
                        <div class="quoted-bar"></div>
                        <div class="quoted-content">
                          <span class="quoted-sender">{{ findMessageById(msg.reply_to_id)?.sender?.name || 'Colega' }}</span>
                          <span class="quoted-snippet">{{ getMessageSnippet(findMessageById(msg.reply_to_id)) }}</span>
                        </div>
                      </div>

                      <!-- Mensagem Apagada -->
                      <div v-if="msg.is_deleted" class="deleted-msg-content">
                        <i class="ri-forbid-line"></i> Esta mensagem foi apagada
                      </div>

                      <template v-else>
                        <!-- Mídia: Imagem -->
                        <div
                          v-if="msg.media_type === 'image' || isImageUrl(msg.media_url)"
                          class="message-media-image"
                          @click="openImagePreview(msg.media_url)"
                        >
                          <img :src="msg.media_url" :alt="msg.file_name || 'Imagem'" loading="lazy" />
                        </div>

                        <!-- Mídia: Áudio -->
                        <div
                          v-else-if="msg.media_type === 'audio'"
                          class="message-media-audio"
                        >
                          <audio :src="msg.media_url" controls controlsList="nodownload"></audio>
                        </div>

                        <!-- Mídia: Documento / Arquivo -->
                        <div
                          v-else-if="msg.media_type === 'document' || msg.media_url"
                          class="message-media-doc"
                        >
                          <a :href="msg.media_url" target="_blank" download class="doc-attachment-card">
                            <div class="doc-icon-box">
                              <i class="ri-file-text-line"></i>
                            </div>
                            <div class="doc-info-box">
                              <span class="doc-title">{{ msg.file_name || 'Documento anexo' }}</span>
                              <span class="doc-action">Clique para baixar</span>
                            </div>
                            <i class="ri-download-2-line doc-download-icon"></i>
                          </a>
                        </div>

                        <!-- Texto da Mensagem -->
                        <div
                          v-if="msg.text"
                          class="message-text-content"
                          v-html="formatMessageBody(msg.text)"
                        ></div>
                      </template>

                      <div class="message-meta-row">
                        <span v-if="msg.is_edited && !msg.is_deleted" class="msg-edited-badge" title="Mensagem editada">
                          (editada)
                        </span>
                        <span class="message-timestamp">{{ formatMessageTime(msg.created_at) }}</span>
                        <i
                          v-if="msg.sender_id === auth.user?.id"
                          class="ri-check-double-line message-check-read"
                        ></i>
                      </div>
                    </div>

                    <!-- Pílulas de Reações Agregadas (Fase 4) -->
                    <div v-if="msg.reactions && msg.reactions.length > 0" class="message-reactions-row">
                      <button
                        v-for="grp in groupReactions(msg.reactions)"
                        :key="grp.emoji"
                        type="button"
                        class="reaction-pill"
                        :class="{ 'user-reacted': grp.userReacted }"
                        :title="grp.tooltip"
                        @click="chatStore.toggleReaction(msg.id, grp.emoji)"
                      >
                        <span class="reaction-emoji">{{ grp.emoji }}</span>
                        <span class="reaction-count">{{ grp.count }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <!-- Indicador de Digitação -->
            <div v-if="isTypingNow" class="typing-indicator-row">
              <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span class="typing-label">{{ typingLabel }}</span>
            </div>
          </div>

          <!-- Barra Inferior de Envio de Mensagem -->
          <footer class="chat-input-footer">
            <!-- Barra de Edição Ativa (Fase 4) -->
            <div v-if="editingMessage" class="active-editing-banner">
              <div class="editing-banner-bar"></div>
              <div class="editing-banner-info">
                <span class="editing-banner-title">
                  <i class="ri-edit-line"></i> Editando sua mensagem
                </span>
                <span class="editing-banner-snippet">{{ editingMessage.text }}</span>
              </div>
              <button type="button" class="btn-cancel-edit" title="Cancelar edição (Esc)" @click="cancelEditMessage">
                <i class="ri-close-line"></i>
              </button>
            </div>

            <!-- Barra de Resposta Ativa -->
            <div v-else-if="replyingTo" class="active-reply-banner">
              <div class="reply-banner-bar"></div>
              <div class="reply-banner-info">
                <span class="reply-banner-title">
                  Respondendo a <strong>{{ replyingTo.sender?.name || 'Colega' }}</strong>
                </span>
                <span class="reply-banner-snippet">{{ getMessageSnippet(replyingTo) }}</span>
              </div>
              <button type="button" class="btn-cancel-reply" title="Cancelar resposta" @click="cancelReply">
                <i class="ri-close-line"></i>
              </button>
            </div>

            <!-- Barra de Gravação de Áudio Ativa -->
            <div v-if="isRecordingAudio" class="audio-recording-bar">
              <div class="recording-indicator">
                <span class="rec-pulse-dot"></span>
                <span class="rec-timer">Gravando {{ formatRecordingTime(recordingSeconds) }}</span>
              </div>
              <div class="recording-actions">
                <button type="button" class="btn-cancel-rec" title="Cancelar gravação" @click="cancelAudioRecording">
                  <i class="ri-delete-bin-line"></i> Cancelar
                </button>
                <button type="button" class="btn-send-rec" title="Enviar áudio" @click="stopAndSendAudioRecording">
                  <i class="ri-send-plane-fill"></i> Enviar Áudio
                </button>
              </div>
            </div>

            <!-- Formulário Normal de Envio -->
            <form v-else class="chat-input-form" @submit.prevent="handleSend">
              <!-- Dropdown de Autocomplete de Menções (@mentions) (Fase 4) -->
              <div v-if="showMentionSuggestions && mentionCandidates.length > 0" class="mention-suggestions-popover">
                <div class="mention-suggestions-header">Mencionar colega</div>
                <button
                  v-for="member in mentionCandidates"
                  :key="member.id"
                  type="button"
                  class="mention-item-btn"
                  @click="selectMentionMember(member)"
                >
                  <div class="member-avatar drawer-small-avatar" :style="getAvatarStyle(member)">
                    <img v-if="member.avatar_url" :src="member.avatar_url" :alt="member.name" />
                    <span v-else>{{ getInitials(member.name) }}</span>
                  </div>
                  <div class="mention-item-info">
                    <span class="mention-name">{{ member.name }}</span>
                    <span class="mention-role">{{ member.cargo || member.role || 'Colaborador' }}</span>
                  </div>
                </button>
              </div>

              <input
                ref="fileInputRef"
                type="file"
                style="display: none"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                @change="onFileSelected"
              />

              <button
                type="button"
                class="tool-btn"
                title="Anexar imagem ou documento"
                @click="triggerFileInput"
              >
                <i class="ri-attachment-line"></i>
              </button>

              <button
                type="button"
                class="tool-btn"
                title="Inserir emoji"
                @click="insertEmoji('👋')"
              >
                <i class="ri-emotion-happy-line"></i>
              </button>

              <textarea
                ref="inputTextareaRef"
                v-model="inputMessage"
                rows="1"
                placeholder="Digite sua mensagem interna... (@ para mencionar, Enter para enviar)"
                class="chat-textarea"
                @keydown="onKeyDown"
                @input="onInputTyping"
              ></textarea>

              <button
                v-if="!inputMessage.trim()"
                type="button"
                class="tool-btn mic-btn"
                title="Gravar mensagem de voz"
                @click="startAudioRecording"
              >
                <i class="ri-mic-line"></i>
              </button>

              <button
                v-else
                type="submit"
                class="send-message-btn"
                :disabled="chatStore.isSending"
                :title="editingMessage ? 'Salvar alteração' : 'Enviar mensagem'"
              >
                <i v-if="chatStore.isSending" class="ri-loader-4-line spin-icon"></i>
                <i v-else-if="editingMessage" class="ri-check-line"></i>
                <i v-else class="ri-send-plane-2-fill"></i>
              </button>
            </form>
          </footer>
        </div>

        <!-- Painel Lateral Direito: Drawer de Informações da Conversa (Fase 3) -->
        <aside v-if="showDetailsDrawer" class="conversation-details-drawer">
          <div class="drawer-header">
            <h4 class="drawer-title">Detalhes da Conversa</h4>
            <button type="button" class="drawer-close-btn" title="Fechar painel" @click="showDetailsDrawer = false">
              <i class="ri-close-line"></i>
            </button>
          </div>

          <div class="drawer-content">
            <!-- Card de Perfil da Conversa -->
            <div class="drawer-profile-card">
              <div v-if="chatStore.activeConversation.type === 'direct'" class="drawer-big-avatar" :style="getAvatarStyle(activeDirectUser)">
                <img v-if="activeDirectUser?.avatar_url" :src="activeDirectUser.avatar_url" :alt="chatStore.activeConversation.name" />
                <span v-else>{{ getInitials(chatStore.activeConversation.name) }}</span>
              </div>
              <div v-else-if="chatStore.activeConversation.avatar_url" class="drawer-big-avatar">
                <img :src="chatStore.activeConversation.avatar_url" class="channel-custom-avatar" :alt="chatStore.activeConversation.name" />
              </div>
              <div v-else class="drawer-big-icon">
                <i :class="getChannelIcon(chatStore.activeConversation.type)"></i>
              </div>

              <h3 class="drawer-conv-name">{{ chatStore.activeConversation.name }}</h3>
              <span v-if="chatStore.activeConversation.type === 'direct'" class="drawer-user-status" :class="{ online: isUserOnline(activeDirectUser?.id) }">
                {{ getUserStatusText(activeDirectUser) }}
              </span>
              <span class="drawer-conv-type-badge">
                {{ getConversationTypeLabel(chatStore.activeConversation) }}
              </span>

              <!-- Detalhes do Usuário (Conversa Direta) -->
              <div v-if="chatStore.activeConversation.type === 'direct'" class="drawer-contact-details-box">
                <div class="drawer-detail-item">
                  <i class="ri-briefcase-line"></i>
                  <div class="detail-texts">
                    <label>Cargo / Função</label>
                    <span>{{ activeDirectUser?.cargo || activeDirectUser?.role || 'Colaborador' }}</span>
                  </div>
                </div>
                <div v-if="activeDirectUser?.email" class="drawer-detail-item">
                  <i class="ri-mail-line"></i>
                  <div class="detail-texts">
                    <label>E-mail Corporativo</label>
                    <span>{{ activeDirectUser.email }}</span>
                  </div>
                </div>
                <div class="drawer-detail-item">
                  <i class="ri-time-line"></i>
                  <div class="detail-texts">
                    <label>Status</label>
                    <span :class="{ 'text-online': isUserOnline(activeDirectUser?.id) }">
                      {{ getUserStatusText(activeDirectUser) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Badges de Papel e Botões do Canal -->
              <div v-else class="drawer-channel-actions-box">
                <div v-if="isCurrentUserChannelOwner" class="drawer-role-callout owner">
                  <i class="ri-vip-crown-fill"></i> Você é o Responsável pelo Canal
                </div>
                <div v-else-if="isCurrentUserChannelSubOwner" class="drawer-role-callout sub">
                  <i class="ri-star-fill"></i> Você é Sub-responsável pelo Canal
                </div>

                <div class="drawer-channel-buttons-row">
                  <button
                    v-if="canCurrentUserManageChannel"
                    type="button"
                    class="btn-edit-group-drawer"
                    @click="openEditGroupModal"
                  >
                    <i class="ri-settings-4-line"></i> Gerenciar Canal
                  </button>

                  <button
                    v-if="chatStore.activeConversation.type !== 'general'"
                    type="button"
                    class="btn-leave-channel-drawer"
                    @click="confirmLeaveActiveChannel"
                  >
                    <i class="ri-logout-box-r-line"></i> Sair do Canal
                  </button>
                </div>
              </div>
            </div>

            <!-- Abas do Drawer: Membros / Arquivos / Fixadas -->
            <div class="drawer-tabs">
              <button
                type="button"
                class="drawer-tab"
                :class="{ active: detailsTab === 'members' }"
                @click="detailsTab = 'members'"
              >
                <i class="ri-group-line"></i> Membros
                <span v-if="conversationParticipants.length" class="drawer-badge-count">
                  {{ conversationParticipants.length }}
                </span>
              </button>
              <button
                type="button"
                class="drawer-tab"
                :class="{ active: detailsTab === 'media' }"
                @click="detailsTab = 'media'"
              >
                <i class="ri-attachment-line"></i> Mídias
                <span v-if="sharedMediaFiles.length" class="drawer-badge-count">
                  {{ sharedMediaFiles.length }}
                </span>
              </button>
              <button
                type="button"
                class="drawer-tab"
                :class="{ active: detailsTab === 'pinned' }"
                @click="detailsTab = 'pinned'"
              >
                <i class="ri-pushpin-2-line"></i> Fixadas
                <span v-if="chatStore.pinnedMessages.length" class="drawer-badge-count">
                  {{ chatStore.pinnedMessages.length }}
                </span>
              </button>
            </div>

            <!-- Aba Membros -->
            <div v-if="detailsTab === 'members'" class="drawer-tab-pane">
              <div v-if="chatStore.isLoadingDetails" class="drawer-loading">
                <i class="ri-loader-4-line spin-icon"></i> Carregando membros...
              </div>
              <div v-else class="drawer-members-list">
                <div v-if="chatStore.activeConversation.type !== 'direct' && canCurrentUserManageChannel" class="drawer-members-header-action">
                  <button type="button" class="btn-manage-members-pill" @click="openEditGroupModal">
                    <i class="ri-user-add-line"></i> Adicionar / Gerenciar Membros
                  </button>
                </div>
                <div
                  v-for="member in conversationParticipants"
                  :key="member.id"
                  class="drawer-member-card"
                >
                  <div class="member-avatar-wrapper">
                    <div class="member-avatar drawer-small-avatar" :style="getAvatarStyle(member)">
                      <img v-if="member.avatar_url" :src="member.avatar_url" :alt="member.name" />
                      <span v-else>{{ getInitials(member.name) }}</span>
                    </div>
                    <span class="member-status-dot" :class="{ online: isUserOnline(member.id) }"></span>
                  </div>
                  <div class="drawer-member-info">
                    <div class="member-name-row">
                      <span class="drawer-member-name">{{ member.name }}</span>
                      <span v-if="isMemberChannelOwner(member.id)" class="role-pill owner" title="Responsável pelo canal">
                        <i class="ri-vip-crown-fill"></i> Responsável
                      </span>
                      <span v-else-if="isMemberChannelSubOwner(member.id)" class="role-pill sub" title="Sub-responsável pelo canal">
                        <i class="ri-star-fill"></i> Sub-responsável
                      </span>
                    </div>
                    <span class="drawer-member-sub">
                      {{ isUserOnline(member.id) ? 'Online agora' : 'Offline' }} • {{ member.cargo || member.role || 'Colaborador' }}
                    </span>
                  </div>
                  <div class="drawer-member-actions">
                    <!-- Promover / Rebaixar Sub-responsável (Apenas para o Responsável principal) -->
                    <button
                      v-if="isCurrentUserChannelOwner && member.id !== chatStore.activeConversation?.created_by"
                      type="button"
                      class="btn-member-action-sub"
                      :class="{ active: isMemberChannelSubOwner(member.id) }"
                      :title="isMemberChannelSubOwner(member.id) ? 'Rebaixar a membro comum' : 'Promover a sub-responsável'"
                      @click="handleToggleSubOwner(member)"
                    >
                      <i :class="isMemberChannelSubOwner(member.id) ? 'ri-star-fill' : 'ri-star-line'"></i>
                    </button>

                    <!-- Remover do Canal -->
                    <button
                      v-if="(isCurrentUserChannelOwner || (isCurrentUserChannelSubOwner && !isMemberChannelSubOwner(member.id))) && member.id !== chatStore.activeConversation?.created_by && member.id !== auth.user?.id"
                      type="button"
                      class="btn-member-action-remove"
                      title="Remover do canal"
                      @click="handleRemoveMemberFromChannel(member)"
                    >
                      <i class="ri-user-unfollow-line"></i>
                    </button>

                    <!-- Conversar em particular -->
                    <button
                      v-if="member.id !== auth.user?.id"
                      type="button"
                      class="btn-quick-direct"
                      title="Conversar em particular"
                      @click="openDirectChatWithDetails(member.id)"
                    >
                      <i class="ri-message-3-line"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Aba Mídias & Arquivos -->
            <div v-else-if="detailsTab === 'media'" class="drawer-tab-pane">
              <div v-if="chatStore.isLoadingDetails" class="drawer-loading">
                <i class="ri-loader-4-line spin-icon"></i> Carregando mídias...
              </div>
              <div v-else-if="sharedMediaFiles.length === 0" class="drawer-empty-media">
                <i class="ri-image-line"></i>
                <p>Nenhuma foto ou documento compartilhado nesta conversa ainda.</p>
              </div>
              <div v-else class="drawer-media-content">
                <!-- Seção Fotos -->
                <div v-if="sharedImages.length > 0" class="drawer-media-section">
                  <span class="drawer-section-heading">Fotos e Imagens ({{ sharedImages.length }})</span>
                  <div class="drawer-images-grid">
                    <div
                      v-for="img in sharedImages"
                      :key="img.id"
                      class="drawer-image-thumb"
                      @click="openImagePreview(img.media_url)"
                    >
                      <img :src="img.media_url" :alt="img.file_name || 'Imagem'" loading="lazy" />
                    </div>
                  </div>
                </div>

                <!-- Seção Documentos -->
                <div v-if="sharedDocs.length > 0" class="drawer-media-section">
                  <span class="drawer-section-heading">Documentos ({{ sharedDocs.length }})</span>
                  <div class="drawer-docs-list">
                    <a
                      v-for="doc in sharedDocs"
                      :key="doc.id"
                      :href="doc.media_url"
                      target="_blank"
                      download
                      class="drawer-doc-item"
                    >
                      <div class="drawer-doc-icon">
                        <i class="ri-file-text-line"></i>
                      </div>
                      <div class="drawer-doc-details">
                        <span class="drawer-doc-name">{{ doc.file_name || 'Documento anexo' }}</span>
                        <span class="drawer-doc-date">{{ formatMessageTime(doc.created_at) }}</span>
                      </div>
                      <i class="ri-download-2-line"></i>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <!-- Aba Mensagens Fixadas (Fase 4) -->
            <div v-else-if="detailsTab === 'pinned'" class="drawer-tab-pane">
              <div v-if="chatStore.pinnedMessages.length === 0" class="drawer-empty-media">
                <i class="ri-pushpin-line"></i>
                <p>Nenhuma mensagem fixada nesta conversa ainda.</p>
              </div>
              <div v-else class="drawer-pinned-list">
                <div
                  v-for="pmsg in chatStore.pinnedMessages"
                  :key="pmsg.id"
                  class="drawer-pinned-card"
                  @click="scrollToMessage(pmsg.id)"
                >
                  <div class="drawer-pinned-card-header">
                    <span class="pmsg-author">{{ pmsg.sender?.name || 'Colega' }}</span>
                    <span class="pmsg-date">{{ formatMessageTime(pmsg.created_at) }}</span>
                  </div>
                  <p class="drawer-pinned-card-text">{{ getMessageSnippet(pmsg) }}</p>
                  <button
                    type="button"
                    class="btn-unpin-card"
                    title="Desafixar mensagem"
                    @click.stop="chatStore.togglePinMessage(pmsg.id)"
                  >
                    <i class="ri-close-line"></i> Desafixar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <!-- Estado Vazio (Nenhuma conversa selecionada) -->
      <div v-else class="no-active-chat-state">
        <div class="no-chat-illustration">
          <div class="illustration-bubble"><i class="ri-discuss-line"></i></div>
        </div>
        <h3 class="no-chat-title">Chat Interno da Empresa</h3>
        <p class="no-chat-desc">
          Converse com seus colegas de equipe e compartilhe comunicados em tempo real, sem depender do WhatsApp.
        </p>
        <button
          type="button"
          class="btn-start-general"
          @click="selectGeneralChannel"
        >
          <i class="ri-megaphone-line"></i> Abrir Canal Geral
        </button>
      </div>
    </main>

    <!-- Modal de Nova Conversa ou Grupo -->
    <Teleport to="body">
      <div v-if="showNewChatModal" class="modal-overlay" @click.self="closeNewChatModal">
        <div class="channel-modal-card">
          <div class="channel-modal-header">
            <div>
              <h3 class="channel-modal-title">Nova Conversa</h3>
              <p class="channel-modal-subtitle">Inicie um bate-papo direto ou crie um grupo corporativo</p>
            </div>
            <button type="button" class="btn-modal-close" @click="closeNewChatModal">
              <i class="ri-close-line"></i>
            </button>
          </div>

          <!-- Abas do Modal: Conversa Direta vs Grupo -->
          <div class="modal-tabs-header">
            <button
              type="button"
              class="modal-tab-btn"
              :class="{ active: newChatTab === 'direct' }"
              @click="newChatTab = 'direct'"
            >
              <i class="ri-user-line"></i> Conversar com Colega
            </button>
            <button
              type="button"
              class="modal-tab-btn"
              :class="{ active: newChatTab === 'group' }"
              @click="newChatTab = 'group'"
            >
              <i class="ri-team-line"></i> Criar Grupo / Canal
            </button>
          </div>

          <!-- CONTEÚDO ABA 1: Conversa Direta com Colega -->
          <div v-if="newChatTab === 'direct'" class="channel-modal-body">
            <div class="modal-search-wrapper">
              <i class="ri-search-line"></i>
              <input
                v-model="newChatMemberSearch"
                type="text"
                placeholder="Buscar colega pelo nome, cargo ou e-mail..."
                class="modal-search-input"
              />
            </div>

            <div class="modal-members-picker-list">
              <button
                v-for="member in availableDirectMembers"
                :key="member.id"
                type="button"
                class="modal-direct-member-row"
                @click="startDirectChatFromModal(member.id)"
              >
                <div class="member-avatar-wrapper">
                  <div class="member-avatar" :style="getAvatarStyle(member)">
                    <img v-if="member.avatar_url" :src="member.avatar_url" :alt="member.name" />
                    <span v-else>{{ getInitials(member.name) }}</span>
                  </div>
                  <span
                    class="member-status-dot"
                    :class="{ online: isUserOnline(member.id) }"
                  ></span>
                </div>
                <div class="modal-member-details">
                  <span class="modal-member-name">{{ member.name }}</span>
                  <span class="modal-member-role">{{ member.cargo || member.role || 'Colaborador' }}</span>
                </div>
                <i class="ri-chat-1-line modal-start-icon"></i>
              </button>
              <div v-if="availableDirectMembers.length === 0" class="empty-members-msg py-4">
                <i class="ri-user-unfollow-line"></i>
                <span>Nenhum colega encontrado</span>
              </div>
            </div>
          </div>

          <!-- CONTEÚDO ABA 2: Criar Novo Grupo / Canal -->
          <form v-else-if="newChatTab === 'group'" @submit.prevent="submitCreateChannel" class="channel-modal-body">
            <div class="channel-form-group">
              <label class="channel-form-label">Nome do Grupo / Canal</label>
              <input
                v-model="newChannelForm.name"
                type="text"
                placeholder="ex: Comercial, Suporte N2, Projetos 2026"
                class="channel-input-plain"
                required
                maxlength="50"
              />
            </div>

            <div class="channel-form-group">
              <label class="channel-form-label">Foto / Imagem do Grupo (opcional)</label>
              <div class="channel-upload-row">
                <div class="channel-upload-preview" :style="newChannelForm.avatar_url ? `background-image: url('${newChannelForm.avatar_url}')` : ''">
                  <i v-if="!newChannelForm.avatar_url" class="ri-camera-line"></i>
                </div>
                <div class="channel-upload-btns">
                  <input
                    ref="newChannelAvatarInput"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style="display: none"
                    @change="handleNewChannelAvatarFile"
                  />
                  <button
                    type="button"
                    class="btn-choose-photo"
                    @click="newChannelAvatarInput?.click()"
                  >
                    <i class="ri-upload-2-line"></i> {{ newChannelForm.avatar_url ? 'Trocar foto' : 'Fazer upload de foto' }}
                  </button>
                  <button
                    v-if="newChannelForm.avatar_url"
                    type="button"
                    class="btn-remove-photo"
                    @click="newChannelForm.avatar_url = ''"
                  >
                    <i class="ri-delete-bin-line"></i> Remover
                  </button>
                </div>
              </div>
            </div>

            <div class="channel-form-group">
              <label class="channel-form-label">Tipo de Conversa</label>
              <div class="channel-type-selector">
                <label
                  class="type-option-card"
                  :class="{ selected: newChannelForm.type === 'group' }"
                >
                  <input
                    type="radio"
                    value="group"
                    v-model="newChannelForm.type"
                    style="display: none"
                  />
                  <div class="type-icon-box">
                    <i class="ri-lock-line"></i>
                  </div>
                  <div class="type-text-box">
                    <span class="type-title">Grupo Privado</span>
                    <span class="type-desc">Apenas colaboradores selecionados participam</span>
                  </div>
                </label>

                <label
                  class="type-option-card"
                  :class="{ selected: newChannelForm.type === 'general' }"
                >
                  <input
                    type="radio"
                    value="general"
                    v-model="newChannelForm.type"
                    style="display: none"
                  />
                  <div class="type-icon-box">
                    <i class="ri-global-line"></i>
                  </div>
                  <div class="type-text-box">
                    <span class="type-title">Canal Público</span>
                    <span class="type-desc">Visível para todos os colaboradores da empresa</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- Seleção de Membros se for Grupo Privado -->
            <div v-if="newChannelForm.type === 'group'" class="channel-form-group">
              <div class="member-select-header">
                <label class="channel-form-label mb-0">Selecionar Participantes</label>
                <span class="selected-counter">{{ newChannelForm.participant_ids.length }} selecionado(s)</span>
              </div>
              <div class="channel-member-picker">
                <div
                  v-for="member in chatStore.teamMembers.filter(m => m.id !== auth.user?.id)"
                  :key="member.id"
                  class="picker-member-row"
                  :class="{ selected: newChannelForm.participant_ids.includes(member.id) }"
                  @click="toggleChannelMember(member.id)"
                >
                  <input
                    type="checkbox"
                    :checked="newChannelForm.participant_ids.includes(member.id)"
                    @click.stop="toggleChannelMember(member.id)"
                    class="member-checkbox"
                  />
                  <div class="member-avatar drawer-small-avatar" :style="getAvatarStyle(member)">
                    <img v-if="member.avatar_url" :src="member.avatar_url" :alt="member.name" />
                    <span v-else>{{ getInitials(member.name) }}</span>
                  </div>
                  <div class="picker-member-info">
                    <span class="picker-name">{{ member.name }}</span>
                    <span class="picker-role">{{ member.cargo || member.role || 'Colaborador' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="channel-modal-footer">
              <button type="button" class="btn-modal-cancel" @click="closeNewChatModal">
                Cancelar
              </button>
              <button type="submit" class="btn-modal-submit" :disabled="isSubmittingChannel">
                <i v-if="isSubmittingChannel" class="ri-loader-4-line spin-icon"></i>
                <span v-else>Criar Grupo</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Modal de Edição / Configurações do Grupo -->
    <Teleport to="body">
      <div v-if="showEditGroupModal" class="modal-overlay" @click.self="closeEditGroupModal">
        <div class="channel-modal-card">
          <div class="channel-modal-header">
            <div>
              <h3 class="channel-modal-title">Configurações do Grupo</h3>
              <p class="channel-modal-subtitle">Edite o nome, foto e membros participantes</p>
            </div>
            <button type="button" class="btn-modal-close" @click="closeEditGroupModal">
              <i class="ri-close-line"></i>
            </button>
          </div>

          <form @submit.prevent="submitUpdateGroup" class="channel-modal-body">
            <div class="channel-form-group">
              <label class="channel-form-label">Nome do Grupo</label>
              <input
                v-model="editGroupForm.name"
                type="text"
                class="channel-input-plain"
                required
                maxlength="50"
              />
            </div>

            <div class="channel-form-group">
              <label class="channel-form-label">Foto / Imagem do Grupo</label>
              <div class="channel-upload-row">
                <div class="channel-upload-preview" :style="editGroupForm.avatar_url ? `background-image: url('${editGroupForm.avatar_url}')` : ''">
                  <i v-if="!editGroupForm.avatar_url" class="ri-camera-line"></i>
                </div>
                <div class="channel-upload-btns">
                  <input
                    ref="editGroupAvatarInput"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style="display: none"
                    @change="handleEditGroupAvatarFile"
                  />
                  <button
                    type="button"
                    class="btn-choose-photo"
                    @click="editGroupAvatarInput?.click()"
                  >
                    <i class="ri-upload-2-line"></i> {{ editGroupForm.avatar_url ? 'Trocar foto' : 'Fazer upload de foto' }}
                  </button>
                  <button
                    v-if="editGroupForm.avatar_url"
                    type="button"
                    class="btn-remove-photo"
                    @click="editGroupForm.avatar_url = ''"
                  >
                    <i class="ri-delete-bin-line"></i> Remover
                  </button>
                </div>
              </div>
            </div>

            <!-- Adicionar / Remover Participantes (se grupo) -->
            <div class="channel-form-group" v-if="editGroupForm.type !== 'general'">
              <div class="member-select-header">
                <label class="channel-form-label mb-0">Membros Participantes</label>
                <span class="selected-counter">{{ editGroupForm.participant_ids.length }} membro(s)</span>
              </div>
              <div class="channel-member-picker">
                <div
                  v-for="member in chatStore.teamMembers"
                  :key="member.id"
                  class="picker-member-row"
                  :class="{ selected: editGroupForm.participant_ids.includes(member.id) }"
                  @click="toggleEditGroupMember(member.id)"
                >
                  <input
                    type="checkbox"
                    :checked="editGroupForm.participant_ids.includes(member.id)"
                    @click.stop="toggleEditGroupMember(member.id)"
                    class="member-checkbox"
                  />
                  <div class="member-avatar drawer-small-avatar" :style="getAvatarStyle(member)">
                    <img v-if="member.avatar_url" :src="member.avatar_url" :alt="member.name" />
                    <span v-else>{{ getInitials(member.name) }}</span>
                  </div>
                  <div class="picker-member-info">
                    <span class="picker-name">
                      {{ member.name }}
                      <span v-if="member.id === auth.user?.id" class="self-tag">(Você)</span>
                    </span>
                    <span class="picker-role">{{ member.cargo || member.role || 'Colaborador' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Zona de Ações de Saída e Exclusão -->
            <div class="group-danger-actions" v-if="editGroupForm.type !== 'general'">
              <button
                type="button"
                class="btn-leave-group"
                :disabled="isLeavingGroup"
                @click="handleLeaveGroup"
              >
                <i class="ri-logout-box-r-line"></i> Sair do Grupo
              </button>

              <button
                v-if="editGroupForm.created_by === auth.user?.id || auth.user?.role === 'admin'"
                type="button"
                class="btn-delete-group"
                :disabled="isDeletingGroup"
                @click="handleDeleteGroup"
              >
                <i class="ri-delete-bin-line"></i> Excluir Grupo
              </button>
            </div>

            <div class="channel-modal-footer">
              <button type="button" class="btn-modal-cancel" @click="closeEditGroupModal">
                Cancelar
              </button>
              <button type="submit" class="btn-modal-submit" :disabled="isUpdatingGroup">
                <i v-if="isUpdatingGroup" class="ri-loader-4-line spin-icon"></i>
                <span v-else>Salvar Alterações</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Modal Lightbox de Imagem Ampliada -->
    <Teleport to="body">
      <div v-if="previewImageUrl" class="image-lightbox-overlay" @click.self="closeImagePreview">
        <div class="lightbox-container">
          <img :src="previewImageUrl" alt="Visualização ampliada" class="lightbox-img" />
          <div class="lightbox-controls">
            <a :href="previewImageUrl" download target="_blank" class="lightbox-btn" title="Baixar imagem">
              <i class="ri-download-line"></i> Baixar
            </a>
            <button type="button" class="lightbox-btn close-btn" title="Fechar" @click="closeImagePreview">
              <i class="ri-close-line"></i> Fechar
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Menu de Contexto Flutuante para Conversas Internas (Desktop: Botão Direito / Mobile: Pressionar e Segurar) -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="chat-context-menu-backdrop"
        @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      >
        <div
          class="chat-context-menu"
          :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
          @click.stop
        >
          <div class="context-menu-header">
            <strong class="context-menu-title">{{ contextMenu.conv?.name }}</strong>
            <small class="context-menu-sub">{{ contextMenu.conv?.type === 'direct' ? 'Conversa Direta' : (contextMenu.conv?.type === 'general' ? 'Canal Geral' : 'Grupo') }}</small>
          </div>
          <div class="context-menu-divider"></div>

          <!-- Fixar / Desafixar -->
          <button type="button" class="context-menu-item" @click="togglePinConversation(contextMenu.conv)">
            <i :class="isConversationPinned(contextMenu.conv?.id) ? 'ri-pushpin-line' : 'ri-pushpin-2-fill'"></i>
            <span>{{ isConversationPinned(contextMenu.conv?.id) ? 'Desafixar do topo' : 'Fixar conversa no topo' }}</span>
          </button>

          <!-- Marcar como lida / não lida -->
          <button type="button" class="context-menu-item" @click="toggleReadConversation(contextMenu.conv)">
            <i :class="(contextMenu.conv?.unread_count || 0) > 0 ? 'ri-mail-open-line' : 'ri-mail-unread-line'"></i>
            <span>{{ (contextMenu.conv?.unread_count || 0) > 0 ? 'Marcar como lida' : 'Marcar como não lida' }}</span>
          </button>

          <!-- Silenciar / Reativar -->
          <button type="button" class="context-menu-item" @click="toggleMuteConversation(contextMenu.conv)">
            <i :class="isConversationMuted(contextMenu.conv?.id) ? 'ri-notification-3-line' : 'ri-notification-off-line'"></i>
            <span>{{ isConversationMuted(contextMenu.conv?.id) ? 'Reativar notificações' : 'Silenciar notificações' }}</span>
          </button>

          <!-- Ver Detalhes -->
          <button type="button" class="context-menu-item" @click="openDetailsFromContextMenu(contextMenu.conv)">
            <i class="ri-information-line"></i>
            <span>Ver detalhes e membros</span>
          </button>

          <!-- Sair do Grupo se for grupo e não for o criador -->
          <template v-if="contextMenu.conv?.type === 'group' && contextMenu.conv?.created_by !== auth.user?.id">
            <div class="context-menu-divider"></div>
            <button type="button" class="context-menu-item text-danger" @click="leaveGroupFromContextMenu(contextMenu.conv)">
              <i class="ri-logout-box-r-line"></i>
              <span>Sair do grupo</span>
            </button>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useInternalChatStore } from '@/stores/internal-chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { useSocket } from '@/composables/useSocket'
import { prepareAvatar } from '@/utils/avatar-upload'

const chatStore = useInternalChatStore()
const auth = useAuthStore()
const ui = useUiStore()
const { socket } = useSocket()

const searchTerm = ref('')
const activeFilter = ref('all') // Mantido para compatibilidade interna se necessário
const inputMessage = ref('')
const messagesContainerRef = ref(null)
const inputTextareaRef = ref(null)
const fileInputRef = ref(null)

const replyingTo = ref(null)
const previewImageUrl = ref(null)

// ─── Conversas Fixadas, Silenciadas e Menu Contextual (Botão Direito / Long Touch) ───
const PINNED_STORAGE_KEY = computed(() => `brisoft_pinned_convs_${auth.user?.id || 'default'}`)
const MUTED_STORAGE_KEY = computed(() => `brisoft_muted_convs_${auth.user?.id || 'default'}`)

function loadStoredSet(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveStoredSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)))
  } catch {}
}

const pinnedConvIds = ref(loadStoredSet(PINNED_STORAGE_KEY.value))
const mutedConvIds = ref(loadStoredSet(MUTED_STORAGE_KEY.value))

watch(PINNED_STORAGE_KEY, (newKey) => {
  pinnedConvIds.value = loadStoredSet(newKey)
  mutedConvIds.value = loadStoredSet(MUTED_STORAGE_KEY.value)
})

function isConversationPinned(convId) {
  return convId ? pinnedConvIds.value.has(convId) : false
}

function isConversationMuted(convId) {
  return convId ? mutedConvIds.value.has(convId) : false
}

function togglePinConversation(conv) {
  if (!conv?.id) return
  if (pinnedConvIds.value.has(conv.id)) {
    pinnedConvIds.value.delete(conv.id)
    ui.showToast('Conversa desafixada do topo.')
  } else {
    pinnedConvIds.value.add(conv.id)
    ui.showToast('Conversa fixada no topo!')
  }
  pinnedConvIds.value = new Set(pinnedConvIds.value)
  saveStoredSet(PINNED_STORAGE_KEY.value, pinnedConvIds.value)
  closeContextMenu()
}

function toggleMuteConversation(conv) {
  if (!conv?.id) return
  if (mutedConvIds.value.has(conv.id)) {
    mutedConvIds.value.delete(conv.id)
    ui.showToast('Notificações reativadas.')
  } else {
    mutedConvIds.value.add(conv.id)
    ui.showToast('Notificações silenciadas.')
  }
  mutedConvIds.value = new Set(mutedConvIds.value)
  saveStoredSet(MUTED_STORAGE_KEY.value, mutedConvIds.value)
  closeContextMenu()
}

function toggleReadConversation(conv) {
  if (!conv?.id) return
  if ((conv.unread_count || 0) > 0) {
    conv.unread_count = 0
    chatStore.markConversationAsRead(conv.id)
    ui.showToast('Marcada como lida.')
  } else {
    conv.unread_count = 1
    ui.showToast('Marcada como não lida.')
  }
  closeContextMenu()
}

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  conv: null
})

let touchTimer = null
let touchMoved = false

function openChatContextMenu(event, conv) {
  if (!conv) return
  event.preventDefault?.()

  const menuWidth = 240
  const menuHeight = 250
  const clickX = event.clientX || (event.touches && event.touches[0]?.clientX) || 120
  const clickY = event.clientY || (event.touches && event.touches[0]?.clientY) || 150

  let posX = clickX
  let posY = clickY

  if (posX + menuWidth > window.innerWidth) {
    posX = window.innerWidth - menuWidth - 16
  }
  if (posY + menuHeight > window.innerHeight) {
    posY = window.innerHeight - menuHeight - 16
  }

  contextMenu.x = Math.max(12, posX)
  contextMenu.y = Math.max(12, posY)
  contextMenu.conv = conv
  contextMenu.visible = true
}

function handleTouchStart(event, conv) {
  touchMoved = false
  if (touchTimer) clearTimeout(touchTimer)
  touchTimer = setTimeout(() => {
    if (!touchMoved) {
      openChatContextMenu(event, conv)
    }
  }, 500)
}

function handleTouchMove() {
  touchMoved = true
  if (touchTimer) clearTimeout(touchTimer)
}

function handleTouchEnd() {
  if (touchTimer) clearTimeout(touchTimer)
}

function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.conv = null
}

function openDetailsFromContextMenu(conv) {
  closeContextMenu()
  if (conv) {
    selectConversationWithDetails(conv)
    showDetailsDrawer.value = true
  }
}

async function leaveGroupFromContextMenu(conv) {
  closeContextMenu()
  if (!conv?.id) return
  if (confirm(`Deseja realmente sair do grupo "${conv.name}"?`)) {
    try {
      await chatStore.leaveGroup(conv.id)
      ui.showToast('Você saiu do grupo.')
    } catch {
      ui.showToast('Erro ao sair do grupo.', 'error')
    }
  }
}

// ─── Busca Textual na Conversa Ativa ──────────────────────────────────────────
const showMessageSearch = ref(false)
const messageSearchQuery = ref('')
const messageSearchInputRef = ref(null)
const currentSearchIndex = ref(0)

// ─── Painel Lateral de Detalhes da Conversa ───────────────────────────────────
const showDetailsDrawer = ref(false)
const detailsTab = ref('members') // 'members' | 'media' | 'pinned'

// ─── Modal de Criação / Edição de Conversas e Grupos ──────────────────────────
const showNewChatModal = ref(false)
const newChatTab = ref('direct') // 'direct' | 'group'
const newChatMemberSearch = ref('')
const isSubmittingChannel = ref(false)
const newChannelForm = ref({
  name: '',
  avatar_url: '',
  type: 'group',
  participant_ids: []
})

const showEditGroupModal = ref(false)
const isUpdatingGroup = ref(false)
const isLeavingGroup = ref(false)
const isDeletingGroup = ref(false)
const editGroupForm = ref({
  id: null,
  name: '',
  avatar_url: '',
  type: 'group',
  created_by: null,
  participant_ids: [],
  memberFilter: ''
})

const newChannelAvatarInput = ref(null)
const editGroupAvatarInput = ref(null)

async function handleNewChannelAvatarFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const dataUrl = await prepareAvatar(file)
    newChannelForm.value.avatar_url = dataUrl
  } catch (err) {
    ui.showToast(err.message, 'error')
  } finally {
    e.target.value = ''
  }
}

async function handleEditGroupAvatarFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const dataUrl = await prepareAvatar(file)
    editGroupForm.value.avatar_url = dataUrl
  } catch (err) {
    ui.showToast(err.message, 'error')
  } finally {
    e.target.value = ''
  }
}

function notifyVoiceCall() {
  ui.showToast('A funcionalidade de ligação de voz está em desenvolvimento e estará disponível em breve!', 'info')
}

function notifyVideoCall() {
  ui.showToast('A funcionalidade de chamada de vídeo está em desenvolvimento e estará disponível em breve!', 'info')
}

async function openActiveChatDetails() {
  if (!chatStore.activeConversation) return
  showDetailsDrawer.value = true
  if (chatStore.activeConversation.id) {
    await chatStore.fetchConversationDetails(chatStore.activeConversation.id)
  }
}

const isCurrentUserChannelOwner = computed(() => {
  if (!chatStore.activeConversation) return false
  return chatStore.activeConversation.created_by === auth.user?.id || auth.user?.role === 'Administrador'
})

const isCurrentUserChannelSubOwner = computed(() => {
  if (!chatStore.activeConversation) return false
  const subOwners = chatStore.conversationDetails?.conversation?.sub_owners || chatStore.activeConversation.sub_owners || []
  return subOwners.includes(auth.user?.id)
})

const canCurrentUserManageChannel = computed(() => {
  return isCurrentUserChannelOwner.value || isCurrentUserChannelSubOwner.value
})

function isMemberChannelOwner(memberId) {
  return chatStore.activeConversation?.created_by === memberId
}

function isMemberChannelSubOwner(memberId) {
  const subOwners = chatStore.conversationDetails?.conversation?.sub_owners || chatStore.activeConversation?.sub_owners || []
  return subOwners.includes(memberId)
}

async function handleToggleSubOwner(member) {
  if (!isCurrentUserChannelOwner.value) {
    ui.showToast('Apenas o responsável pelo canal pode promover sub-responsáveis.', 'error')
    return
  }
  if (!member || member.id === chatStore.activeConversation?.created_by) return
  try {
    await chatStore.toggleSubOwner(chatStore.activeConversation.id, member.id)
  } catch (err) {
    // Tratado no store
  }
}

async function handleRemoveMemberFromChannel(member) {
  if (!canCurrentUserManageChannel.value) {
    ui.showToast('Você não tem permissão para remover membros.', 'error')
    return
  }
  if (member.id === chatStore.activeConversation?.created_by) {
    ui.showToast('O responsável principal não pode ser removido do canal.', 'error')
    return
  }
  if (confirm(`Remover "${member.name}" deste canal?`)) {
    try {
      const currentIds = conversationParticipants.value.map(p => p.id)
      const newIds = currentIds.filter(id => id !== member.id)
      await chatStore.updateChannel(chatStore.activeConversation.id, {
        participant_ids: newIds
      })
      ui.showToast(`${member.name} foi removido do canal.`)
    } catch {
      ui.showToast('Erro ao remover membro.', 'error')
    }
  }
}

async function confirmLeaveActiveChannel() {
  if (!chatStore.activeConversation) return
  if (confirm(`Deseja realmente sair do canal "${chatStore.activeConversation.name}"?`)) {
    try {
      await chatStore.leaveChannel(chatStore.activeConversation.id)
      showDetailsDrawer.value = false
    } catch {
      // Tratado no store
    }
  }
}

function isSystemMessage(msg) {
  if (!msg) return false
  return msg.is_system || msg.text?.startsWith('[SYS]: ') || !msg.sender_id
}

function getSystemMessageText(msg) {
  if (!msg?.text) return ''
  return msg.text.replace(/^\[SYS\]:\s*/, '')
}

// ─── Fase 4: Reações, Menções, Fixadas e Edição ──────────────────────────────
const activeReactionPopoverId = ref(null)
const activeMoreMenuId = ref(null)
const editingMessage = ref(null)
const showMentionSuggestions = ref(false)
const mentionSearchTerm = ref('')

// ─── Gravação de Áudio ────────────────────────────────────────────────────────
const isRecordingAudio = ref(false)
const recordingSeconds = ref(0)
let audioTimer = null
let mediaRecorder = null
let audioChunks = []
let typingTimeout = null

// ─── Inicialização Instantânea ────────────────────────────────────────────────
onMounted(() => {
  window.addEventListener('click', closeAllPopovers)
  window.addEventListener('scroll', closeContextMenu, true)

  // 1. Inicialização instantânea: se já temos conversas em cache ou memória, exibe imediatamente!
  if (chatStore.conversations.length > 0) {
    if (!chatStore.activeConversation) {
      const pinned = chatStore.conversations.find(c => isConversationPinned(c.id))
      const general = chatStore.conversations.find(c => c.type === 'general')
      chatStore.selectConversation(pinned || general || chatStore.conversations[0])
    } else {
      chatStore.selectConversation(chatStore.activeConversation)
    }
  }

  // 2. Atualiza dados frescos em background sem bloquear a UI
  chatStore.fetchConversations().then(() => {
    if (!chatStore.activeConversation && chatStore.conversations.length > 0) {
      const pinned = chatStore.conversations.find(c => isConversationPinned(c.id))
      const general = chatStore.conversations.find(c => c.type === 'general')
      chatStore.selectConversation(pinned || general || chatStore.conversations[0])
    }
  })
  chatStore.fetchTeamMembers()
})

onUnmounted(() => {
  window.removeEventListener('click', closeAllPopovers)
  window.removeEventListener('scroll', closeContextMenu, true)
  clearInterval(audioTimer)
})

function closeAllPopovers() {
  activeReactionPopoverId.value = null
  activeMoreMenuId.value = null
  showMentionSuggestions.value = false
  closeContextMenu()
}

// Rola para a mensagem mais recente ao carregar ou receber novas mensagens
watch(() => chatStore.messages.length, () => {
  scrollToBottom()
})

watch(() => chatStore.activeConversation?.id, async (newId) => {
  scrollToBottom()
  nextTick(() => {
    inputTextareaRef.value?.focus({ preventScroll: true })
  })

  // Se o drawer de detalhes estiver aberto, carrega os dados da nova conversa
  if (newId && showDetailsDrawer.value) {
    await chatStore.fetchConversationDetails(newId)
  }
})

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
    }
  })
}

// ─── Computeds de Conversas e Filtros ──────────────────────────────────────────
const onlineCount = computed(() => ui.onlineUsersCount || 1)
const totalConversationsCount = computed(() => chatStore.conversations.length)

const channelConversations = computed(() => {
  return chatStore.conversations.filter(c => c.type === 'general' || c.type === 'department' || c.type === 'group')
})

const unreadChannelConversations = computed(() => {
  return channelConversations.value.filter(c => (c.unread_count || 0) > 0)
})

const displayedChannels = computed(() => {
  let list = channelConversations.value
  if (activeFilter.value === 'unread') {
    list = unreadChannelConversations.value
  }

  const term = searchTerm.value.toLowerCase().trim()
  if (!term) return list
  return list.filter(c => c.name?.toLowerCase().includes(term))
})

const directConversations = computed(() => {
  return chatStore.conversations.filter(c => c.type === 'direct')
})

const unreadDirectConversations = computed(() => {
  return directConversations.value.filter(c => (c.unread_count || 0) > 0)
})

const displayedDirectConversations = computed(() => {
  let list = directConversations.value
  if (activeFilter.value === 'unread') {
    list = unreadDirectConversations.value
  }

  const term = searchTerm.value.toLowerCase().trim()
  if (!term) return list
  return list.filter(c => 
    c.name?.toLowerCase().includes(term) ||
    c.other_user?.cargo?.toLowerCase().includes(term) ||
    c.other_user?.role?.toLowerCase().includes(term) ||
    c.other_user?.email?.toLowerCase().includes(term)
  )
})

// Fila unificada (estilo exato Atendimentos)
const filteredConversationsList = computed(() => {
  let list = []
  if (activeFilter.value === 'channels') {
    list = channelConversations.value
  } else if (activeFilter.value === 'direct') {
    list = directConversations.value
  } else if (activeFilter.value === 'unread') {
    list = chatStore.conversations.filter(c => (c.unread_count || 0) > 0)
  } else {
    // 'all'
    list = chatStore.conversations
  }

  const term = searchTerm.value.toLowerCase().trim()
  if (term) {
    list = list.filter(c => 
      c.name?.toLowerCase().includes(term) ||
      c.last_message_text?.toLowerCase().includes(term) ||
      c.other_user?.cargo?.toLowerCase().includes(term) ||
      c.other_user?.role?.toLowerCase().includes(term) ||
      c.other_user?.email?.toLowerCase().includes(term)
    )
  }

  return [...list].sort((a, b) => {
    // 1. Conversas fixadas no topo
    const pinnedA = isConversationPinned(a.id) ? 1 : 0
    const pinnedB = isConversationPinned(b.id) ? 1 : 0
    if (pinnedA !== pinnedB) return pinnedB - pinnedA

    // 2. Não lidas
    const unreadA = (a.unread_count || 0) > 0 ? 1 : 0
    const unreadB = (b.unread_count || 0) > 0 ? 1 : 0
    if (unreadA !== unreadB) return unreadB - unreadA

    // 3. Mais recentes
    const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return timeB - timeA
  })
})

function getConversationTagLabel(conv) {
  if (!conv) return ''
  if (conv.type === 'general') return 'Geral'
  if (conv.type === 'department') return 'Setor'
  if (conv.type === 'group') return 'Grupo'
  return conv.other_user?.cargo || conv.other_user?.role || 'Colega'
}

const otherColleaguesSearchMatches = computed(() => {
  const term = searchTerm.value.toLowerCase().trim()
  if (!term) return []
  const activePartnerIds = new Set(directConversations.value.map(c => String(c.other_user?.id)))
  return chatStore.teamMembers.filter(m => 
    m.id !== auth.user?.id &&
    !activePartnerIds.has(String(m.id)) &&
    (m.name?.toLowerCase().includes(term) || m.cargo?.toLowerCase().includes(term) || m.role?.toLowerCase().includes(term) || m.email?.toLowerCase().includes(term))
  )
})

const availableDirectMembers = computed(() => {
  const term = newChatMemberSearch.value.toLowerCase().trim()
  const list = chatStore.teamMembers.filter(m => m.id !== auth.user?.id)
  if (!term) return list
  return list.filter(m => 
    m.name?.toLowerCase().includes(term) ||
    m.cargo?.toLowerCase().includes(term) ||
    m.role?.toLowerCase().includes(term) ||
    m.email?.toLowerCase().includes(term)
  )
})

const activeDirectUser = computed(() => {
  if (chatStore.activeConversation?.type !== 'direct') return null
  return chatStore.activeConversation.other_user
})

const isTypingNow = computed(() => {
  if (!chatStore.activeConversation) return false
  const typers = chatStore.typingUsers[chatStore.activeConversation.id]
  return typers && Object.keys(typers).length > 0
})

const typingLabel = computed(() => {
  if (!chatStore.activeConversation) return ''
  const typers = chatStore.typingUsers[chatStore.activeConversation.id] || {}
  const names = Object.values(typers)
  if (names.length === 1) return `${names[0]} está digitando...`
  if (names.length > 1) return `${names[0]} e outros estão digitando...`
  return ''
})

// ─── Fase 4: Mensagens Fixadas e Menções ──────────────────────────────────────
const latestPinnedMessage = computed(() => {
  const list = chatStore.pinnedMessages || []
  return list.length > 0 ? list[list.length - 1] : null
})

const mentionCandidates = computed(() => {
  const term = mentionSearchTerm.value.toLowerCase().trim()
  const members = chatStore.teamMembers.filter(m => m.id !== auth.user?.id)
  if (!term) return members.slice(0, 5)
  return members.filter(m => m.name?.toLowerCase().includes(term)).slice(0, 5)
})

// ─── Helpers de Canais e Ícones ───────────────────────────────────────────────
function getChannelIcon(type) {
  if (type === 'general') return 'ri-megaphone-line'
  if (type === 'group') return 'ri-team-line'
  if (type === 'department') return 'ri-building-line'
  return 'ri-hashtag'
}

function getConversationTypeLabel(conv) {
  if (!conv) return ''
  if (conv.type === 'general') return 'Canal Geral da Empresa'
  if (conv.type === 'group') return 'Grupo Privado de Equipe'
  if (conv.type === 'department') return 'Canal de Setor'
  return 'Mensagem Direta'
}

// ─── Busca Textual na Conversa Ativa ──────────────────────────────────────────
const searchMatches = computed(() => {
  const query = messageSearchQuery.value.trim().toLowerCase()
  if (!query) return []
  return chatStore.messages.filter(m => m.text && m.text.toLowerCase().includes(query))
})

watch(searchMatches, (newMatches) => {
  if (newMatches.length > 0) {
    currentSearchIndex.value = 0
    scrollToMessage(newMatches[0].id)
  }
})

function toggleMessageSearch() {
  showMessageSearch.value = !showMessageSearch.value
  if (showMessageSearch.value) {
    nextTick(() => {
      messageSearchInputRef.value?.focus({ preventScroll: true })
    })
  } else {
    messageSearchQuery.value = ''
  }
}

function closeMessageSearch() {
  showMessageSearch.value = false
  messageSearchQuery.value = ''
}

function nextSearchMatch() {
  if (searchMatches.value.length === 0) return
  currentSearchIndex.value = (currentSearchIndex.value + 1) % searchMatches.value.length
  scrollToMessage(searchMatches.value[currentSearchIndex.value].id)
}

function prevSearchMatch() {
  if (searchMatches.value.length === 0) return
  currentSearchIndex.value = (currentSearchIndex.value - 1 + searchMatches.value.length) % searchMatches.value.length
  scrollToMessage(searchMatches.value[currentSearchIndex.value].id)
}

function isMessageSearchMatched(msgId) {
  if (!messageSearchQuery.value.trim() || searchMatches.value.length === 0) return false
  const activeMatch = searchMatches.value[currentSearchIndex.value]
  return activeMatch?.id === msgId
}

// ─── Drawer de Detalhes da Conversa ───────────────────────────────────────────
function toggleDetailsDrawer() {
  showDetailsDrawer.value = !showDetailsDrawer.value
  if (showDetailsDrawer.value && chatStore.activeConversation) {
    chatStore.fetchConversationDetails(chatStore.activeConversation.id)
  }
}

function selectConversationWithDetails(conv) {
  chatStore.selectConversation(conv)
  if (showDetailsDrawer.value && conv?.id) {
    chatStore.fetchConversationDetails(conv.id)
  }
}

async function openDirectChatWithDetails(userId) {
  const conv = await chatStore.startDirectChatWith(userId)
  if (showDetailsDrawer.value && conv?.id) {
    chatStore.fetchConversationDetails(conv.id)
  }
}

const conversationParticipants = computed(() => {
  if (chatStore.activeConversation?.type === 'direct') {
    const list = []
    if (auth.user) list.push({ id: auth.user.id, name: auth.user.name, role: auth.user.role, cargo: auth.user.cargo, avatar_url: auth.user.avatar_url })
    if (activeDirectUser.value) list.push(activeDirectUser.value)
    return list
  }
  if (chatStore.conversationDetails?.participants?.length) {
    return chatStore.conversationDetails.participants
  }
  // Se for canal geral e ainda não carregou, exibe toda a equipe
  if (chatStore.activeConversation?.type === 'general') {
    return chatStore.teamMembers
  }
  return []
})

const sharedMediaFiles = computed(() => {
  if (chatStore.conversationDetails?.media?.length) {
    return chatStore.conversationDetails.media
  }
  // Fallback para mensagens locais se houver anexos
  return chatStore.messages.filter(m => m.media_url)
})

const sharedImages = computed(() => {
  return sharedMediaFiles.value.filter(m => m.media_type === 'image' || isImageUrl(m.media_url))
})

const sharedDocs = computed(() => {
  return sharedMediaFiles.value.filter(m => m.media_type !== 'image' && !isImageUrl(m.media_url))
})

// ─── Criação e Edição de Grupos / Conversas ──────────────────────────────────
function openNewChatModal(tab = 'direct') {
  newChatTab.value = tab
  newChatMemberSearch.value = ''
  newChannelForm.value = {
    name: '',
    avatar_url: '',
    type: 'group',
    participant_ids: []
  }
  showNewChatModal.value = true
}

function closeNewChatModal() {
  showNewChatModal.value = false
  isSubmittingChannel.value = false
}

function openNewChannelModal() {
  openNewChatModal('group')
}

async function startDirectChatFromModal(userId) {
  closeNewChatModal()
  await openDirectChatWithDetails(userId)
}

function toggleChannelMember(memberId) {
  const index = newChannelForm.value.participant_ids.indexOf(memberId)
  if (index === -1) {
    newChannelForm.value.participant_ids.push(memberId)
  } else {
    newChannelForm.value.participant_ids.splice(index, 1)
  }
}

async function submitCreateChannel() {
  let rawName = newChannelForm.value.name.trim()
  if (!rawName) {
    ui.showToast('Informe um nome para o grupo ou canal.', 'error')
    return
  }

  isSubmittingChannel.value = true
  try {
    const finalName = newChannelForm.value.type === 'general'
      ? (rawName.startsWith('#') ? rawName : `#${rawName.replace(/\s+/g, '-').toLowerCase()}`)
      : rawName

    const created = await chatStore.createChannel({
      name: finalName,
      type: newChannelForm.value.type,
      avatar_url: newChannelForm.value.avatar_url?.trim() || null,
      participant_ids: newChannelForm.value.participant_ids
    })

    if (created) {
      closeNewChatModal()
      if (showDetailsDrawer.value) {
        await chatStore.fetchConversationDetails(created.id)
      }
    }
  } finally {
    isSubmittingChannel.value = false
  }
}

async function openEditGroupModal() {
  if (!chatStore.activeConversation || chatStore.activeConversation.type === 'direct') return

  await chatStore.fetchConversationDetails(chatStore.activeConversation.id)
  const currentParticipants = chatStore.conversationDetails?.participants || []
  const participantIds = currentParticipants.map(p => p.id)

  editGroupForm.value = {
    id: chatStore.activeConversation.id,
    name: chatStore.activeConversation.name?.replace(/^#/, '') || '',
    avatar_url: chatStore.activeConversation.avatar_url || '',
    type: chatStore.activeConversation.type,
    created_by: chatStore.activeConversation.created_by,
    participant_ids: participantIds.length ? participantIds : [auth.user?.id],
    memberFilter: ''
  }
  showEditGroupModal.value = true
}

function closeEditGroupModal() {
  showEditGroupModal.value = false
  isUpdatingGroup.value = false
  isLeavingGroup.value = false
  isDeletingGroup.value = false
}

function toggleEditGroupMember(memberId) {
  const index = editGroupForm.value.participant_ids.indexOf(memberId)
  if (index === -1) {
    editGroupForm.value.participant_ids.push(memberId)
  } else {
    if (memberId === auth.user?.id) {
      ui.showToast('Para sair do grupo, utilize o botão "Sair do Grupo".', 'warning')
      return
    }
    editGroupForm.value.participant_ids.splice(index, 1)
  }
}

async function submitUpdateGroup() {
  const rawName = editGroupForm.value.name.trim()
  if (!rawName) {
    ui.showToast('O grupo precisa de um nome.', 'error')
    return
  }

  isUpdatingGroup.value = true
  try {
    const finalName = editGroupForm.value.type === 'general'
      ? (rawName.startsWith('#') ? rawName : `#${rawName.replace(/\s+/g, '-').toLowerCase()}`)
      : rawName

    const success = await chatStore.updateChannel(editGroupForm.value.id, {
      name: finalName,
      avatar_url: editGroupForm.value.avatar_url?.trim() || null,
      participant_ids: editGroupForm.value.participant_ids
    })

    if (success) {
      closeEditGroupModal()
    }
  } finally {
    isUpdatingGroup.value = false
  }
}

async function handleLeaveGroup() {
  if (!confirm('Deseja realmente sair deste grupo?')) return
  isLeavingGroup.value = true
  try {
    const success = await chatStore.leaveChannel(editGroupForm.value.id)
    if (success) {
      closeEditGroupModal()
      selectGeneralChannel()
    }
  } finally {
    isLeavingGroup.value = false
  }
}

async function handleDeleteGroup() {
  if (!confirm('ATENÇÃO: Deseja realmente excluir este grupo permanentemente? Todas as mensagens serão perdidas.')) return
  isDeletingGroup.value = true
  try {
    const success = await chatStore.deleteChannel(editGroupForm.value.id)
    if (success) {
      closeEditGroupModal()
      selectGeneralChannel()
    }
  } finally {
    isDeletingGroup.value = false
  }
}

// ─── Fase 4: Reações com Emojis ──────────────────────────────────────────────
function toggleReactionPopover(msgId) {
  if (activeReactionPopoverId.value === msgId) {
    activeReactionPopoverId.value = null
  } else {
    activeReactionPopoverId.value = msgId
    activeMoreMenuId.value = null
  }
}

function addReaction(msgId, emoji) {
  activeReactionPopoverId.value = null
  chatStore.toggleReaction(msgId, emoji)
}

function groupReactions(reactions) {
  if (!Array.isArray(reactions) || reactions.length === 0) return []
  const map = {}
  reactions.forEach(r => {
    if (!map[r.emoji]) {
      map[r.emoji] = { emoji: r.emoji, count: 0, userReacted: false, names: [] }
    }
    map[r.emoji].count++
    if (r.user_id === auth.user?.id) {
      map[r.emoji].userReacted = true
    }
    if (r.user_name) {
      map[r.emoji].names.push(r.user_name)
    }
  })
  return Object.values(map).map(g => ({
    ...g,
    tooltip: `${g.names.join(', ')} reagiu com ${g.emoji}`
  }))
}

// ─── Fase 4: Menu de Mais Ações e Edição/Exclusão ─────────────────────────────
function toggleMoreMenu(msgId) {
  if (activeMoreMenuId.value === msgId) {
    activeMoreMenuId.value = null
  } else {
    activeMoreMenuId.value = msgId
    activeReactionPopoverId.value = null
  }
}

function startEditMessage(msg) {
  editingMessage.value = msg
  inputMessage.value = msg.text || ''
  nextTick(() => {
    inputTextareaRef.value?.focus({ preventScroll: true })
  })
}

function cancelEditMessage() {
  editingMessage.value = null
  inputMessage.value = ''
}

async function confirmDeleteMessage(msgId) {
  if (confirm('Tem certeza que deseja apagar esta mensagem para todos?')) {
    await chatStore.deleteMessage(msgId)
  }
}

function copyMessageText(text) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    ui.showToast('Texto copiado para a área de transferência!')
  }).catch(() => {})
}

// ─── Fase 4: Autocomplete de Menções (@mentions) ──────────────────────────────
function selectMentionMember(member) {
  const val = inputMessage.value
  const atIdx = val.lastIndexOf('@')
  if (atIdx >= 0) {
    inputMessage.value = val.slice(0, atIdx) + `@${member.name} `
  } else {
    inputMessage.value += `@${member.name} `
  }
  showMentionSuggestions.value = false
  nextTick(() => {
    inputTextareaRef.value?.focus({ preventScroll: true })
  })
}

// ─── Helpers de Status e Conversas ───────────────────────────────────────────
function isUserOnline(userId) {
  if (!userId) return false
  if (userId === auth.user?.id) return true
  return ui.onlineUsersList.some(u => String(u.id) === String(userId))
}

function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return 'Offline'
  const date = new Date(lastSeenAt)
  if (isNaN(date.getTime())) return 'Offline'

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffTime = today.getTime() - targetDay.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const timeStr = `${hours}:${minutes}`

  if (diffDays === 0) {
    return `Visto por último hoje às ${timeStr}`
  } else if (diffDays === 1) {
    return `Visto por último ontem às ${timeStr}`
  } else {
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    if (date.getFullYear() === now.getFullYear()) {
      return `Visto por último em ${day}/${month} às ${timeStr}`
    } else {
      return `Visto por último em ${day}/${month}/${date.getFullYear()} às ${timeStr}`
    }
  }
}

function getUserStatusText(user) {
  if (!user?.id) return ''
  if (isUserOnline(user.id)) return 'Online'
  const lastSeen = ui.lastSeenUsers?.[user.id] || user.last_seen_at
  return formatLastSeen(lastSeen)
}

function getDirectConv(userId) {
  return chatStore.conversations.find(c => 
    c.type === 'direct' && String(c.other_user?.id) === String(userId)
  )
}

function isDirectActive(userId) {
  if (chatStore.activeConversation?.type !== 'direct') return false
  return String(chatStore.activeConversation.other_user?.id) === String(userId)
}

function selectGeneralChannel() {
  const general = chatStore.conversations.find(c => c.type === 'general')
  if (general) chatStore.selectConversation(general)
}

// ─── Envio e Digitação ────────────────────────────────────────────────────────
async function handleSend() {
  const text = inputMessage.value.trim()
  if (!text) return

  // Se estiver em modo de edição
  if (editingMessage.value) {
    const editId = editingMessage.value.id
    editingMessage.value = null
    inputMessage.value = ''
    await chatStore.editMessage(editId, text)
    return
  }

  const replyId = replyingTo.value?.id || null
  inputMessage.value = ''
  replyingTo.value = null
  showMentionSuggestions.value = false

  if (chatStore.activeConversation) {
    socket?.emit('internal_typing', {
      conversationId: chatStore.activeConversation.id,
      isTyping: false
    })
  }

  await chatStore.sendMessage(text, { reply_to_id: replyId })
  scrollToBottom()
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    if (editingMessage.value) {
      cancelEditMessage()
      return
    }
    if (showMentionSuggestions.value) {
      showMentionSuggestions.value = false
      return
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    if (showMentionSuggestions.value && mentionCandidates.value.length > 0) {
      e.preventDefault()
      selectMentionMember(mentionCandidates.value[0])
      return
    }
    e.preventDefault()
    handleSend()
  }
}

function onInputTyping() {
  // Detecção de menção ativa (@...)
  const val = inputMessage.value
  const atIdx = val.lastIndexOf('@')
  if (atIdx >= 0) {
    const textAfterAt = val.slice(atIdx + 1)
    if (!textAfterAt.includes(' ') && textAfterAt.length < 25) {
      showMentionSuggestions.value = true
      mentionSearchTerm.value = textAfterAt
    } else {
      showMentionSuggestions.value = false
    }
  } else {
    showMentionSuggestions.value = false
  }

  if (chatStore.activeConversation) {
    socket?.emit('internal_typing', {
      conversationId: chatStore.activeConversation.id,
      isTyping: true
    })
  }
  clearTimeout(typingTimeout)
  typingTimeout = setTimeout(() => {
    if (chatStore.activeConversation) {
      socket?.emit('internal_typing', {
        conversationId: chatStore.activeConversation.id,
        isTyping: false
      })
    }
  }, 2000)
}

function insertEmoji(emoji) {
  inputMessage.value += emoji
  inputTextareaRef.value?.focus({ preventScroll: true })
}

// ─── Citação e Resposta (Reply) ──────────────────────────────────────────────
function setReplyTo(msg) {
  replyingTo.value = msg
  nextTick(() => {
    inputTextareaRef.value?.focus({ preventScroll: true })
  })
}

function cancelReply() {
  replyingTo.value = null
}

function findMessageById(id) {
  if (!id) return null
  return chatStore.messages.find(m => m.id === id)
}

function getMessageSnippet(msg) {
  if (!msg) return ''
  if (msg.text) return msg.text.slice(0, 60) + (msg.text.length > 60 ? '...' : '')
  if (msg.media_type === 'image') return '📷 Imagem'
  if (msg.media_type === 'audio') return '🎤 Mensagem de voz'
  return '📎 Arquivo'
}

function scrollToMessage(msgId) {
  nextTick(() => {
    const el = document.getElementById(`msg-${msgId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('highlight-pulse')
      setTimeout(() => {
        el.classList.remove('highlight-pulse')
      }, 1500)
    }
  })
}

// ─── Anexos e Upload de Mídia ────────────────────────────────────────────────
function triggerFileInput() {
  fileInputRef.value?.click()
}

async function onFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  event.target.value = ''

  let mediaType = 'document'
  if (file.type.startsWith('image/')) mediaType = 'image'
  else if (file.type.startsWith('audio/')) mediaType = 'audio'
  else if (file.type.startsWith('video/')) mediaType = 'video'

  const caption = inputMessage.value.trim()
  const replyId = replyingTo.value?.id || null

  inputMessage.value = ''
  replyingTo.value = null

  await chatStore.sendMedia(file, {
    fileName: file.name,
    mediaType,
    caption,
    replyToId: replyId
  })
  scrollToBottom()
}

// ─── Gravação de Áudio ───────────────────────────────────────────────────────
async function startAudioRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }
    mediaRecorder.start()
    isRecordingAudio.value = true
    recordingSeconds.value = 0
    audioTimer = setInterval(() => {
      recordingSeconds.value++
    }, 1000)
  } catch (err) {
    ui.showToast('Permissão de microfone negada ou indisponível.', 'error')
  }
}

function cancelAudioRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  clearInterval(audioTimer)
  isRecordingAudio.value = false
  audioChunks = []
}

async function stopAndSendAudioRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return
  clearInterval(audioTimer)
  
  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: 'audio/webm' })
    const file = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' })
    const replyId = replyingTo.value?.id || null
    replyingTo.value = null
    await chatStore.sendMedia(file, {
      fileName: file.name,
      mediaType: 'audio',
      replyToId: replyId
    })
    scrollToBottom()
  }
  mediaRecorder.stop()
  isRecordingAudio.value = false
}

function formatRecordingTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Lightbox / Visualização de Imagem ───────────────────────────────────────
function isImageUrl(url) {
  if (!url) return false
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url)
}

function openImagePreview(url) {
  if (!url) return
  previewImageUrl.value = url
}

function closeImagePreview() {
  previewImageUrl.value = null
}

// ─── Formatação de Texto e Separadores de Data ──────────────────────────────
function formatMessageBody(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@([A-Za-zÀ-ÿ0-9_\-\.]+)/g, '<span class="mention-tag">@$1</span>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del>$1</del>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br />')
}

function shouldShowDateDivider(messages, index) {
  if (index === 0) return true
  const prevDate = new Date(messages[index - 1].created_at).toDateString()
  const currDate = new Date(messages[index].created_at).toDateString()
  return prevDate !== currDate
}

function formatDateDivider(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === now.toDateString()) return 'Hoje'
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── Estilos de Avatar e Formatação de Data ──────────────────────────────────
function getInitials(name) {
  if (!name) return 'CB'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getAvatarStyle(user) {
  const colors = [
    '#2563eb', '#7c3aed', '#059669', '#ea580c', '#dc2626', '#0891b2', '#4f46e5'
  ]
  let hash = 0
  const str = user?.name || user?.id || 'Brisoft'
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const color = colors[Math.abs(hash) % colors.length]
  return { backgroundColor: color, color: '#ffffff' }
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

function formatMessageTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
</script>

<style scoped>
.internal-chat-layout {
  display: grid;
  grid-template-columns: 290px 1fr;
  height: 100%;
  max-height: 100%;
  width: 100%;
  background: #f8fafc;
  overflow: hidden;
  font-family: inherit;
  box-sizing: border-box;
}

/* ─── FILA LATERAL DE CONVERSAS (Estilo exato da aba de Atendimentos) ────────── */
.internal-sidebar.queue-column {
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
  font-size: 15px;
  transition: all 0.15s ease;
}

.queue-filter-btn:hover {
  background: #ecfdf5;
  color: #059669;
}

/* 2. Trilho de Abas em Cápsula (Todos, Canais, Diretas, Não lidas) */
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
  padding: 0 4px;
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
  color: #059669 !important;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-counter {
  font-size: 10.5px;
  color: #94a3b8;
  font-weight: 500;
}

.queue-status-tab.active .tab-counter {
  color: #059669;
  font-weight: 600;
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
  box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.12);
}

.search-mag-icon {
  font-size: 14px;
  color: #94a3b8;
  display: flex;
  align-items: center;
}

.queue-search-box input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 12.5px;
  color: #1e293b;
  min-width: 0;
}

.clear-input-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-input-btn:hover {
  color: #0f172a;
}

/* 4. Container de Lista de Cards da Fila */
.queue-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.queue-empty-message {
  padding: 32px 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 12.5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-icon-box {
  font-size: 26px;
  color: #cbd5e1;
}

/* ─── Card da Fila (Estilo exato QueueItem.vue) ───────────────────────────── */
.queue-item-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
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

/* Avatar com Indicador Online */
.queue-avatar-wrap {
  position: relative;
  flex-shrink: 0;
  margin-top: 1px;
}

.queue-avatar-circle {
  width: 38px;
  height: 38px;
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

.channel-avatar-circle {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #d1fae5;
  font-size: 17px;
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

.avatar-online-dot.offline {
  background: #cbd5e1;
}

/* Corpo do Card */
.queue-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-type-icon {
  display: inline-flex;
}

.queue-type-icon.group {
  color: #059669;
}

.queue-type-icon.general {
  color: #10b981;
}

.queue-icon-box-sm {
  width: 13px;
  height: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.queue-icon-box-sm i {
  font-size: 12px;
  line-height: 1;
}

.queue-meta-right {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.queue-pin-badge {
  color: #059669;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.queue-mute-badge {
  color: #94a3b8;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  font-weight: 600;
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

/* Candidatos de Nova Conversa Direta */
.search-candidates-group {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.search-candidates-header {
  font-size: 10.5px;
  font-weight: 700;
  color: #94a3b8;
  padding: 6px 10px 4px;
  letter-spacing: 0.5px;
}

.new-candidate-card {
  border: 1px dashed #e2e8f0;
}

.btn-start-chat-tag {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  padding: 2px 6px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

/* ─── PAINEL CENTRAL DO CHAT ────────────────────────────────────────────────── */
.internal-chat-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
  background: #f8fafc;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.chat-main-container {
  display: flex;
  flex-direction: row;
  height: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.chat-conversation-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

/* ─── AVATARES GLOBAIS (CABEÇALHO, DRAWER E MODAIS) ────────────────────────── */
.member-avatar-wrapper {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  width: 38px;
  height: 38px;
}

.member-avatar-wrapper.header-avatar {
  width: 40px;
  height: 40px;
}

.member-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  color: #ffffff;
  overflow: hidden;
  user-select: none;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.header-avatar .member-avatar {
  width: 40px;
  height: 40px;
  font-size: 14px;
}

.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.channel-avatar-wrapper {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.channel-avatar-wrapper.header-avatar {
  width: 40px;
  height: 40px;
}

.channel-avatar-wrapper img,
.channel-custom-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.channel-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #cbd5e1;
  border: 2px solid #ffffff;
}

.member-status-dot.online {
  background: #10b981;
}

.chat-header {
  height: 58px;
  min-height: 58px;
  max-height: 58px;
  padding: 0 20px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  box-sizing: border-box;
}

.chat-header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-channel-icon {
  width: 38px;
  height: 38px;
  font-size: 19px;
  background: #ecfdf5;
  color: #059669;
  border-color: #d1fae5;
}

.chat-title {
  font-size: 14.5px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.chat-subtitle {
  font-size: 11.5px;
  color: #64748b;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-indicator-text {
  color: #64748b;
  font-weight: 500;
  font-size: 12px;
}

.status-indicator-text.online {
  color: #16a34a;
  font-weight: 600;
}

.drawer-user-status {
  font-size: 12px;
  color: #64748b;
  margin-top: 3px;
  margin-bottom: 6px;
  display: block;
}

.drawer-user-status.online {
  color: #16a34a;
  font-weight: 600;
}

.sep-dot {
  color: #cbd5e1;
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.secure-internal-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 4px 10px;
  border-radius: 12px;
}

.header-action-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-action-btn:hover {
  background: #f1f5f9;
  color: #1e293b;
  border-color: #cbd5e1;
}

.header-action-btn.active {
  background: #ecfdf5;
  color: #059669;
  border-color: #a7f3d0;
}

/* Barra Retrátil de Busca Textual */
.conversation-search-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.search-bar-input-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 420px;
}

.search-bar-input-box i {
  position: absolute;
  left: 10px;
  color: #94a3b8;
  font-size: 14px;
}

.conv-search-input {
  width: 100%;
  height: 32px;
  padding: 0 30px 0 32px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 12.5px;
  color: #1e293b;
  outline: none;
  transition: all 0.15s ease;
}

.conv-search-input:focus {
  background: #ffffff;
  border-color: #059669;
  box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.15);
}

.btn-clear-query {
  position: absolute;
  right: 6px;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
}

.search-bar-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-count-label {
  font-size: 12px;
  color: #64748b;
  margin-right: 4px;
  white-space: nowrap;
}

.search-nav-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-nav-btn:hover:not(:disabled) {
  background: #f1f5f9;
  color: #1e293b;
}

.search-nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.search-close-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-close-btn:hover {
  color: #ef4444;
  background: #fee2e2;
}

.search-target-matched .message-bubble-box {
  outline: 2px solid #059669 !important;
  box-shadow: 0 0 12px rgba(5, 150, 105, 0.4) !important;
}

/* ─── MENSAGENS ─────────────────────────────────────────────────────────────── */
.chat-messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: #f0f2f5;
  background-image: url('/chat-wallpaper.svg');
  background-repeat: repeat;
  background-size: 420px 420px;
}

.messages-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #64748b;
  font-size: 13px;
  margin: auto;
}

.empty-chat-state {
  margin: auto;
  text-align: center;
  max-width: 320px;
  color: #64748b;
}

.empty-icon-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #ecfdf5;
  color: #059669;
  font-size: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px auto;
}

.empty-chat-state h4 {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.empty-chat-state p {
  font-size: 12.5px;
  margin: 0;
  line-height: 1.4;
}

.messages-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: min(75%, 720px);
  width: fit-content;
}

.message-mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-other {
  align-self: flex-start;
}

.message-sender-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  overflow: hidden;
  margin-bottom: 2px;
}

.message-sender-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-date-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 16px 0 10px 0;
  width: 100%;
}

.date-badge {
  background: #e2e8f0;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 12px;
  border-radius: 12px;
  text-transform: capitalize;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.message-bubble-wrapper {
  position: relative;
  max-width: 100%;
  min-width: 90px;
}

.message-bubble-box {
  position: relative;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 8px 12px 6px;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  min-width: 90px;
  max-width: 100%;
  box-sizing: border-box;
}

.msg-reply-trigger {
  position: absolute;
  top: 4px;
  right: -28px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #64748b;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.15s ease;
}

.message-row:hover .msg-reply-trigger {
  display: flex;
}

.message-mine .msg-reply-trigger {
  right: auto;
  left: -28px;
}

.msg-reply-trigger:hover {
  background: #ecfdf5;
  color: #059669;
  border-color: #6ee7b7;
  transform: scale(1.1);
}

.message-mine .message-bubble-box {
  background-color: #2b9b73;
  color: #ffffff;
  border-color: #2b9b73;
  border-bottom-right-radius: 2px;
}

.message-other .message-bubble-box {
  border-bottom-left-radius: 2px;
}

.bubble-sender-name {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #059669;
  margin-bottom: 3px;
}

/* Citação / Quote */
.quoted-reply-box {
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.04);
  padding: 4px 8px;
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: pointer;
}

.message-mine .quoted-reply-box {
  background: rgba(255, 255, 255, 0.18);
}

.quoted-bar {
  width: 3px;
  background: #059669;
  border-radius: 2px;
  flex-shrink: 0;
}

.message-mine .quoted-bar {
  background: #ffffff;
}

.quoted-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.quoted-sender {
  font-size: 10.5px;
  font-weight: 700;
  color: #059669;
}

.message-mine .quoted-sender {
  color: #ffffff;
}

.quoted-snippet {
  font-size: 11px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-mine .quoted-snippet {
  color: rgba(255, 255, 255, 0.85);
}

/* Mídias */
.message-media-image {
  margin-bottom: 6px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  max-width: 320px;
}

.message-media-image img {
  width: 100%;
  max-height: 260px;
  object-fit: cover;
  display: block;
  border-radius: 8px;
  transition: transform 0.2s ease;
}

.message-media-image img:hover {
  transform: scale(1.02);
}

.message-media-audio {
  margin: 4px 0 6px 0;
}

.message-media-audio audio {
  width: 240px;
  height: 36px;
}

.doc-attachment-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  margin-bottom: 6px;
  transition: background 0.15s ease;
}

.message-mine .doc-attachment-card {
  background: rgba(255, 255, 255, 0.15);
}

.doc-attachment-card:hover {
  background: rgba(0, 0, 0, 0.08);
}

.message-mine .doc-attachment-card:hover {
  background: rgba(255, 255, 255, 0.25);
}

.doc-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #ecfdf5;
  color: #059669;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.doc-info-box {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.doc-title {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-action {
  font-size: 10px;
  opacity: 0.7;
}

.doc-download-icon {
  font-size: 16px;
  opacity: 0.8;
}

.highlight-pulse {
  animation: pulse-border 1.5s ease-in-out;
}

@keyframes pulse-border {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(5, 150, 105, 0.7); }
  50% { transform: scale(1.02); box-shadow: 0 0 0 8px rgba(5, 150, 105, 0); }
  100% { transform: scale(1); }
}

.message-text-content {
  font-size: 13.5px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  min-width: 0;
}

.message-meta-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.message-timestamp {
  font-size: 10.5px;
  color: #94a3b8;
}

.message-mine .message-timestamp {
  color: rgba(255, 255, 255, 0.8);
}

.message-check-read {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}

.typing-indicator-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
  color: #64748b;
}

.typing-dots {
  display: flex;
  gap: 3px;
}

.typing-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #94a3b8;
  animation: typing-blink 1.4s infinite both;
}

.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-blink {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* ─── FOOTER DO INPUT ───────────────────────────────────────────────────────── */
.chat-input-footer {
  padding: 12px 20px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
  box-sizing: border-box;
}

.chat-input-form {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 4px 8px;
  transition: all 0.15s ease;
}

.chat-input-form:focus-within {
  background: #ffffff;
  border-color: #059669;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
}

.tool-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 18px;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.tool-btn:hover {
  color: #059669;
  background: #ecfdf5;
}

.chat-textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  font-size: 13.5px;
  color: #0f172a;
  max-height: 100px;
  line-height: 1.4;
  padding: 6px 0;
  font-family: inherit;
}

.send-message-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #059669;
  color: #ffffff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.send-message-btn:hover:not(:disabled) {
  background: #047857;
  transform: translateY(-1px);
}

.send-message-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

/* Banner de Resposta Ativa */
.active-reply-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 8px;
}

.reply-banner-bar {
  width: 3px;
  height: 28px;
  background: #059669;
  border-radius: 2px;
  flex-shrink: 0;
}

.reply-banner-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.reply-banner-title {
  font-size: 11px;
  color: #059669;
}

.reply-banner-snippet {
  font-size: 12px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-cancel-reply {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-cancel-reply:hover {
  background: #e2e8f0;
  color: #ef4444;
}

/* Gravação de Áudio */
.audio-recording-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 8px 14px;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rec-pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
  animation: pulse-rec 1s infinite;
}

@keyframes pulse-rec {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.6; }
}

.rec-timer {
  font-size: 13px;
  font-weight: 700;
  color: #b91c1c;
}

.recording-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-cancel-rec {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #64748b;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel-rec:hover {
  background: #f8fafc;
  color: #ef4444;
  border-color: #fca5a5;
}

.btn-send-rec {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  background: #ef4444;
  border: none;
  color: #ffffff;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-send-rec:hover {
  background: #dc2626;
}

.mic-btn:hover {
  color: #ef4444;
  background: #fee2e2;
}

/* Lightbox Modal */
.image-lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.lightbox-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  max-width: 90vw;
  max-height: 90vh;
}

.lightbox-img {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.lightbox-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lightbox-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.lightbox-btn:hover {
  background: rgba(255, 255, 255, 0.35);
  color: #ffffff;
}

.lightbox-btn.close-btn {
  background: rgba(239, 68, 68, 0.8);
  border-color: transparent;
}

.lightbox-btn.close-btn:hover {
  background: #dc2626;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ─── ESTADO VAZIO (NENHUMA CONVERSA ATIVA) ──────────────────────────────────── */
.no-active-chat-state {
  margin: auto;
  text-align: center;
  max-width: 380px;
  padding: 30px;
}

.no-chat-illustration {
  margin-bottom: 16px;
}

.illustration-bubble {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: #ecfdf5;
  color: #059669;
  font-size: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  box-shadow: 0 8px 16px -4px rgba(5, 150, 105, 0.15);
}

.no-chat-title {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px 0;
}

.no-chat-desc {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  margin: 0 0 20px 0;
}

.btn-start-general {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #059669;
  color: #ffffff;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-start-general:hover {
  background: #047857;
  transform: translateY(-1px);
}

/* ─── PAINEL LATERAL DE DETALHES DA CONVERSA (DRAWER) ───────────────────────── */
.conversation-details-drawer {
  width: 310px;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
  animation: slideDrawer 0.2s ease-out;
}

@keyframes slideDrawer {
  from { width: 0; opacity: 0; }
  to { width: 310px; opacity: 1; }
}

.drawer-header {
  height: 58px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.drawer-title {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.drawer-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.drawer-close-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.drawer-profile-card {
  padding: 20px 16px;
  text-align: center;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
}

.drawer-big-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  margin: 0 auto 10px auto;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.drawer-big-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.drawer-big-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #ecfdf5;
  color: #059669;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 10px auto;
  border: 1px solid #d1fae5;
}

.drawer-conv-name {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.drawer-conv-type-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  background: #e2e8f0;
  padding: 2px 8px;
  border-radius: 12px;
}

.drawer-tabs {
  display: flex;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}

.drawer-tab {
  flex: 1;
  padding: 10px 4px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.drawer-tab:hover {
  color: #1e293b;
}

.drawer-tab.active {
  color: #059669;
  border-bottom-color: #059669;
  font-weight: 700;
}

.drawer-badge-count {
  font-size: 10px;
  background: #f1f5f9;
  color: #475569;
  padding: 1px 5px;
  border-radius: 8px;
}

.drawer-tab.active .drawer-badge-count {
  background: #ecfdf5;
  color: #059669;
}

.drawer-tab-pane {
  padding: 14px 12px;
  flex: 1;
}

.drawer-loading {
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  padding: 24px 0;
}

.drawer-members-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-member-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.drawer-member-card:hover {
  background: #f8fafc;
}

.drawer-small-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  overflow: hidden;
  font-size: 11.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.drawer-small-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.drawer-member-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.drawer-member-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drawer-member-sub {
  font-size: 11px;
  color: #94a3b8;
}

.btn-quick-direct {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-quick-direct:hover {
  background: #ecfdf5;
  color: #059669;
  border-color: #a7f3d0;
}

.drawer-empty-media {
  text-align: center;
  padding: 30px 10px;
  color: #94a3b8;
}

.drawer-empty-media i {
  font-size: 32px;
  margin-bottom: 6px;
  display: inline-block;
}

.drawer-empty-media p {
  font-size: 12px;
  margin: 0;
  line-height: 1.4;
}

.drawer-media-section {
  margin-bottom: 16px;
}

.drawer-section-heading {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.drawer-images-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.drawer-image-thumb {
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.drawer-image-thumb:hover {
  transform: scale(1.03);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.drawer-image-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.drawer-docs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drawer-doc-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  text-decoration: none;
  color: #1e293b;
  transition: all 0.15s ease;
}

.drawer-doc-item:hover {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.drawer-doc-icon {
  font-size: 20px;
  color: #059669;
  flex-shrink: 0;
}

.drawer-doc-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.drawer-doc-name {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drawer-doc-date {
  font-size: 10.5px;
  color: #94a3b8;
}

.btn-edit-group-drawer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-edit-group-drawer:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #94a3b8;
}

.drawer-members-header-action {
  padding: 8px 12px 4px 12px;
}

.btn-manage-members-pill {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  color: #059669;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-manage-members-pill:hover {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

/* ─── MODAL DE NOVO CANAL ────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.channel-modal-card {
  background: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.channel-modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.channel-modal-title {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px 0;
}

.channel-modal-subtitle {
  font-size: 12.5px;
  color: #64748b;
  margin: 0;
}

.btn-modal-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 20px;
  cursor: pointer;
  padding: 2px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.btn-modal-close:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.channel-modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.channel-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.channel-form-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
}

.mb-0 {
  margin-bottom: 0;
}

.channel-name-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.hashtag-prefix {
  position: absolute;
  left: 12px;
  color: #64748b;
  font-weight: 700;
  font-size: 15px;
}

.channel-input {
  width: 100%;
  height: 38px;
  padding: 0 12px 0 28px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13.5px;
  color: #1e293b;
  outline: none;
  transition: all 0.15s ease;
}

.channel-input:focus {
  background: #ffffff;
  border-color: #059669;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
}

.channel-input-hint {
  font-size: 11px;
  color: #94a3b8;
}

.channel-type-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.type-option-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  background: #f8fafc;
  transition: all 0.15s ease;
}

.type-option-card:hover {
  background: #ffffff;
  border-color: #cbd5e1;
}

.type-option-card.selected {
  background: #ecfdf5;
  border-color: #059669;
}

.type-icon-box {
  font-size: 18px;
  color: #64748b;
  margin-top: 1px;
}

.type-option-card.selected .type-icon-box {
  color: #059669;
}

.type-text-box {
  display: flex;
  flex-direction: column;
}

.type-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #1e293b;
}

.type-desc {
  font-size: 10.5px;
  color: #64748b;
  line-height: 1.3;
  margin-top: 2px;
}

.member-select-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.selected-counter {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
}

.channel-member-picker {
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.picker-member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.picker-member-row:hover {
  background: #f1f5f9;
}

.picker-member-row.selected {
  background: #ecfdf5;
}

.member-checkbox {
  cursor: pointer;
}

.picker-member-info {
  display: flex;
  flex-direction: column;
}

.picker-name {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
}

.picker-role {
  font-size: 10.5px;
  color: #94a3b8;
}

.channel-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}

.btn-modal-cancel {
  padding: 9px 16px;
  background: #f1f5f9;
  border: none;
  border-radius: 8px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-modal-cancel:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.btn-modal-submit {
  padding: 9px 20px;
  background: #059669;
  border: none;
  border-radius: 8px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-modal-submit:hover:not(:disabled) {
  background: #047857;
}

.btn-modal-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Abas do Modal e Seleção Direta */
.modal-tabs-header {
  display: flex;
  border-bottom: 1px solid #f1f5f9;
  background: #f8fafc;
}

.modal-tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
}

.modal-tab-btn:hover {
  color: #1e293b;
  background: rgba(0, 0, 0, 0.02);
}

.modal-tab-btn.active {
  color: #059669;
  background: #ffffff;
  border-bottom-color: #059669;
}

.modal-search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.modal-search-wrapper i {
  position: absolute;
  left: 12px;
  color: #94a3b8;
  font-size: 16px;
}

.modal-search-input {
  width: 100%;
  height: 38px;
  padding: 0 12px 0 36px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13px;
  color: #1e293b;
  outline: none;
  transition: all 0.15s ease;
}

.modal-search-input:focus {
  background: #ffffff;
  border-color: #059669;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
}

.modal-members-picker-list {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-direct-member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
  background: #ffffff;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.modal-direct-member-row:hover {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.modal-member-details {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.modal-member-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.modal-member-role {
  font-size: 11px;
  color: #64748b;
}

.modal-start-icon {
  font-size: 18px;
  color: #94a3b8;
  transition: color 0.15s ease;
}

.modal-direct-member-row:hover .modal-start-icon {
  color: #059669;
}

.channel-input-plain {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13.5px;
  color: #1e293b;
  outline: none;
  transition: all 0.15s ease;
}

.channel-input-plain:focus {
  background: #ffffff;
  border-color: #059669;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
}

.group-photo-preview-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.group-avatar-preview-box {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #cbd5e1;
  flex-shrink: 0;
}

.group-avatar-preview-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.self-tag {
  font-size: 10.5px;
  color: #059669;
  font-weight: normal;
  margin-left: 4px;
}

.group-danger-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
  margin-top: 4px;
}

.btn-leave-group {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #fed7aa;
  color: #ea580c;
  background: #fff7ed;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-leave-group:hover:not(:disabled) {
  background: #ffedd5;
  border-color: #fdba74;
}

.btn-delete-group {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #fecaca;
  color: #dc2626;
  background: #fef2f2;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-delete-group:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #fca5a5;
}

/* ─── FASE 4: MENSAGENS FIXADAS, REAÇÕES, EDIÇÃO E MENÇÕES ───────────────── */
/* Banner de mensagem fixada no topo do chat */
.pinned-message-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f0fdf4;
  border-bottom: 1px solid #bbf7d0;
  padding: 8px 16px;
  z-index: 10;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.pinned-banner-content {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.pinned-banner-content .pin-icon {
  font-size: 16px;
  color: #16a34a;
  flex-shrink: 0;
}

.pinned-text-box {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pinned-label {
  font-size: 10.5px;
  font-weight: 700;
  color: #15803d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.pinned-snippet {
  font-size: 12px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-unpin-banner {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-unpin-banner:hover {
  background: #dcfce7;
  color: #15803d;
}

/* Barra de Ações Rápidas na Mensagem */
.msg-actions-bar {
  position: absolute;
  top: -14px;
  right: 12px;
  display: none;
  align-items: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 2px 4px;
  z-index: 20;
  gap: 2px;
}

.message-mine .msg-actions-bar {
  right: auto;
  left: 12px;
}

.message-row:hover .msg-actions-bar,
.msg-actions-bar:has(.reactions-quick-popover),
.msg-actions-bar:has(.msg-dropdown-menu) {
  display: flex;
}

.msg-action-item {
  position: relative;
  display: flex;
  align-items: center;
}

.msg-action-trigger {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.msg-action-trigger:hover {
  background: #f1f5f9;
  color: #059669;
  transform: scale(1.1);
}

/* Popover Rápido de Emojis */
.reactions-quick-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  padding: 3px 6px;
  z-index: 30;
}

.quick-emoji-btn {
  background: none;
  border: none;
  font-size: 17px;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 6px;
  line-height: 1;
  transition: transform 0.15s ease, background 0.15s ease;
}

.quick-emoji-btn:hover {
  transform: scale(1.35);
  background: #f8fafc;
}

/* Dropdown Menu de Mais Ações */
.msg-dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 165px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  padding: 4px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.message-mine .msg-dropdown-menu {
  right: auto;
  left: 0;
}

.msg-dropdown-menu .dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  font-size: 12px;
  color: #334155;
  background: none;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.msg-dropdown-menu .dropdown-item:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.msg-dropdown-menu .dropdown-item.text-danger {
  color: #ef4444;
}

.msg-dropdown-menu .dropdown-item.text-danger:hover {
  background: #fef2f2;
  color: #dc2626;
}

.msg-dropdown-menu .dropdown-item i {
  font-size: 14px;
}

/* Tag de Mensagem Fixada no Balão */
.msg-pinned-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #16a34a;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 2px 6px;
  border-radius: 4px;
  margin-bottom: 5px;
}

.message-mine .msg-pinned-tag {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.35);
  color: #ffffff;
}

/* Mensagem Apagada */
.deleted-msg-content {
  font-size: 12px;
  font-style: italic;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 5px;
}

.message-mine .deleted-msg-content {
  color: rgba(255, 255, 255, 0.7);
}

.is-deleted-bubble {
  opacity: 0.85;
}

/* Badge de Editada */
.msg-edited-badge {
  font-size: 9.5px;
  opacity: 0.75;
  margin-right: 4px;
  font-style: italic;
}

/* Pílulas de Reações Agregadas */
.message-reactions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.reaction-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 12px;
  font-size: 11px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.reaction-pill:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.reaction-pill.user-reacted {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #047857;
  font-weight: 600;
}

.reaction-emoji {
  font-size: 12px;
  line-height: 1;
}

.reaction-count {
  font-size: 10.5px;
}

/* Banner de Edição Ativa no Footer */
.active-editing-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fefce8;
  border-top: 1px solid #fef08a;
  padding: 8px 16px;
  position: relative;
}

.editing-banner-bar {
  width: 3px;
  height: 28px;
  background: #ca8a04;
  border-radius: 2px;
  flex-shrink: 0;
}

.editing-banner-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.editing-banner-title {
  font-size: 11px;
  font-weight: 700;
  color: #854d0e;
  display: flex;
  align-items: center;
  gap: 4px;
}

.editing-banner-snippet {
  font-size: 11.5px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-cancel-edit {
  background: none;
  border: none;
  color: #854d0e;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-cancel-edit:hover {
  background: #fef08a;
}

/* Popover Flutuante de Menções (@mentions) */
.mention-suggestions-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 16px;
  width: 260px;
  max-height: 220px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14);
  z-index: 50;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.mention-suggestions-header {
  font-size: 10.5px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
}

.mention-item-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
  width: 100%;
}

.mention-item-btn:hover {
  background: #ecfdf5;
}

.mention-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mention-name {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
}

.mention-role {
  font-size: 10.5px;
  color: #94a3b8;
}

/* Tag de Menção no Corpo da Mensagem */
:deep(.mention-tag) {
  display: inline-block;
  color: #059669;
  font-weight: 600;
  background: rgba(5, 150, 105, 0.08);
  padding: 0 4px;
  border-radius: 4px;
}

.message-mine :deep(.mention-tag) {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.25);
  text-decoration: underline;
}

/* Aba "Fixadas" no Drawer Lateral de Detalhes */
.drawer-pinned-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.drawer-pinned-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.drawer-pinned-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.drawer-pinned-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.pmsg-author {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
}

.pmsg-date {
  font-size: 10.5px;
  color: #94a3b8;
}

.drawer-pinned-card-text {
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
  margin: 0 0 8px 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.btn-unpin-card {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #ef4444;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.15s ease;
}

.btn-unpin-card:hover {
  opacity: 0.8;
  text-decoration: underline;
}

/* ─── RESPONSIVIDADE ────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .internal-chat-layout {
    grid-template-columns: 1fr;
  }
  .conversation-details-drawer {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 20;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  }
}
/* ─── Menu de Contexto Flutuante (Desktop e Mobile) ────────────────────────── */
.chat-context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(0, 0, 0, 0.08);
}

.chat-context-menu {
  position: fixed;
  width: 230px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
  padding: 6px;
  display: flex;
  flex-direction: column;
  animation: contextMenuPop 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

@keyframes contextMenuPop {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.context-menu-header {
  padding: 8px 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.context-menu-title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-menu-sub {
  font-size: 11px;
  color: #64748b;
}

.context-menu-divider {
  height: 1px;
  background-color: #f1f5f9;
  margin: 4px 6px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
}

.context-menu-item i {
  font-size: 16px;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
}

.context-menu-item:hover {
  background: #ecfdf5;
  color: #065f46;
}

.context-menu-item:hover i {
  color: #059669;
}

.context-menu-item.text-danger {
  color: #dc2626;
}

.context-menu-item.text-danger i {
  color: #ef4444;
}

.context-menu-item.text-danger:hover {
  background: #fef2f2;
  color: #b91c1c;
}

@media (max-width: 640px) {
  .chat-context-menu {
    top: auto !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.2);
    padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    animation: contextMenuSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes contextMenuSlideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .context-menu-item {
    padding: 12px 10px;
    font-size: 14px;
  }
}

/* ─── Cabeçalho e Chamadas ─────────────────────────────────────────────────── */
.clickable-header-info {
  cursor: pointer;
  padding: 4px 8px;
  margin: -4px -8px;
  border-radius: 8px;
  transition: background-color 0.15s ease;
}

.clickable-header-info:hover {
  background-color: #f1f5f9;
}

.header-action-btn.disabled-feature {
  opacity: 0.55;
  cursor: not-allowed;
}

.header-action-btn.disabled-feature:hover {
  background: transparent;
  color: #64748b;
  transform: none;
}

/* ─── Mensagens de Sistema (Avisos nos Canais) ─────────────────────────────── */
.system-message-row {
  display: flex;
  justify-content: center;
  margin: 6px 0;
  width: 100%;
}

.system-message-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background-color: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 11.5px;
  font-weight: 500;
  padding: 4px 14px;
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  text-align: center;
  max-width: 90%;
  word-break: break-word;
}

.system-message-pill i {
  color: #059669;
  font-size: 13px;
  flex-shrink: 0;
}

/* ─── Upload de Imagem de Canais ───────────────────────────────────────────── */
.channel-upload-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 6px;
}

.channel-upload-preview {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: #f1f5f9;
  border: 2px dashed #cbd5e1;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 22px;
  flex-shrink: 0;
  overflow: hidden;
}

.channel-upload-btns {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.btn-choose-photo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background-color: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-choose-photo:hover {
  background-color: #d1fae5;
}

.btn-remove-photo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  background-color: #fff1f2;
  color: #e11d48;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-remove-photo:hover {
  background-color: #ffe4e6;
}

/* ─── Detalhes do Usuário e Canal no Drawer ────────────────────────────────── */
.drawer-contact-details-box {
  width: 100%;
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
}

.drawer-detail-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12px;
}

.drawer-detail-item i {
  font-size: 15px;
  color: #059669;
  margin-top: 2px;
  flex-shrink: 0;
}

.detail-texts {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.detail-texts label {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0;
}

.detail-texts span {
  font-size: 12.5px;
  color: #1e293b;
  font-weight: 500;
  word-break: break-all;
}

.detail-texts .text-online {
  color: #059669;
  font-weight: 600;
}

.drawer-channel-actions-box {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.drawer-role-callout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
}

.drawer-role-callout.owner {
  background-color: #fefce8;
  color: #854d0e;
  border: 1px solid #fef08a;
}

.drawer-role-callout.owner i {
  color: #eab308;
}

.drawer-role-callout.sub {
  background-color: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.drawer-role-callout.sub i {
  color: #3b82f6;
}

.drawer-channel-buttons-row {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.btn-leave-channel-drawer {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  background-color: #fff1f2;
  color: #e11d48;
  border: 1px solid #fecdd3;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-leave-channel-drawer:hover {
  background-color: #ffe4e6;
}

.member-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.role-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.role-pill.owner {
  background: #fef9c3;
  color: #854d0e;
}

.role-pill.owner i {
  color: #ca8a04;
}

.role-pill.sub {
  background: #dbeafe;
  color: #1e40af;
}

.role-pill.sub i {
  color: #2563eb;
}

.drawer-member-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.btn-member-action-sub,
.btn-member-action-remove {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-member-action-sub:hover,
.btn-member-action-sub.active {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #2563eb;
}

.btn-member-action-remove:hover {
  background: #fff1f2;
  border-color: #fecdd3;
  color: #e11d48;
}
</style>
