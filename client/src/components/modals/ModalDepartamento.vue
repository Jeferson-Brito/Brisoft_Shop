<template>
  <Teleport to="body">
    <div class="modal-overlay active" id="modalNovoDepartamento" @click.self="$emit('close')">
      <div class="modal-container department-modal">
        <div class="modal-header">
          <span class="modal-title">{{ isEditing ? 'Editar departamento' : 'Novo departamento' }}</span>
          <button type="button" class="btn-icon" @click="$emit('close')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="modal-body">
            <div class="form-group">
              <label>Nome do Departamento *</label>
              <input v-model="name" type="text" required placeholder="Ex: Suporte Técnico" class="form-control" />
            </div>

            <div class="form-group">
              <label>Cor de Identificação</label>
              <div style="display:flex;align-items:center;gap:10px;">
                <input v-model="color" type="color" style="width:40px;height:36px;border:none;cursor:pointer;border-radius:4px;" />
                <input v-model="color" type="text" class="form-control" style="flex:1;font-family:monospace;" />
              </div>
            </div>

            <div class="form-group">
              <label>Descrição (opcional)</label>
              <textarea v-model="description" placeholder="Objetivo ou escopo de atendimento..." rows="2" class="form-control" style="resize:none;"></textarea>
            </div>

            <div class="form-group">
              <label>Meta de SLA (minutos)</label>
              <input v-model.number="slaTargetMinutes" type="number" min="1" max="1440" class="form-control" />
              <small>Tempo esperado para o primeiro atendimento deste departamento.</small>
            </div>

            <label class="permission-card">
              <input v-model="allowDeviceMessageMutations" type="checkbox" />
              <span>
                <strong>Editar e excluir mensagens enviadas pelo celular</strong>
                <small>Permite que os atendentes deste departamento alterem mensagens disparadas diretamente no aparelho conectado. Recomendado apenas quando o WhatsApp não é compartilhado por várias pessoas.</small>
              </span>
            </label>

            <section class="hours-card">
              <div class="hours-heading">
                <span><strong>Horário de funcionamento</strong><small>Fora desse período, o bot reserva a conversa sem contar o tempo nos indicadores.</small></span>
                <label class="hours-mode"><input :checked="businessHours.enabled" type="checkbox" @change="toggleCustomHours($event.target.checked)" /> Horário personalizado</label>
              </div>
              <div v-if="!businessHours.enabled" class="hours-24"><i class="fa-solid fa-clock"></i> Atendimento 24 horas</div>
              <div v-else class="hours-days">
                <div v-for="day in weekDays" :key="day.key" class="hours-day" :class="{ disabled: !dayEnabled(day.key) }">
                  <label class="day-toggle"><input :checked="dayEnabled(day.key)" type="checkbox" @change="toggleDay(day.key, $event.target.checked)" /> {{ day.label }}</label>
                  <template v-if="dayEnabled(day.key)">
                    <div class="time-range"><input v-model="businessHours.days[day.key][0].start" type="time" /><span>às</span><input v-model="businessHours.days[day.key][0].end" type="time" /></div>
                    <button v-if="businessHours.days[day.key].length === 1" type="button" class="lunch-btn" @click="addLunchReturn(day.key)"><i class="fa-solid fa-plus"></i> Intervalo</button>
                    <div v-else class="time-range second"><input v-model="businessHours.days[day.key][1].start" type="time" /><span>às</span><input v-model="businessHours.days[day.key][1].end" type="time" /><button type="button" title="Remover intervalo" @click="businessHours.days[day.key].splice(1, 1)"><i class="fa-solid fa-xmark"></i></button></div>
                  </template>
                  <span v-else class="closed-day">Fechado</span>
                </div>
              </div>
              <div v-if="businessHours.enabled" class="form-group after-hours-field">
                <label>Mensagem fora do expediente (opcional)</label>
                <textarea v-model="afterHoursMessage" rows="3" class="form-control" placeholder="Deixe em branco para usar a mensagem padrão."></textarea>
                <small>Variáveis disponíveis: {nome}, {departamento}, {horario} e {proxima_abertura}.</small>
              </div>
            </section>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" @click="$emit('close')">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="loading">
              <i class="fa-solid" :class="loading ? 'fa-spinner fa-spin' : 'fa-check'"></i> {{ loading ? 'Salvando...' : (isEditing ? 'Salvar alterações' : 'Criar departamento') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'

const emit = defineEmits(['close', 'saved'])
const props = defineProps({ department: { type: Object, default: null } })

const settingsStore = useSettingsStore()
const ui = useUiStore()

const isEditing = computed(() => Boolean(props.department?.id))
const name = ref(props.department?.name || '')
const color = ref(props.department?.color || '#2563eb')
const description = ref(props.department?.description || '')
const slaTargetMinutes = ref(Number(props.department?.sla_target_minutes) || 15)
const allowDeviceMessageMutations = ref(props.department?.allow_device_message_mutations === true)
const weekDays = [
  { key: '1', label: 'Segunda' }, { key: '2', label: 'Terça' }, { key: '3', label: 'Quarta' },
  { key: '4', label: 'Quinta' }, { key: '5', label: 'Sexta' }, { key: '6', label: 'Sábado' }, { key: '0', label: 'Domingo' }
]
function initialHours(value) {
  const source = value && typeof value === 'object' ? value : {}
  const days = {}
  for (let day = 0; day < 7; day += 1) days[String(day)] = Array.isArray(source.days?.[day]) ? source.days[day].map(item => ({ ...item })) : []
  return { enabled: source.enabled === true, timezone: source.timezone || 'America/Sao_Paulo', days }
}
const businessHours = ref(initialHours(props.department?.business_hours))
const afterHoursMessage = ref(props.department?.after_hours_message || '')
const loading = ref(false)

function dayEnabled(key) { return businessHours.value.days[key]?.length > 0 }
function toggleCustomHours(enabled) {
  businessHours.value.enabled = enabled
  if (enabled && !Object.values(businessHours.value.days).some(intervals => intervals.length)) {
    for (const key of ['1', '2', '3', '4', '5']) businessHours.value.days[key] = [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }]
  }
}
function toggleDay(key, enabled) { businessHours.value.days[key] = enabled ? [{ start: '08:00', end: '18:00' }] : [] }
function addLunchReturn(key) {
  businessHours.value.days[key] = [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }]
}

async function handleSubmit() {
  if (!name.value.trim()) return
  loading.value = true
  try {
    const res = await settingsStore.saveDepartment({
      ...(props.department?.id ? { id: props.department.id } : {}),
      name: name.value.trim(),
      color: color.value,
      description: description.value.trim(),
      sla_target_minutes: slaTargetMinutes.value,
      allow_device_message_mutations: allowDeviceMessageMutations.value,
      business_hours: businessHours.value,
      after_hours_message: afterHoursMessage.value.trim(),
      ...(props.department?.sort_order ? { sort_order: props.department.sort_order } : {})
    })
    if (res.success) {
      ui.showToast(isEditing.value ? 'Departamento atualizado com sucesso!' : 'Departamento criado com sucesso!')
      emit('saved')
      emit('close')
    } else {
      ui.showToast(`⚠️ ${res.error}`, 'error')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.department-modal { max-width: 720px; max-height: min(92vh, 860px); overflow: auto; }
.permission-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dbe3ee;
  border-radius: 9px;
  background: #f8fafc;
  cursor: pointer;
}
.permission-card input { width: 16px; height: 16px; margin-top: 2px; accent-color: #2563eb; }
.permission-card span { display: grid; gap: 4px; }
.permission-card strong { color: #1e293b; font-size: 12px; line-height: 1.35; }
.permission-card small { color: #64748b; font-size: 10.5px; line-height: 1.45; }
.hours-card { margin-top: 14px; border: 1px solid #dbe3ee; border-radius: 10px; overflow: hidden; }
.hours-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px; background: #f8fafc; }
.hours-heading > span { display: grid; gap: 3px; }
.hours-heading strong { color: #1e293b; font-size: 12px; }
.hours-heading small, .after-hours-field small { color: #64748b; font-size: 10.5px; line-height: 1.4; }
.hours-mode { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 11px; font-weight: 600; color: #334155; }
.hours-mode input, .day-toggle input { accent-color: #2563eb; }
.hours-24 { display: flex; align-items: center; gap: 8px; padding: 14px; color: #047857; background: #f0fdf4; font-size: 12px; font-weight: 600; }
.hours-days { padding: 6px 12px; }
.hours-day { min-height: 42px; display: grid; grid-template-columns: 92px minmax(205px, 1fr) auto; align-items: center; gap: 8px; border-bottom: 1px solid #eef2f7; }
.hours-day:last-child { border-bottom: 0; }
.day-toggle { display: flex; align-items: center; gap: 6px; color: #334155; font-size: 11px; font-weight: 600; }
.time-range { display: flex; align-items: center; gap: 6px; }
.time-range input { min-width: 92px; border: 1px solid #dbe3ee; border-radius: 6px; padding: 6px; color: #334155; background: #fff; }
.time-range span, .closed-day { color: #94a3b8; font-size: 10.5px; }
.time-range.second { grid-column: 2; padding-bottom: 7px; }
.time-range.second button, .lunch-btn { border: 0; background: transparent; color: #2563eb; font-size: 10.5px; cursor: pointer; }
.time-range.second button { color: #ef4444; }
.after-hours-field { margin: 0; padding: 12px; border-top: 1px solid #e2e8f0; background: #f8fafc; }
.after-hours-field textarea { resize: vertical; }
@media (max-width: 640px) {
  .department-modal { width: calc(100vw - 20px); max-height: calc(100vh - 20px); }
  .hours-heading { align-items: flex-start; flex-direction: column; }
  .hours-day { grid-template-columns: 1fr; gap: 6px; padding: 9px 0; }
  .time-range.second { grid-column: 1; }
  .lunch-btn { justify-self: start; }
}
</style>
