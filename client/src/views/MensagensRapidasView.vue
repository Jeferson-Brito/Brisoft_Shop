<template>
  <div class="qm-page">
    <section class="qm-toolbar">
      <div class="search-input-wrap qm-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input v-model="searchTerm" type="text" placeholder="Buscar por título, conteúdo ou atalho..." />
        <button v-if="searchTerm" type="button" class="qm-clear-search" title="Limpar busca" @click="searchTerm = ''">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="qm-toolbar-actions">
        <!-- Botão de Filtros com Popover Suspenso -->
        <div class="qm-filter-dropdown-wrapper" ref="qmFilterDropdownRef">
          <button
            type="button"
            class="qm-filter-btn"
            :class="{ active: showFilterPopover || hasActiveCustomFilters }"
            title="Filtros e ordenação"
            @click="showFilterPopover = !showFilterPopover"
          >
            <i class="fa-solid fa-sliders"></i>
            <span>Filtros</span>
            <span v-if="hasActiveCustomFilters" class="qm-filter-dot"></span>
          </button>

          <!-- Popover Suspenso de Filtros -->
          <Transition name="popover-fade">
            <div v-if="showFilterPopover" class="qm-filter-popover">
              <div class="qm-popover-header">
                <span><i class="fa-solid fa-sliders"></i> Filtros e Ordenação</span>
                <button type="button" class="qm-popover-close" @click="showFilterPopover = false">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div class="qm-popover-body">
                <div v-if="auth.canManageTeam" class="qm-popover-group">
                  <label><i class="fa-solid fa-filter"></i> Status</label>
                  <select v-model="statusFilter" class="qm-popover-select" aria-label="Filtrar por status">
                    <option value="all">Todas as mensagens</option>
                    <option value="active">Apenas Ativas</option>
                    <option value="inactive">Apenas Inativas</option>
                  </select>
                </div>

                <div class="qm-popover-group">
                  <label><i class="fa-solid fa-layer-group"></i> Disponibilidade</label>
                  <select v-model="scopeFilter" class="qm-popover-select" aria-label="Filtrar por disponibilidade">
                    <option value="all">Todas as disponibilidades</option>
                    <option value="global">Apenas Globais</option>
                    <option value="department">Apenas Departamentais</option>
                  </select>
                </div>

                <div class="qm-popover-group">
                  <label><i class="fa-solid fa-arrow-down-a-z"></i> Ordenar por</label>
                  <select v-model="sortBy" class="qm-popover-select" aria-label="Ordenar mensagens">
                    <option value="title">Título A–Z</option>
                    <option value="category">Categoria</option>
                    <option value="recent">Mais recentes</option>
                  </select>
                </div>
              </div>

              <div class="qm-popover-footer">
                <button
                  v-if="hasActiveCustomFilters"
                  type="button"
                  class="qm-popover-reset"
                  @click="resetQuickFilters"
                >
                  <i class="fa-solid fa-eraser"></i> Limpar
                </button>
                <button type="button" class="qm-popover-apply" @click="showFilterPopover = false">
                  Concluído
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Botão Nova Mensagem na Toolbar (Disponível para todos os usuários) -->
        <button class="btn-primary qm-create-btn" @click="openCreate">
          <i class="fa-solid fa-plus"></i> Nova mensagem
        </button>
      </div>
    </section>

    <div class="qm-category-row" aria-label="Categorias">
      <button type="button" class="qm-category-chip" :class="{ active: selectedCategory === 'all' }" @click="selectedCategory = 'all'">
        Todas <span>{{ messages.length }}</span>
      </button>
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        class="qm-category-chip"
        :class="{ active: selectedCategory === category }"
        @click="selectedCategory = category"
      >
        {{ category }} <span>{{ categoryCount(category) }}</span>
      </button>
    </div>

    <div v-if="loading" class="qm-grid">
      <div v-for="n in 3" :key="n" class="qm-skeleton"></div>
    </div>

    <div v-else-if="filteredMessages.length === 0" class="qm-empty">
      <div class="qm-empty-icon"><i class="fa-regular fa-comment-dots"></i></div>
      <strong>{{ hasFilters ? 'Nenhuma mensagem encontrada' : 'Nenhuma mensagem pronta cadastrada' }}</strong>
      <p>{{ hasFilters ? 'Tente alterar os filtros ou o termo pesquisado.' : 'Crie respostas reutilizáveis para agilizar os atendimentos.' }}</p>
      <button v-if="hasFilters" type="button" class="btn-secondary" @click="clearFilters">Limpar filtros</button>
    </div>

    <div v-else class="qm-grid">
      <article v-for="msg in filteredMessages" :key="msg.id" class="qm-card" :class="{ inactive: !msg.is_active }">
        <div class="qm-card-top">
          <div class="qm-card-icon" :style="categoryStyle(msg.category)">
            <i class="fa-regular fa-message"></i>
          </div>
          <div class="qm-card-heading">
            <strong>{{ msg.title }}</strong>
            <div class="qm-card-subheading">
              <span>{{ msg.category || 'Geral' }}</span>
              <span class="qm-scope-pill" :class="msg.scope === 'department' ? 'dept' : 'global'">
                <i :class="msg.scope === 'department' ? 'fa-solid fa-building-user' : 'fa-solid fa-globe'"></i>
                {{ msg.scope === 'department' ? (msg.department_name || 'Departamento') : 'Global' }}
              </span>
            </div>
          </div>
          <span class="qm-status" :class="msg.is_active ? 'active' : 'inactive'">
            <i class="fa-solid fa-circle"></i> {{ msg.is_active ? 'Ativa' : 'Inativa' }}
          </span>
        </div>

        <p class="qm-card-content">{{ msg.content }}</p>
        <p class="qm-author"><i class="fa-regular fa-user"></i> {{ authorLabel(msg) }}</p>

        <div class="qm-card-bottom">
          <button v-if="msg.shortcut" type="button" class="qm-shortcut" title="Copiar atalho" @click="copyText(`/${msg.shortcut}`, 'Atalho copiado!')">
            <span>/{{ msg.shortcut }}</span><i class="fa-regular fa-copy"></i>
          </button>
          <span v-else class="qm-no-shortcut">Sem atalho</span>
          <div class="qm-actions">
            <button type="button" class="btn-icon" title="Copiar mensagem" @click="copyText(msg.content, 'Mensagem copiada!')">
              <i class="fa-regular fa-copy"></i>
            </button>
            <button v-if="canManageMessage(msg)" type="button" class="btn-icon" title="Editar" @click="openEdit(msg)">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button v-if="canManageMessage(msg)" type="button" class="btn-icon btn-icon-danger" title="Excluir" @click="removeMessage(msg)">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <div v-if="showForm" class="modal-overlay active" @click.self="closeForm">
        <div class="modal-container qm-modal">
          <div class="modal-header">
            <div>
              <span class="modal-title">{{ editingId ? 'Editar mensagem pronta' : 'Nova mensagem pronta' }}</span>
              <p class="qm-modal-subtitle">O texto ficará disponível no campo de resposta dos atendentes.</p>
            </div>
            <button type="button" class="btn-icon" title="Fechar" @click="closeForm"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <form @submit.prevent="saveMessage">
            <div class="modal-body qm-modal-body">
              <div class="qm-form-fields">
                <div class="form-group">
                  <label>Título <span>*</span></label>
                  <input v-model="form.title" type="text" required maxlength="120" placeholder="Ex.: Confirmação de atendimento" class="form-control" />
                </div>

                <!-- Seleção de Disponibilidade / Departamento -->
                <div class="form-group">
                  <label>Disponibilidade da mensagem <span>*</span></label>
                  <div class="qm-scope-selector">
                    <label class="qm-scope-option" :class="{ selected: form.scope === 'global' }">
                      <input type="radio" value="global" v-model="form.scope" />
                      <div class="scope-option-info">
                        <i class="fa-solid fa-globe"></i>
                        <div>
                          <strong>Global</strong>
                          <small>Todos os atendentes e setores</small>
                        </div>
                      </div>
                    </label>
                    <label class="qm-scope-option" :class="{ selected: form.scope === 'department' }">
                      <input type="radio" value="department" v-model="form.scope" />
                      <div class="scope-option-info">
                        <i class="fa-solid fa-building-user"></i>
                        <div>
                          <strong>Departamental</strong>
                          <small>Apenas o setor vinculado</small>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <div v-if="form.scope === 'department'" class="form-group">
                  <label>Departamento do Setor <span>*</span></label>
                  <select v-model="form.department_id" class="form-control" required>
                    <option value="" disabled>Selecione um departamento...</option>
                    <option v-for="dept in allowedDepartments" :key="dept.id" :value="dept.id">
                      {{ dept.name }}
                    </option>
                  </select>
                </div>

                <div class="qm-two-columns">
                  <div class="form-group">
                    <label>Categoria</label>
                    <input v-model="form.category" list="quick-message-categories" type="text" maxlength="80" placeholder="Ex.: Atendimento" class="form-control" />
                    <datalist id="quick-message-categories">
                      <option v-for="category in categories" :key="category" :value="category" />
                    </datalist>
                  </div>
                  <div class="form-group">
                    <label>Atalho</label>
                    <div class="qm-shortcut-input">
                      <span>/</span>
                      <input v-model="form.shortcut" type="text" maxlength="50" placeholder="confirmacao" class="form-control" @input="sanitizeShortcut" />
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <div class="qm-label-row"><label>Mensagem <span>*</span></label><small>{{ form.content.length }}/4000</small></div>
                  <textarea v-model="form.content" required rows="8" maxlength="4000" placeholder="Digite a mensagem exatamente como deverá ser enviada..." class="form-control qm-textarea"></textarea>
                </div>

                <label class="qm-active-toggle">
                  <input v-model="form.is_active" type="checkbox" />
                  <span class="qm-toggle-track"><span></span></span>
                  <span><strong>Mensagem ativa</strong><small>Disponível para uso dos atendentes</small></span>
                </label>
              </div>

              <aside class="qm-preview">
                <span class="qm-preview-label"><i class="fa-regular fa-eye"></i> Prévia no atendimento</span>
                <div class="qm-preview-bubble">
                  <strong>{{ form.title || 'Título da mensagem' }}</strong>
                  <p>{{ form.content || 'O conteúdo da mensagem aparecerá aqui enquanto você digita.' }}</p>
                  <small>{{ form.shortcut ? `/${form.shortcut}` : 'Sem atalho' }}</small>
                </div>
              </aside>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-secondary" @click="closeForm">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <i :class="saving ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-floppy-disk'"></i>
                {{ saving ? 'Salvando...' : 'Salvar mensagem' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { quickMessagesApi } from '@/api/quick-messages.api'
import { departmentsApi } from '@/api/departments.api'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'

const auth = useAuthStore()
const ui = useUiStore()
const searchTerm = ref('')
const selectedCategory = ref('all')
const statusFilter = ref('all')
const scopeFilter = ref('all')
const sortBy = ref('title')
const showFilterPopover = ref(false)
const qmFilterDropdownRef = ref(null)
const messages = ref([])
const departments = ref([])
const loading = ref(true)
const showForm = ref(false)
const editingId = ref(null)
const saving = ref(false)

const allowedDepartments = computed(() => {
  if (auth.isAdmin) return departments.value
  const userDepts = auth.departmentIds || []
  return departments.value.filter(d => userDepts.includes(String(d.id)))
})

const emptyForm = () => ({
  title: '',
  category: 'Atendimento',
  shortcut: '',
  content: '',
  scope: 'global',
  department_id: allowedDepartments.value[0]?.id || auth.departmentId || '',
  is_active: true
})
const form = ref(emptyForm())
const categories = computed(() => [...new Set(messages.value.map(item => item.category || 'Geral'))].sort((a, b) => a.localeCompare(b, 'pt-BR')))
const activeCount = computed(() => messages.value.filter(item => item.is_active).length)
const hasFilters = computed(() => Boolean(searchTerm.value.trim()) || selectedCategory.value !== 'all' || statusFilter.value !== 'all' || scopeFilter.value !== 'all')

const hasActiveCustomFilters = computed(() => {
  return statusFilter.value !== 'all' || scopeFilter.value !== 'all' || sortBy.value !== 'title'
})

function resetQuickFilters() {
  statusFilter.value = 'all'
  scopeFilter.value = 'all'
  sortBy.value = 'title'
}

function handleQmClickOutside(event) {
  if (qmFilterDropdownRef.value && !qmFilterDropdownRef.value.contains(event.target)) {
    showFilterPopover.value = false
  }
}

const filteredMessages = computed(() => {
  const term = searchTerm.value.trim().toLocaleLowerCase('pt-BR')
  const list = messages.value.filter(item => {
    const searchable = `${item.title} ${item.content} ${item.shortcut || ''} ${item.category || ''} ${item.department_name || ''}`.toLocaleLowerCase('pt-BR')
    if (term && !searchable.includes(term)) return false
    if (selectedCategory.value !== 'all' && (item.category || 'Geral') !== selectedCategory.value) return false
    if (statusFilter.value === 'active' && !item.is_active) return false
    if (statusFilter.value === 'inactive' && item.is_active) return false
    if (scopeFilter.value === 'global' && item.scope === 'department' && item.department_id) return false
    if (scopeFilter.value === 'department' && (item.scope !== 'department' || !item.department_id)) return false
    return true
  })
  return [...list].sort((a, b) => {
    if (sortBy.value === 'category') return (a.category || '').localeCompare(b.category || '', 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR')
    if (sortBy.value === 'recent') return messages.value.indexOf(b) - messages.value.indexOf(a)
    return a.title.localeCompare(b.title, 'pt-BR')
  })
})

async function loadDepartments() {
  try {
    const { data } = await departmentsApi.list()
    departments.value = data.departments || []
  } catch (_) {}
}

async function loadMessages() {
  loading.value = true
  try {
    const { data } = await quickMessagesApi.list()
    messages.value = data.messages || []
  } catch (_) {
    ui.showToast('Não foi possível carregar as mensagens prontas.', 'error')
  } finally {
    loading.value = false
  }
}

function categoryCount(category) { return messages.value.filter(item => (item.category || 'Geral') === category).length }
function canManageMessage(message) {
  return auth.isAdmin || String(message.created_by_id || '') === String(auth.user?.id || '')
}
function authorLabel(message) {
  const author = message.created_by_name || 'Sistema'
  if (!message.created_at) return `Criada por ${author}`
  return `Criada por ${author} em ${new Date(message.created_at).toLocaleDateString('pt-BR')}`
}
function categoryStyle(category = 'Geral') {
  const palettes = [
    ['#ecfdf5', '#059669'], ['#f5f3ff', '#7c3aed'], ['#f0fdf4', '#16a34a'],
    ['#fff7ed', '#ea580c'], ['#fdf2f8', '#db2777'], ['#f0f9ff', '#0284c7']
  ]
  const index = [...category].reduce((total, char) => total + char.charCodeAt(0), 0) % palettes.length
  return { backgroundColor: palettes[index][0], color: palettes[index][1] }
}
function clearFilters() { searchTerm.value = ''; selectedCategory.value = 'all'; statusFilter.value = 'all'; scopeFilter.value = 'all' }
function closeForm() { if (!saving.value) showForm.value = false }
function openCreate() {
  editingId.value = null
  form.value = emptyForm()
  showForm.value = true
}
function openEdit(message) {
  editingId.value = message.id
  form.value = {
    title: message.title || '',
    category: message.category || 'Atendimento',
    shortcut: message.shortcut || '',
    content: message.content || '',
    scope: message.scope || (message.department_id ? 'department' : 'global'),
    department_id: message.department_id || (allowedDepartments.value[0]?.id || ''),
    is_active: message.is_active !== false
  }
  showForm.value = true
}
function sanitizeShortcut() { form.value.shortcut = form.value.shortcut.toLowerCase().replace(/^\/+/, '').replace(/[^a-z0-9_-]/g, '') }
async function copyText(value, message) {
  try { await navigator.clipboard.writeText(value); ui.showToast(message) }
  catch (_) { ui.showToast('Não foi possível copiar.', 'error') }
}

async function saveMessage() {
  if (!form.value.title.trim() || !form.value.content.trim()) return ui.showToast('Informe o título e a mensagem.', 'error')
  const duplicateShortcut = form.value.shortcut && messages.value.some(item => item.id !== editingId.value && item.shortcut === form.value.shortcut)
  if (duplicateShortcut) return ui.showToast('Esse atalho já está sendo utilizado.', 'error')
  
  saving.value = true
  try {
    const payload = { ...form.value }
    if (payload.scope === 'department') {
      const dept = departments.value.find(d => String(d.id) === String(payload.department_id))
      payload.department_name = dept?.name || null
    } else {
      payload.department_id = null
      payload.department_name = null
    }

    if (editingId.value) await quickMessagesApi.update(editingId.value, payload)
    else await quickMessagesApi.create(payload)
    ui.showToast(editingId.value ? 'Mensagem atualizada com sucesso!' : 'Mensagem criada com sucesso!')
    showForm.value = false
    await loadMessages()
  } catch (error) {
    ui.showToast(error.response?.data?.error || 'Não foi possível salvar a mensagem.', 'error')
  } finally { saving.value = false }
}

async function removeMessage(message) {
  if (!window.confirm(`Excluir a mensagem "${message.title}"?`)) return
  try { await quickMessagesApi.remove(message.id); await loadMessages(); ui.showToast('Mensagem excluída.') }
  catch (error) { ui.showToast(error.response?.data?.error || 'Não foi possível excluir a mensagem.', 'error') }
}

onMounted(async () => {
  document.addEventListener('click', handleQmClickOutside)
  await loadDepartments()
  await loadMessages()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleQmClickOutside)
})
</script>

<style scoped>
.qm-page { width: 100%; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 13px; padding: 18px 20px 24px; box-sizing: border-box; background: #f8fafc; }

/* ── Toolbar Compacta com Busca, Filtros e Nova Mensagem ── */
.qm-toolbar { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 11px; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03); }
.qm-search { position: relative; flex: 1; min-width: 180px; }
.qm-search > i { position: absolute; z-index: 1; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 12px; pointer-events: none; }
.qm-search input { box-sizing: border-box; width: 100%; height: 38px; padding: 0 34px; border: 1px solid #dbe2ea; border-radius: 9px; background: #f8fafc; color: #1e293b; font: inherit; font-size: 12.5px; outline: none; transition: border-color .15s ease, box-shadow .15s ease, background .15s ease; }
.qm-search input:focus { border-color: #60a5fa; background: #fff; box-shadow: 0 0 0 3px rgba(37, 99, 235, .1); }
.qm-search input::placeholder { color: #94a3b8; }
.qm-clear-search { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; color: var(--text-light); cursor: pointer; }

.qm-toolbar-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

/* ── Botão e Popover de Filtros ── */
.qm-filter-dropdown-wrapper { position: relative; }

.qm-filter-btn {
  height: 38px;
  padding: 0 14px;
  border-radius: 9px;
  border: 1px solid #dbe2ea;
  background: #ffffff;
  color: #475569;
  font-size: 12.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  position: relative;
  transition: all 0.15s ease;
  user-select: none;
}

.qm-filter-btn:hover {
  background: #f8fafc;
  color: #1f62d0;
  border-color: #bfdbfe;
}

.qm-filter-btn.active {
  background: #eff6ff;
  color: #1f62d0;
  border-color: #1f62d0;
}

.qm-filter-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #1f62d0;
}

.qm-filter-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 280px;
  background: #ffffff;
  border: 1px solid #dbe2ea;
  border-radius: 10px;
  box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06);
  z-index: 100;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.qm-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

.qm-popover-header span {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.qm-popover-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
}

.qm-popover-close:hover {
  color: #0f172a;
  background: #f1f5f9;
}

.qm-popover-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.qm-popover-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.qm-popover-group label {
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 5px;
}

.qm-popover-group label i {
  color: #94a3b8;
  font-size: 10px;
}

.qm-popover-select {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #dbe2ea;
  border-radius: 7px;
  background: #fff;
  color: #1e293b;
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.qm-popover-select:focus {
  border-color: #1f62d0;
  box-shadow: 0 0 0 3px rgba(31, 98, 208, .08);
}

.qm-popover-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}

.qm-popover-reset {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.qm-popover-reset:hover {
  text-decoration: underline;
}

.qm-popover-apply {
  background: #1f62d0;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  margin-left: auto;
  transition: background 0.15s ease;
}

.qm-popover-apply:hover {
  background: #1d4ed8;
}

.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.qm-create-btn { height: 38px; padding: 0 16px; white-space: nowrap; border-radius: 9px; font-weight: 600; font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px; }
.qm-category-row { display: flex; gap: 6px; overflow-x: auto; padding: 1px 1px 4px; scrollbar-width: thin; }
.qm-category-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 29px; padding: 5px 10px; border: 1px solid var(--border-color); border-radius: 7px; background: #ffffff; color: var(--text-muted); font-size: 11.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.15s ease; }
.qm-category-chip span { min-width: 16px; padding: 1px 4px; border-radius: 4px; background: #f1f5f9; font-size: 9.5px; text-align: center; }
.qm-category-chip.active { border-color: #bfdbfe; background: #eff6ff; color: var(--brand-primary); }
.qm-category-chip.active span { background: #dbeafe; }
.qm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; align-items: stretch; }
.qm-card { min-width: 0; min-height: 184px; display: flex; flex-direction: column; padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff; box-shadow: 0 1px 3px rgba(15, 23, 42, .025); transition: border-color 0.15s ease, transform .15s ease, box-shadow .15s ease; }
.qm-card:hover { border-color: #bfdbfe; transform: translateY(-1px); box-shadow: 0 5px 14px rgba(15, 23, 42, .05); }
.qm-card.inactive { opacity: 0.65; }
.qm-card-top { display: flex; align-items: center; gap: 8px; }
.qm-card-icon { width: 30px; height: 30px; border-radius: 6px; display: grid; place-items: center; flex: none; font-size: 13px; }
.qm-card-heading { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.qm-card-heading strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-main); font-size: 13px; }
.qm-card-heading span { color: var(--text-muted); font-size: 10px; }
.qm-status { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 650; }
.qm-status i { font-size: 5px; }
.qm-status.active { color: #168a52; }
.qm-status.inactive { color: #94a3b8; }
.qm-card-content { flex: 1; margin: 12px 0; color: var(--text-main); font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; }
.qm-author { margin: 0 0 8px; overflow: hidden; color: var(--text-light); font-size: 9.5px; white-space: nowrap; text-overflow: ellipsis; }
.qm-card-bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 10px; border-top: 1px solid #edf0f3; }
.qm-shortcut { display: inline-flex; align-items: center; gap: 6px; padding: 3px 6px; border: 1px solid #dbeafe; border-radius: 4px; background: #eff6ff; color: var(--brand-primary); font: 600 10.5px monospace; cursor: pointer; }
.qm-no-shortcut { color: var(--text-light); font-size: 10.5px; }
.qm-actions { display: flex; gap: 4px; }
.btn-icon-danger { color: #d92d20; }
.btn-icon-danger:hover { background: #fef2f2; }
.qm-empty { min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; border: 1px dashed var(--border-color); border-radius: 8px; background: #ffffff; text-align: center; }
.qm-empty-icon { width: 44px; height: 44px; display: grid; place-items: center; margin-bottom: 10px; border-radius: 50%; background: #f1f5f9; color: var(--brand-primary); font-size: 18px; }
.qm-empty strong { color: var(--text-main); font-size: 13.5px; }
.qm-empty p { margin: 4px 0 12px; color: var(--text-muted); font-size: 11.5px; }
.qm-skeleton { height: 180px; border-radius: 8px; background: #f8fafc; border: 1px solid #edf0f3; }
.qm-modal { width: min(800px, calc(100vw - 28px)); max-width: 800px; max-height: min(720px, calc(100vh - 28px)); display: flex; flex-direction: column; }
.qm-modal form { min-height: 0; display: flex; flex-direction: column; }
.qm-modal-subtitle { margin: 3px 0 0; color: var(--text-muted); font-size: 11px; }
.qm-modal-body { min-height: 0; overflow-y: auto; display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(230px, 0.8fr); gap: 18px; }
.qm-form-fields { min-width: 0; }
.qm-two-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.form-group label span, .qm-label-row label span { color: #d92d20; }
.qm-label-row { display: flex; justify-content: space-between; align-items: center; }
.qm-label-row small { color: var(--text-light); font-size: 10.5px; }
.qm-textarea { resize: vertical; min-height: 140px; line-height: 1.5; }
.qm-shortcut-input { position: relative; }
.qm-shortcut-input > span { position: absolute; z-index: 1; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-weight: 700; }
.qm-shortcut-input input { padding-left: 22px; }
.qm-active-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.qm-active-toggle > input { position: absolute; opacity: 0; }
.qm-toggle-track { width: 34px; height: 18px; padding: 2px; border-radius: 999px; background: #cbd5e1; transition: 0.2s; box-sizing: border-box; }
.qm-toggle-track span { display: block; width: 14px; height: 14px; border-radius: 50%; background: #ffffff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15); transition: 0.2s; }
.qm-active-toggle > input:checked + .qm-toggle-track { background: var(--brand-primary); }
.qm-active-toggle > input:checked + .qm-toggle-track span { transform: translateX(16px); }
.qm-active-toggle > span:last-child { display: flex; flex-direction: column; }
.qm-active-toggle strong { color: var(--text-main); font-size: 12px; }
.qm-active-toggle small { color: var(--text-muted); font-size: 10px; }
.qm-preview { padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: #fafbfc; }
.qm-preview-label { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.qm-preview-bubble { padding: 10px; border-radius: 8px; background: #ecfdf5; border: 1px solid #bbf7d0; }
.qm-preview-bubble strong { display: block; margin-bottom: 4px; color: #166534; font-size: 11px; }
.qm-preview-bubble p { margin: 0; color: #14532d; font-size: 11.5px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.qm-preview-bubble small { display: block; margin-top: 8px; color: #4d7c5a; font: 600 9.5px monospace; }

.qm-card-subheading {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.qm-scope-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  line-height: 1.4;
}

.qm-scope-pill.global {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}

.qm-scope-pill.dept {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}

.qm-scope-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.qm-scope-option {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  transition: all 0.15s ease;
}

.qm-scope-option:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.qm-scope-option.selected {
  border-color: #10b981;
  background: #ecfdf5;
}

.qm-scope-option input[type="radio"] {
  accent-color: #059669;
}

.scope-option-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-option-info i {
  font-size: 16px;
  color: #3b82f6;
}

.scope-option-info strong {
  display: block;
  font-size: 12px;
  color: #1e293b;
}

.scope-option-info small {
  display: block;
  font-size: 10.5px;
  color: #64748b;
}

@media (max-width: 900px) {
  .qm-summary { grid-template-columns: minmax(0, 1fr) auto; gap: 14px; }
  .qm-stats { order: 3; grid-column: 1 / -1; width: 100%; }
  .qm-stat { flex: 1; }
  .qm-modal-body { grid-template-columns: 1fr; }
  .qm-preview { display: none; }
}

@media (max-width: 650px) {
  .qm-page { padding: 10px; gap: 10px; }
  .qm-summary { grid-template-columns: 1fr; padding: 14px; }
  .qm-summary h2 { font-size: 16px; }
  .qm-stats { order: initial; grid-column: auto; }
  .qm-create-btn { width: 100%; }
  .qm-toolbar { align-items: stretch; flex-direction: column; padding: 9px; }
  .qm-search { width: 100%; flex: none; }
  .qm-filter-controls { width: 100%; }
  .qm-select-wrap { flex: 1; min-width: 0; }
  .qm-select { width: 100%; }
  .qm-two-columns { grid-template-columns: 1fr; }
  .qm-grid { grid-template-columns: 1fr; }
  .qm-card { min-height: 170px; }
  .qm-modal { width: calc(100vw - 16px); max-height: calc(100vh - 16px); }
  .qm-modal .modal-header, .qm-modal .modal-body, .qm-modal .modal-footer { padding-left: 13px; padding-right: 13px; }
  .qm-modal .modal-footer { flex-direction: column-reverse; }
  .qm-modal .modal-footer button { width: 100%; justify-content: center; }
}
</style>
