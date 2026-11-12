<template>
  <!-- Aba lateral vertical quando o sidebar está recolhido (clicar ou puxar para reabrir) -->
  <Teleport to="body">
    <Transition name="tools-tab-slide">
      <button
        v-if="isCollapsed"
        type="button"
        class="tools-collapsed-tab"
        :class="{ 'is-dragging': isDragging }"
        title="Clique ou puxe para abrir Ferramentas"
        aria-label="Abrir barra de ferramentas"
        @click="onTabClick"
        @mousedown="startDrag"
        @touchstart.passive="startTouch"
      >
        <span class="tab-arrow"><i class="ri-arrow-left-s-line"></i></span>
        <span class="tab-icon"><i class="ri-tools-line"></i></span>
        <span class="tab-label">Ferramentas</span>
      </button>
    </Transition>
  </Teleport>

  <aside class="tools-sidebar" id="toolsSidebar" :class="{ 'is-collapsed': isCollapsed }">
    <!-- Dock Container com os Ícones em Formato de Balões Flutuantes -->
    <div class="tools-dock-track" v-show="!isCollapsed">
      <!-- 0. Balão: Recolher Sidebar de Ferramentas -->
      <div class="tool-bubble-item">
        <button
          type="button"
          class="tool-bubble-btn tool-btn-collapse"
          title="Recolher Ferramentas"
          aria-label="Recolher Ferramentas"
          @click="collapseSidebar"
        >
          <span class="tools-icon-box"><i class="ri-arrow-right-s-line"></i></span>
        </button>
        <div class="tool-bubble-tooltip">
          <span>Recolher Ferramentas</span>
        </div>
      </div>

      <div class="tool-dock-divider"></div>
      <!-- 1. Balão: Bloco de Notas -->
      <div class="tool-bubble-item">
        <button
          type="button"
          class="tool-bubble-btn tool-btn-notepad"
          :class="{ active: notepad.isOpen, 'has-dirty': hasDirtyTab }"
          title="Notas Rápidas"
          aria-label="Notas Rápidas"
          @click="toggleNotepad"
        >
          <span class="tools-icon-box"><i class="ri-sticky-note-line"></i></span>
          <span v-if="hasDirtyTab" class="bubble-dot-badge" title="Anotações não salvas"></span>
        </button>
        <div class="tool-bubble-tooltip">
          <span>Notas Rápidas</span>
        </div>
      </div>

      <div class="tool-dock-divider"></div>

      <!-- 2. Balão: Validador & Formatador CPF / CNPJ -->
      <div class="tool-bubble-item" ref="docWrapperRef">
        <button
          type="button"
          class="tool-bubble-btn tool-btn-cpf"
          :class="{ active: activePopover === 'doc' }"
          title="Validador CPF / CNPJ"
          aria-label="Validador CPF/CNPJ"
          @click="togglePopover('doc')"
        >
          <span class="tools-icon-box"><i class="ri-id-card-line"></i></span>
        </button>
        <div class="tool-bubble-tooltip">
          <span>Validador CPF/CNPJ</span>
        </div>

        <!-- Popover Flutuante: Validador CPF / CNPJ -->
        <Teleport to="body">
          <div
            v-if="activePopover === 'doc'"
            class="tool-floating-popover doc-popover"
            @click.stop
          >
            <div class="popover-header">
              <div class="popover-header-title">
                <span class="tools-icon-box-sm"><i class="ri-id-card-line doc-icon-header"></i></span>
                <span>Validador CPF / CNPJ</span>
              </div>
              <button type="button" class="popover-close-btn" @click="closePopovers" title="Fechar (Esc)">
                <span class="tools-icon-box-sm"><i class="ri-close-line"></i></span>
              </button>
            </div>

            <div class="popover-body">
              <div class="tool-field-group">
                <label class="tool-label">Insira o CPF ou CNPJ (com ou sem pontuação)</label>
                <input
                  v-model="docInput"
                  type="text"
                  class="tool-input"
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  maxlength="20"
                />
              </div>

              <!-- Status Badge de Validação -->
              <div class="doc-status-container">
                <div v-if="docStatus === 'valid'" class="doc-badge doc-badge-valid">
                  <span class="tools-icon-box-sm"><i class="ri-checkbox-circle-line"></i></span>
                  <span>{{ docType }} Válido</span>
                </div>
                <div v-else-if="docStatus === 'invalid'" class="doc-badge doc-badge-invalid">
                  <span class="tools-icon-box-sm"><i class="ri-close-circle-line"></i></span>
                  <span>{{ docType }} Inválido (Dígito incorreto)</span>
                </div>
                <div v-else class="doc-badge doc-badge-neutral">
                  <span class="tools-icon-box-sm"><i class="ri-information-line"></i></span>
                  <span>Digite 11 (CPF) ou 14 (CNPJ) dígitos</span>
                </div>
              </div>

              <!-- Resultados Formatados & Ações de Cópia -->
              <div v-if="cleanDoc" class="doc-results-box">
                <div class="doc-row">
                  <span class="doc-row-label">Formatado:</span>
                  <span class="doc-row-val">{{ formattedDoc }}</span>
                  <button
                    type="button"
                    class="doc-copy-btn"
                    @click="copyDocFormatted"
                    :title="docCopiedFmt ? 'Copiado!' : 'Copiar formatado'"
                  >
                    <span class="tools-icon-box-sm"><i :class="docCopiedFmt ? 'ri-check-line' : 'ri-file-copy-line'"></i></span>
                  </button>
                </div>
                <div class="doc-row">
                  <span class="doc-row-label">Apenas Números:</span>
                  <span class="doc-row-val">{{ cleanDoc }}</span>
                  <button
                    type="button"
                    class="doc-copy-btn"
                    @click="copyDocClean"
                    :title="docCopiedCln ? 'Copiado!' : 'Copiar apenas números'"
                  >
                    <span class="tools-icon-box-sm"><i :class="docCopiedCln ? 'ri-check-line' : 'ri-file-copy-line'"></i></span>
                  </button>
                </div>
              </div>

              <div class="tool-actions-row">
                <button
                  type="button"
                  class="tool-btn-ghost"
                  @click="docInput = ''"
                  title="Limpar campo"
                >
                  <span class="tools-icon-box-sm"><i class="ri-delete-bin-line"></i></span> Limpar
                </button>
              </div>
            </div>
          </div>
        </Teleport>
      </div>

      <div class="tool-dock-divider"></div>

      <!-- 4. Balão: Calculadora Rápida -->
      <div class="tool-bubble-item" ref="calcWrapperRef">
        <button
          type="button"
          class="tool-bubble-btn tool-btn-calc"
          :class="{ active: activePopover === 'calc' }"
          title="Calculadora Rápida"
          aria-label="Calculadora Rápida"
          @click="togglePopover('calc')"
        >
          <span class="tools-icon-box"><i class="ri-calculator-line"></i></span>
        </button>
        <div class="tool-bubble-tooltip">
          <span>Calculadora</span>
        </div>

        <!-- Popover Flutuante da Calculadora Rápida -->
        <Teleport to="body">
          <div
            v-if="activePopover === 'calc'"
            class="tool-floating-popover calc-popover"
            @click.stop
          >
            <div class="popover-header">
              <div class="popover-header-title">
                <span class="tools-icon-box-sm"><i class="ri-calculator-line calc-icon-header"></i></span>
                <span>Calculadora</span>
              </div>
              <button type="button" class="popover-close-btn" @click="closePopovers" title="Fechar (Esc)">
                <span class="tools-icon-box-sm"><i class="ri-close-line"></i></span>
              </button>
            </div>
            <div class="calc-display-area">
              <div class="calc-history-expr">{{ calcExpr || '&nbsp;' }}</div>
              <div class="calc-main-value">{{ calcDisplay }}</div>
            </div>
            <div class="calc-buttons-grid">
              <button type="button" class="calc-btn calc-op-clear" @click="calcClear">C</button>
              <button type="button" class="calc-btn calc-op" @click="calcBackspace"><span class="tools-icon-box-sm"><i class="ri-delete-back-2-line"></i></span></button>
              <button type="button" class="calc-btn calc-op" @click="calcOp('%')">%</button>
              <button type="button" class="calc-btn calc-op" @click="calcOp('/')">÷</button>

              <button type="button" class="calc-btn" @click="calcDigit('7')">7</button>
              <button type="button" class="calc-btn" @click="calcDigit('8')">8</button>
              <button type="button" class="calc-btn" @click="calcDigit('9')">9</button>
              <button type="button" class="calc-btn calc-op" @click="calcOp('*')">×</button>

              <button type="button" class="calc-btn" @click="calcDigit('4')">4</button>
              <button type="button" class="calc-btn" @click="calcDigit('5')">5</button>
              <button type="button" class="calc-btn" @click="calcDigit('6')">6</button>
              <button type="button" class="calc-btn calc-op" @click="calcOp('-')">−</button>

              <button type="button" class="calc-btn" @click="calcDigit('1')">1</button>
              <button type="button" class="calc-btn" @click="calcDigit('2')">2</button>
              <button type="button" class="calc-btn" @click="calcDigit('3')">3</button>
              <button type="button" class="calc-btn calc-op" @click="calcOp('+')">+</button>

              <button type="button" class="calc-btn calc-zero" @click="calcDigit('0')">0</button>
              <button type="button" class="calc-btn" @click="calcDot">,</button>
              <button type="button" class="calc-btn calc-equals" @click="calcEquals">=</button>
            </div>
          </div>
        </Teleport>
      </div>

      <div class="tool-dock-divider"></div>

      <!-- 4. Balão: Painel TV (Apenas ícone, abre em nova aba) -->
      <div class="tool-bubble-item">
        <a
          :href="painelTvUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="tool-bubble-btn tool-btn-tv"
          title="Painel TV"
          aria-label="Painel TV"
        >
          <span class="tools-icon-box"><i class="ri-tv-line"></i></span>
        </a>
        <div class="tool-bubble-tooltip">
          <span>Painel TV</span>
        </div>
      </div>

    </div>

    <!-- Drawer do Bloco de Notas já existente -->
    <NotepadDrawer />
  </aside>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotepadStore } from '@/stores/notepad.store'
import NotepadDrawer from '@/components/tools/NotepadDrawer.vue'

// ─── 0. CONTROLE DE RECOLHER / EXPANDIR SIDEBAR ──────────────────────────────
const isCollapsed = ref(localStorage.getItem('brisoft_shop_tools_collapsed') === 'true')
const isDragging = ref(false)
let dragStartX = 0
let hasMoved = false

function collapseSidebar() {
  closePopovers()
  if (notepad.isOpen) {
    notepad.close()
  }
  isCollapsed.value = true
  try {
    localStorage.setItem('brisoft_shop_tools_collapsed', 'true')
  } catch (e) {
    console.error(e)
  }
}

function expandSidebar() {
  isCollapsed.value = false
  try {
    localStorage.setItem('brisoft_shop_tools_collapsed', 'false')
  } catch (e) {
    console.error(e)
  }
}

function onTabClick() {
  expandSidebar()
}

function startDrag(e) {
  if (e.button !== 0) return
  e.preventDefault()
  dragStartX = e.clientX
  hasMoved = false
  isDragging.value = true

  function onMouseMove(moveEvent) {
    const deltaX = dragStartX - moveEvent.clientX // > 0 ao puxar para a esquerda (centro da tela)
    if (Math.abs(deltaX) > 4) {
      hasMoved = true
    }
    if (deltaX > 8) {
      expandSidebar()
      stopDrag()
    }
  }

  function onMouseUp() {
    stopDrag()
  }

  function stopDrag() {
    isDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function startTouch(e) {
  if (!e.touches || e.touches.length === 0) return
  dragStartX = e.touches[0].clientX
  hasMoved = false
  isDragging.value = true

  function onTouchMove(moveEvent) {
    if (!moveEvent.touches || moveEvent.touches.length === 0) return
    const deltaX = dragStartX - moveEvent.touches[0].clientX
    if (Math.abs(deltaX) > 4) {
      hasMoved = true
    }
    if (deltaX > 8) {
      expandSidebar()
      stopTouch()
    }
  }

  function onTouchEnd() {
    stopTouch()
  }

  function stopTouch() {
    isDragging.value = false
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('touchcancel', stopTouch)
  }

  window.addEventListener('touchmove', onTouchMove, { passive: true })
  window.addEventListener('touchend', onTouchEnd)
  window.addEventListener('touchcancel', stopTouch)
}

const router = useRouter()
const painelTvUrl = computed(() => {
  return router.resolve('/painel-tv').href
})

const notepad = useNotepadStore()

const hasDirtyTab = computed(() => {
  return notepad.tabs.some(t => t.isDirty)
})

// Controle de Popover Ativo (apenas 1 aberto por vez)
const activePopover = ref(null) // 'doc' | 'calc' | null

function togglePopover(name) {
  if (activePopover.value === name) {
    activePopover.value = null
  } else {
    activePopover.value = name
  }
}

function closePopovers() {
  activePopover.value = null
}

function toggleNotepad() {
  closePopovers()
  notepad.toggle()
}

// ─── 1. VALIDADOR CPF / CNPJ ─────────────────────────────────────────────────
const docInput = ref('')
const docCopiedFmt = ref(false)
const docCopiedCln = ref(false)

const cleanDoc = computed(() => docInput.value.replace(/\D/g, ''))

function validateCPF(cpf) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i)
  let rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  if (rev !== parseInt(cpf.charAt(9), 10)) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i)
  rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  return rev === parseInt(cpf.charAt(10), 10)
}

function validateCNPJ(cnpj) {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  let size = cnpj.length - 2
  let numbers = cnpj.substring(0, size)
  const digits = cnpj.substring(size)
  let sum = 0
  let pos = size - 7
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i), 10) * pos--
    if (pos < 2) pos = 9
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (result !== parseInt(digits.charAt(0), 10)) return false
  size += 1
  numbers = cnpj.substring(0, size)
  sum = 0
  pos = size - 7
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i), 10) * pos--
    if (pos < 2) pos = 9
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  return result === parseInt(digits.charAt(1), 10)
}

const docType = computed(() => {
  const d = cleanDoc.value
  if (d.length <= 11) return 'CPF'
  return 'CNPJ'
})

const docStatus = computed(() => {
  const d = cleanDoc.value
  if (d.length === 11) {
    return validateCPF(d) ? 'valid' : 'invalid'
  }
  if (d.length === 14) {
    return validateCNPJ(d) ? 'valid' : 'invalid'
  }
  return 'incomplete'
})

const formattedDoc = computed(() => {
  const d = cleanDoc.value
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
})

async function copyDocFormatted() {
  if (!formattedDoc.value) return
  try {
    await navigator.clipboard.writeText(formattedDoc.value)
    docCopiedFmt.value = true
    setTimeout(() => { docCopiedFmt.value = false }, 2000)
  } catch (err) {
    console.error(err)
  }
}

async function copyDocClean() {
  if (!cleanDoc.value) return
  try {
    await navigator.clipboard.writeText(cleanDoc.value)
    docCopiedCln.value = true
    setTimeout(() => { docCopiedCln.value = false }, 2000)
  } catch (err) {
    console.error(err)
  }
}

// ─── 3. CALCULADORA RÁPIDA ───────────────────────────────────────────────────
const calcDisplay = ref('0')
const calcExpr = ref('')
const calcNewNum = ref(true)

function calcDigit(d) {
  if (calcNewNum.value || calcDisplay.value === '0') {
    calcDisplay.value = d
    calcNewNum.value = false
  } else {
    if (calcDisplay.value.length < 12) {
      calcDisplay.value += d
    }
  }
}

function calcDot() {
  if (calcNewNum.value) {
    calcDisplay.value = '0.'
    calcNewNum.value = false
  } else if (!calcDisplay.value.includes('.')) {
    calcDisplay.value += '.'
  }
}

function calcClear() {
  calcDisplay.value = '0'
  calcExpr.value = ''
  calcNewNum.value = true
}

function calcBackspace() {
  if (calcNewNum.value) return
  if (calcDisplay.value.length > 1) {
    calcDisplay.value = calcDisplay.value.slice(0, -1)
  } else {
    calcDisplay.value = '0'
    calcNewNum.value = true
  }
}

function calcOp(op) {
  const current = parseFloat(calcDisplay.value) || 0
  if (op === '%') {
    calcDisplay.value = String(current / 100)
    calcNewNum.value = true
    return
  }
  calcExpr.value = `${current} ${op}`
  calcNewNum.value = true
}

function calcEquals() {
  if (!calcExpr.value) return
  try {
    const parts = calcExpr.value.split(' ')
    const prev = parseFloat(parts[0])
    const op = parts[1]
    const current = parseFloat(calcDisplay.value)
    let res = 0
    if (op === '+') res = prev + current
    else if (op === '-') res = prev - current
    else if (op === '*') res = prev * current
    else if (op === '/') res = current !== 0 ? prev / current : 0

    const rounded = Math.round(res * 1000000) / 1000000
    calcDisplay.value = String(rounded)
    calcExpr.value = `${prev} ${op} ${current} =`
    calcNewNum.value = true
  } catch {
    calcDisplay.value = 'Erro'
    calcNewNum.value = true
  }
}

// ─── 4. TECLA ESC E CLIQUE FORA ──────────────────────────────────────────────
function handleKeyDown(e) {
  if (e.key === 'Escape') {
    closePopovers()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.tools-sidebar {
  width: 46px;
  min-width: 46px;
  max-width: 46px;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  box-shadow: -1px 0 4px rgba(15, 23, 42, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  height: 100vh;
  padding: 12px 0 16px;
  box-sizing: border-box;
  flex-shrink: 0;
  z-index: 3005; /* Acima do backdrop para manter os botões interativos */
  user-select: none;
  position: relative;
  transition: width 0.12s cubic-bezier(0.2, 0, 0, 1),
              min-width 0.12s cubic-bezier(0.2, 0, 0, 1),
              max-width 0.12s cubic-bezier(0.2, 0, 0, 1),
              padding 0.12s cubic-bezier(0.2, 0, 0, 1);
}

.tools-sidebar.is-collapsed {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  padding: 0 !important;
  border-left: none !important;
  overflow: hidden !important;
  opacity: 0;
  pointer-events: none;
}

/* Oculta cabeçalho legado */
.tools-header {
  display: none;
}

/* Dock Container / Trilha dos Ícones */
.tools-dock-track {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: transparent;
  padding: 0;
  border-radius: 0;
  border: none;
  box-shadow: none;
  width: 100%;
}

/* Item Balão Individual */
.tool-bubble-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

/* Botão do Ícone */
.tool-bubble-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: #54656f;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: none;
  transition: all 0.16s ease;
  position: relative;
  outline: none;
  padding: 0;
  text-decoration: none;
}

.tool-bubble-btn:hover {
  background: #f8fafc;
  color: #0f172a;
}

.tool-bubble-btn.active {
  background: #dcfce7 !important;
  color: #059669 !important;
}

.tool-bubble-btn i {
  font-size: 15px;
  line-height: 1;
  transition: all 0.18s ease;
}

.tools-icon-box {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tools-icon-box i {
  font-size: 16px;
  line-height: 1;
}

.tools-icon-box-sm {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tools-icon-box-sm i {
  font-size: 13px;
  line-height: 1;
}

/* Cores específicas de hover por ferramenta */
.tool-btn-notepad:hover {
  border-color: #059669;
  color: #059669;
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 6px 12px rgba(5, 150, 105, 0.2);
}

.tool-btn-whatsapp:hover {
  border-color: #059669;
  color: #059669;
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 6px 12px rgba(5, 150, 105, 0.22);
}

.tool-btn-cpf:hover {
  border-color: #059669;
  color: #059669;
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 6px 12px rgba(5, 150, 105, 0.22);
}

.tool-btn-calc:hover {
  border-color: #059669;
  color: #059669;
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 6px 12px rgba(5, 150, 105, 0.2);
}

.tool-btn-tv:hover {
  border-color: #059669;
  color: #059669;
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 6px 12px rgba(5, 150, 105, 0.2);
}

.tool-btn-shortcuts:hover {
  border-color: #059669;
  color: #059669;
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 6px 12px rgba(5, 150, 105, 0.15);
}

.tool-bubble-btn:active {
  transform: scale(0.94);
}

/* Balão Ativo */
.tool-bubble-btn.active {
  background: #059669 !important;
  border-color: #047857 !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);
  transform: scale(1.05);
}

.tool-btn-whatsapp.active {
  background: #059669;
  border-color: #047857;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);
}

.tool-btn-cpf.active {
  background: #059669;
  border-color: #047857;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);
}

.tool-btn-calc.active {
  background: #059669;
  border-color: #047857;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);
}

.tool-btn-notepad.active {
  background: #059669;
  border-color: #047857;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);
}

.tool-bubble-btn.active i {
  color: #ffffff;
}

/* Badge de Anotações com Alterações */
.bubble-dot-badge {
  position: absolute;
  top: 0;
  right: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background-color: #f59e0b;
  box-shadow: 0 0 0 2px #ffffff;
}

/* Divisória da Dock */
.tool-dock-divider {
  width: 18px;
  height: 1px;
  background: #e2e8f0;
  margin: 1px 0;
}

/* Tooltip Balão Flutuante à Esquerda */
.tool-bubble-tooltip {
  position: absolute;
  right: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%) translateX(6px);
  background: #0f172a;
  color: #ffffff;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  z-index: 120;
}

.tool-bubble-tooltip::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -4px;
  transform: translateY(-50%);
  border-width: 4px 0 4px 4px;
  border-style: solid;
  border-color: transparent transparent transparent #0f172a;
}

.tool-bubble-item:hover .tool-bubble-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%) translateX(0);
}

/* ─── POPOVERS FLUTUANTES GERAIS ─────────────────────────────────────────── */
.tool-floating-popover {
  position: fixed;
  right: 60px;
  top: 60px;
  width: 300px;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 16px 36px -6px rgba(15, 23, 42, 0.22), 0 4px 14px -2px rgba(15, 23, 42, 0.08);
  border: 1px solid #e2e8f0;
  z-index: 3000; /* Acima da topbar para garantir visibilidade plena */
  overflow: hidden;
  animation: popover-drop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.calc-popover {
  width: 240px;
}

.wa-popover {
  width: 310px;
}

.doc-popover {
  width: 310px;
}

.shortcuts-popover {
  width: 280px;
}

.popover-header {
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.popover-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.wa-icon-header {
  color: #16a34a;
  font-size: 15px;
}

.doc-icon-header {
  color: #059669;
  font-size: 14px;
}

.calc-icon-header {
  color: #059669;
  font-size: 14px;
}

.shortcuts-icon-header {
  color: #64748b;
  font-size: 14px;
}

.popover-close-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.15s ease;
}

.popover-close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.popover-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Campos de Formulário nos Utilitários */
.tool-field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-label {
  font-size: 11px;
  font-weight: 600;
  color: #475569;
}

.tool-input-wrap {
  display: flex;
  align-items: center;
  position: relative;
}

.tool-input-prefix {
  position: absolute;
  left: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  pointer-events: none;
}

.tool-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 12.5px;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
  box-sizing: border-box;
}

.tool-input-with-prefix {
  padding-left: 38px;
}

.tool-input:focus {
  border-color: #059669;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
}

.tool-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 12px;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  resize: vertical;
  min-height: 50px;
  transition: border-color 0.15s ease, background 0.15s ease;
  box-sizing: border-box;
  font-family: inherit;
}

.tool-textarea:focus {
  border-color: #059669;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
}

/* Preview Box de WhatsApp */
.wa-preview-box {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wa-preview-label {
  font-size: 10px;
  font-weight: 700;
  color: #166534;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.wa-preview-url {
  font-size: 11px;
  color: #15803d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
}

/* Botões de Ação */
.tool-actions-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.tool-btn-primary {
  flex: 1;
  height: 32px;
  border-radius: 6px;
  background: #16a34a;
  color: #ffffff;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background 0.15s ease;
}

.tool-btn-primary:hover:not(:disabled) {
  background: #15803d;
}

.tool-btn-primary:disabled {
  background: #94a3b8;
  cursor: not-allowed;
  opacity: 0.6;
}

.tool-btn-secondary {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #1e293b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.15s ease;
}

.tool-btn-secondary:hover:not(:disabled) {
  background: #e2e8f0;
  color: #0f172a;
}

.tool-btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tool-btn-ghost {
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  gap: 4px;
  transition: all 0.15s ease;
}

.tool-btn-ghost:hover {
  background: #f1f5f9;
  color: #ef4444;
}

/* Badges de Status do Validador CPF/CNPJ */
.doc-status-container {
  display: flex;
  align-items: center;
}

.doc-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  width: 100%;
  box-sizing: border-box;
}

.doc-badge-valid {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}

.doc-badge-invalid {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.doc-badge-neutral {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.doc-results-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.doc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.doc-row-label {
  font-size: 11px;
  color: #64748b;
}

.doc-row-val {
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  color: #0f172a;
}

.doc-copy-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  transition: all 0.12s ease;
}

.doc-copy-btn:hover {
  background: #ecfdf5;
  color: #059669;
  border-color: #a7f3d0;
}

/* Calculadora */
.calc-display-area {
  padding: 10px 14px;
  background: #f1f5f9;
  text-align: right;
  border-bottom: 1px solid #e2e8f0;
}

.calc-history-expr {
  font-size: 11px;
  color: #64748b;
  min-height: 14px;
}

.calc-main-value {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  font-family: 'Consolas', 'Courier New', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calc-buttons-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 12px;
  background: #ffffff;
}

.calc-btn {
  height: 38px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #1e293b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
}

.calc-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.calc-btn:active {
  transform: scale(0.96);
}

.calc-op {
  background: #f8fafc;
  color: #059669;
  font-weight: 700;
}

.calc-op:hover {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}

.calc-op-clear {
  background: #fef2f2;
  color: #ef4444;
  border-color: #fecaca;
}

.calc-zero {
  grid-column: span 2;
}

.calc-equals {
  background: #059669;
  color: #ffffff;
  border-color: #059669;
}

.calc-equals:hover {
  background: #047857;
  border-color: #047857;
}

/* Atalhos Rápidos */
.shortcuts-list {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.shortcut-desc {
  font-size: 12px;
  color: #475569;
}

.shortcut-kbd {
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 2px 6px;
  color: #1e293b;
  box-shadow: 0 1px 0 #cbd5e1;
}

@keyframes popover-drop {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.tool-btn-collapse {
  color: #64748b;
}

.tool-btn-collapse:hover {
  background: #f1f5f9;
  color: #059669;
  border-color: #cbd5e1;
  transform: translateX(2px) scale(1.08);
}

/* ─── ABA LATERAL VERTICAL QUANDO RECOLHIDO ("Ferramentas" em pé) ─────────── */
.tools-collapsed-tab {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 3010;
  width: 22px;
  min-width: 22px;
  max-width: 22px;
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-right: none;
  border-radius: 6px 0 0 6px;
  box-shadow: -2px 0 8px rgba(15, 23, 42, 0.07);
  padding: 10px 0 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  cursor: pointer;
  user-select: none;
  touch-action: pan-y;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              background 0.18s ease,
              border-color 0.18s ease,
              color 0.18s ease,
              box-shadow 0.18s ease;
  outline: none;
  color: #475569;
}

.tools-collapsed-tab:hover {
  background: #f8fafc;
  color: #059669;
  border-color: #059669;
  transform: translateY(-50%) translateX(-3px);
  box-shadow: -3px 0 10px rgba(5, 150, 105, 0.18);
}

.tools-collapsed-tab.is-dragging {
  cursor: grabbing;
  background: #f0fdf4;
  color: #059669;
  border-color: #059669;
  transform: translateY(-50%) translateX(-5px);
}

.tab-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-size: 12px;
  line-height: 1;
  transition: transform 0.2s ease;
}

.tools-collapsed-tab:hover .tab-arrow {
  transform: translateX(-2px);
  color: #059669;
}

.tab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-size: 12px;
  line-height: 1;
}

.tab-label {
  writing-mode: vertical-rl;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: inherit;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tools-tab-slide-enter-active,
.tools-tab-slide-leave-active {
  transition: transform 0.12s cubic-bezier(0.2, 0, 0, 1), opacity 0.12s ease-out;
}

.tools-tab-slide-enter-from,
.tools-tab-slide-leave-to {
  transform: translateY(-50%) translateX(100%);
  opacity: 0;
}

@media (max-width: 768px) {
  .tools-sidebar,
  .tools-collapsed-tab {
    display: none !important;
  }
}
</style>
