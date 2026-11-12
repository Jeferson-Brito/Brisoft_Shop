<template>
  <Teleport to="body">
    <!-- Backdrop sutil para fechar ao clicar fora -->
    <Transition name="fade-backdrop">
      <div v-if="notepad.isOpen" class="notepad-backdrop" @click="notepad.close"></div>
    </Transition>

    <!-- Drawer com animação deslizante de entrada e saída -->
    <Transition name="notepad-slide">
      <div v-if="notepad.isOpen" class="notepad-drawer-container">
        <div class="notepad-window">
        <!-- Windows 11 Notepad Top Header Bar -->
        <div class="notepad-header">
          <div class="notepad-title-group">
            <div class="notepad-app-icon">
              <i class="fa-regular fa-note-sticky"></i>
            </div>
            <span class="notepad-title">Notas</span>
          </div>

          <div class="notepad-header-actions">
            <!-- Interruptor de Salvamento Automático -->
            <label class="autosave-switch" title="Salvar automaticamente alterações no servidor">
              <input type="checkbox" :checked="notepad.autoSave" @change="notepad.toggleAutoSave" />
              <span class="slider"></span>
              <span class="autosave-label">Salvar auto</span>
            </label>

            <button
              type="button"
              class="header-btn"
              :class="{ active: notepad.isHistoryOpen }"
              @click="toggleHistory"
              title="Anotações salvas no servidor"
            >
              <i class="fa-solid fa-folder-open"></i>
              <span>Notas Salvas</span>
              <span v-if="notepad.savedNotes.length > 0" class="header-count-badge">
                {{ notepad.savedNotes.length }}
              </span>
            </button>

            <button
              type="button"
              class="header-btn primary"
              :disabled="notepad.isSaving"
              @click="handleSave"
              title="Salvar nota atual na nuvem"
            >
              <i v-if="notepad.isSaving" class="fa-solid fa-spinner fa-spin"></i>
              <i v-else class="fa-regular fa-floppy-disk"></i>
              <span>{{ notepad.isSaving ? 'Salvando...' : 'Salvar' }}</span>
            </button>

            <button
              type="button"
              class="header-close-btn"
              @click="notepad.close"
              title="Fechar Notas"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

      <!-- Abas estilo Windows 11 -->
      <div class="notepad-tabs-bar">
        <div class="notepad-tabs-scroll">
          <div
            v-for="tab in notepad.tabs"
            :key="tab.id"
            class="notepad-tab"
            :class="{ active: tab.id === notepad.activeTabId }"
            @click="notepad.selectTab(tab.id)"
          >
            <i class="fa-regular fa-file-lines tab-file-icon"></i>
            <span class="tab-title" :title="tab.title">
              {{ tab.title || 'Sem título' }}
            </span>
            <span v-if="tab.isDirty" class="tab-dirty-indicator" title="Alterações não salvas"></span>
            <button
              type="button"
              class="tab-close-btn"
              @click.stop="notepad.closeTab(tab.id)"
              title="Fechar aba"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Botão de Nova Aba '+' -->
        <button
          type="button"
          class="new-tab-btn"
          @click="notepad.addTab()"
          title="Nova aba (Ctrl+N)"
        >
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>

      <!-- Área de Edição Principal -->
      <div v-if="!notepad.isHistoryOpen" class="notepad-editor-area">
        <div class="notepad-meta-row">
          <input
            v-if="notepad.activeTab"
            v-model="notepad.activeTab.title"
            type="text"
            class="note-title-input"
            placeholder="Título da anotação..."
            @input="notepad.markCurrentDirty"
          />
          <div class="note-sync-badge" :class="{ dirty: notepad.activeTab?.isDirty, saved: !notepad.activeTab?.isDirty && notepad.activeTab?.savedId }">
            <i v-if="notepad.activeTab?.savedId && !notepad.activeTab?.isDirty" class="fa-solid fa-check"></i>
            <i v-else-if="notepad.activeTab?.isDirty" class="fa-regular fa-clock"></i>
            <span>{{ getSyncLabel() }}</span>
          </div>
        </div>

        <textarea
          v-if="notepad.activeTab"
          ref="textareaRef"
          v-model="notepad.activeTab.content"
          class="notepad-textarea"
          placeholder="Digite suas anotações aqui..."
          spellcheck="false"
          @input="handleTextInput"
          @click="updateCursorPos"
          @keyup="updateCursorPos"
        ></textarea>
        <div v-else class="empty-state">
          Nenhuma aba aberta. Clique no botão "+" acima para criar uma.
        </div>
      </div>

      <!-- Visualizador / Histórico de Notas Salvas -->
      <div v-else class="notepad-history-panel">
        <div class="history-header">
          <div class="history-title-row">
            <h4><i class="fa-solid fa-folder-open"></i> Histórico de Anotações</h4>
            <button type="button" class="history-back-btn" @click="notepad.isHistoryOpen = false">
              <i class="fa-solid fa-arrow-left"></i> Voltar ao editor
            </button>
          </div>

          <!-- Filtro de Atendentes para Administrador -->
          <div v-if="auth.isAdmin" class="admin-user-filter">
            <label><i class="fa-solid fa-filter"></i> Filtrar por usuário:</label>
            <select v-model="notepad.filterUserId" @change="onUserFilterChange">
              <option value="">Todos os usuários</option>
              <option v-for="u in usersList" :key="u.id" :value="u.id">
                {{ u.name || u.email }} ({{ u.role === 'admin' ? 'Admin' : 'Atendente' }})
              </option>
            </select>
          </div>

          <!-- Campo de Busca -->
          <div class="history-search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Pesquisar por título ou conteúdo..."
            />
            <button v-if="searchQuery" type="button" class="clear-search-btn" @click="searchQuery = ''">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Lista de Notas -->
        <div class="history-list-wrapper">
          <div v-if="notepad.historyLoading" class="history-loading">
            <i class="fa-solid fa-spinner fa-spin"></i> Carregando anotações...
          </div>

          <div v-else-if="filteredNotes.length === 0" class="history-empty">
            <i class="fa-regular fa-clipboard"></i>
            <p>Nenhuma anotação salva encontrada.</p>
            <small>Salve sua primeira anotação clicando no botão "Salvar" do editor.</small>
          </div>

          <div v-else class="history-grid">
            <div
              v-for="note in filteredNotes"
              :key="note.id"
              class="history-card"
              @click="notepad.openSavedNoteInTab(note)"
            >
              <div class="card-top">
                <h5 class="card-title" :title="note.title">{{ note.title || 'Sem título' }}</h5>
                <button
                  type="button"
                  class="card-delete-btn"
                  title="Excluir anotação"
                  @click.stop="confirmDelete(note)"
                >
                  <i class="fa-regular fa-trash-can"></i>
                </button>
              </div>

              <p class="card-preview">
                {{ note.content ? note.content.slice(0, 160) + (note.content.length > 160 ? '...' : '') : '(Sem conteúdo)' }}
              </p>

              <div class="card-footer">
                <span class="card-author" v-if="auth.isAdmin && note.user_name">
                  <i class="fa-regular fa-user"></i> {{ note.user_name }}
                </span>
                <span class="card-date">
                  <i class="fa-regular fa-clock"></i> {{ formatDate(note.updated_at || note.created_at) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Windows 11 Notepad Status Bar -->
      <div class="notepad-statusbar">
        <div class="status-left">
          <span>Lin {{ cursorLine }}, Col {{ cursorCol }}</span>
          <span class="status-sep">|</span>
          <span>{{ totalChars }} caracteres</span>
          <span class="status-sep">|</span>
          <span>{{ totalWords }} palavras</span>
        </div>
        <div class="status-right">
          <span>UTF-8</span>
          <span class="status-sep">|</span>
          <span>Windows (CRLF)</span>
        </div>
      </div>
    </div>
  </div>
  </Transition>
</Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useNotepadStore } from '@/stores/notepad.store'
import { useAuthStore } from '@/stores/auth.store'
import { usersApi } from '@/api/users.api'

const notepad = useNotepadStore()
const auth = useAuthStore()

const textareaRef = ref(null)
const cursorLine = ref(1)
const cursorCol = ref(1)
const searchQuery = ref('')
const usersList = ref([])

function handleGlobalKeydown(e) {
  if (e.key === 'Escape' && notepad.isOpen) {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    notepad.close()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeydown, true)
  if (auth.isAdmin) {
    try {
      const res = await usersApi.list()
      if (res.data?.success) {
        usersList.value = res.data.users || []
      }
    } catch (err) {
      console.warn('Erro ao carregar lista de usuários para filtro do bloco de notas:', err)
    }
  }
  // Carrega histórico
  notepad.fetchNotes()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, true)
})

function handleTextInput() {
  notepad.markCurrentDirty()
  updateCursorPos()
}

function updateCursorPos() {
  const el = textareaRef.value
  if (!el) {
    cursorLine.value = 1
    cursorCol.value = 1
    return
  }
  const text = el.value.substring(0, el.selectionStart)
  const lines = text.split('\n')
  cursorLine.value = lines.length
  cursorCol.value = lines[lines.length - 1].length + 1
}

const totalChars = computed(() => {
  return notepad.activeTab?.content?.length || 0
})

const totalWords = computed(() => {
  const text = notepad.activeTab?.content || ''
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
})

function getSyncLabel() {
  const tab = notepad.activeTab
  if (!tab) return ''
  if (tab.isDirty) return 'Alterações não salvas'
  if (tab.savedId) return 'Salvo na nuvem'
  return 'Rascunho local'
}

async function handleSave() {
  const res = await notepad.saveCurrentNote()
  if (!res.success) {
    alert(res.error || 'Não foi possível salvar a anotação.')
  }
}

function toggleHistory() {
  notepad.isHistoryOpen = !notepad.isHistoryOpen
  if (notepad.isHistoryOpen) {
    notepad.fetchNotes()
  }
}

function onUserFilterChange() {
  notepad.fetchNotes()
}

const filteredNotes = computed(() => {
  let list = notepad.savedNotes || []
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(n =>
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.content && n.content.toLowerCase().includes(q)) ||
      (n.user_name && n.user_name.toLowerCase().includes(q))
    )
  }
  return list
})

async function confirmDelete(note) {
  if (confirm(`Deseja realmente excluir a anotação "${note.title || 'Sem título'}"?`)) {
    await notepad.deleteNote(note.id)
  }
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    return isoStr
  }
}
</script>

<style scoped>
.notepad-drawer-container {
  position: fixed;
  top: 0;
  right: 46px; /* Encostado exatamente no Sidebar de Ferramentas (46px) */
  bottom: 0;
  width: 520px;
  max-width: calc(100vw - 60px);
  height: 100vh;
  z-index: 3000; /* Fica acima da topbar (2500) para exibir o cabeçalho completo sem cortar */
  display: flex;
  flex-direction: column;
  box-shadow: -6px 0 28px rgba(0, 0, 0, 0.16);
}

/* Transições suaves de Entrada e Saída do Drawer */
.notepad-slide-enter-active,
.notepad-slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease;
}

.notepad-slide-enter-from,
.notepad-slide-leave-to {
  transform: translateX(100%);
  opacity: 0.85;
}

/* Backdrop transparente para fechar ao clicar fora sem borrar nem escurecer a tela */
.notepad-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 46px; /* Não cobre o sidebar de ferramentas para manter os botões interativos */
  bottom: 0;
  background: transparent;
  backdrop-filter: none;
  z-index: 2990;
  cursor: default;
}

.fade-backdrop-enter-active,
.fade-backdrop-leave-active {
  transition: opacity 0.22s ease;
}

.fade-backdrop-enter-from,
.fade-backdrop-leave-to {
  opacity: 0;
}

/* Switch estilo toggle para Salvamento Automático */
.autosave-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  font-size: 11.5px;
  color: #475569;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.autosave-switch:hover {
  background: #f1f5f9;
}

.autosave-switch input {
  display: none;
}

.autosave-switch .slider {
  position: relative;
  width: 28px;
  height: 16px;
  background-color: #cbd5e1;
  border-radius: 999px;
  transition: background-color 0.2s ease;
}

.autosave-switch .slider::before {
  content: "";
  position: absolute;
  height: 12px;
  width: 12px;
  left: 2px;
  bottom: 2px;
  background-color: #ffffff;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.autosave-switch input:checked + .slider {
  background-color: #059669;
}

.autosave-switch input:checked + .slider::before {
  transform: translateX(12px);
}

.autosave-label {
  font-size: 11px;
  color: #64748b;
}

.notepad-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  overflow: hidden;
  user-select: text;
}

/* Header superior estilo Windows 11 */
.notepad-header {
  height: 48px;
  min-height: 48px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
}

.notepad-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notepad-app-icon {
  width: 26px;
  height: 26px;
  background: #059669;
  color: #ffffff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  box-shadow: 0 1px 3px rgba(5, 150, 105, 0.3);
}

.notepad-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.notepad-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-btn {
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.header-btn.primary {
  background: #059669;
  border-color: #059669;
  color: #ffffff;
}

.header-btn.primary:hover {
  background: #047857;
  border-color: #047857;
}

.header-btn.active {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #065f46;
}

.header-count-badge {
  background: #e2e8f0;
  color: #475569;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 999px;
}

.header-close-btn {
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
  transition: all 0.15s ease;
}

.header-close-btn:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* Abas estilo Windows 11 */
.notepad-tabs-bar {
  background: #f1f5f9;
  border-bottom: 1px solid #cbd5e1;
  display: flex;
  align-items: center;
  padding: 4px 6px 0 6px;
  gap: 4px;
}

.notepad-tabs-scroll {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.notepad-tabs-scroll::-webkit-scrollbar {
  display: none;
}

.notepad-tab {
  height: 32px;
  min-width: 110px;
  max-width: 170px;
  background: #e2e8f0;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  position: relative;
}

.notepad-tab:hover {
  background: #e9eff5;
}

.notepad-tab.active {
  background: #ffffff;
  border-color: #cbd5e1;
  color: #0f172a;
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.04);
}

.tab-file-icon {
  font-size: 12px;
  color: #64748b;
  flex-shrink: 0;
}

.tab-title {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-dirty-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #059669;
  flex-shrink: 0;
}

.tab-close-btn {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s ease;
}

.tab-close-btn:hover {
  background: #cbd5e1;
  color: #0f172a;
}

.new-tab-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: all 0.15s ease;
}

.new-tab-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

/* Área de Edição */
.notepad-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.notepad-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 6px 16px;
  gap: 10px;
  border-bottom: 1px solid #f1f5f9;
}

.note-title-input {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  border: none;
  outline: none;
  background: transparent;
  padding: 2px 0;
}

.note-title-input::placeholder {
  color: #94a3b8;
  font-weight: 400;
}

.note-sync-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #64748b;
  background: #f8fafc;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

.note-sync-badge.saved {
  color: #16a34a;
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.note-sync-badge.dirty {
  color: #f59e0b;
  border-color: #fde68a;
  background: #fffbeb;
}

.notepad-textarea {
  flex: 1;
  width: 100%;
  border: none;
  outline: none;
  padding: 14px 16px;
  font-family: 'Consolas', 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 13.5px;
  line-height: 1.55;
  color: #1e293b;
  resize: none;
  background: #ffffff;
  box-sizing: border-box;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  font-size: 13px;
  padding: 20px;
  text-align: center;
}

/* Painel de Histórico */
.notepad-history-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f8fafc;
}

.history-header {
  padding: 12px 16px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-title-row h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-back-btn {
  background: transparent;
  border: none;
  color: #059669;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}

.history-back-btn:hover {
  text-decoration: underline;
}

.admin-user-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f1f5f9;
  padding: 6px 10px;
  border-radius: 6px;
}

.admin-user-filter label {
  font-size: 11.5px;
  color: #475569;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 5px;
}

.admin-user-filter select {
  flex: 1;
  font-size: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 3px 6px;
  background: #ffffff;
  color: #1e293b;
  outline: none;
}

.history-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 10px;
}

.history-search-box i {
  color: #94a3b8;
  font-size: 12px;
}

.history-search-box input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 12.5px;
  color: #1e293b;
}

.clear-search-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

.history-list-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.history-loading,
.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #94a3b8;
  text-align: center;
  gap: 8px;
}

.history-empty i {
  font-size: 32px;
  color: #cbd5e1;
}

.history-empty p {
  margin: 0;
  font-size: 13.5px;
  font-weight: 500;
  color: #475569;
}

.history-empty small {
  font-size: 11.5px;
}

.history-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.history-card:hover {
  border-color: #a7f3d0;
  transform: translateY(-1px);
  box-shadow: 0 3px 6px rgba(5, 150, 105, 0.08);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-delete-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.12s ease;
}

.card-delete-btn:hover {
  background: #fee2e2;
  color: #ef4444;
}

.card-preview {
  margin: 0 0 10px 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
  border-top: 1px dashed #f1f5f9;
  padding-top: 6px;
}

.card-author {
  font-weight: 500;
  color: #475569;
}

/* Barra de Status estilo Windows 11 */
.notepad-statusbar {
  height: 26px;
  min-height: 26px;
  background: #f1f5f9;
  border-top: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  font-size: 11px;
  color: #64748b;
  user-select: none;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-sep {
  color: #cbd5e1;
}

@media (max-width: 768px) {
  .notepad-drawer-container {
    right: 0;
    width: 100vw;
    max-width: 100vw;
  }
}
</style>
