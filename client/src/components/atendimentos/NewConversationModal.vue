<template>
  <Teleport to="body">
    <div class="modal-overlay active" @click.self="emit('close')">
      <div class="modal-container conversation-modal">
        <div class="modal-header">
          <div>
            <span class="modal-title">Iniciar nova conversa</span>
            <p>Escolha um contato para abrir um atendimento pelo WhatsApp.</p>
          </div>
          <button type="button" class="btn-icon" title="Fechar" @click="emit('close')"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="conversation-controls">
          <div v-if="departments.length > 1" class="department-select">
            <label>Departamento do atendimento</label>
            <select v-model="departmentId">
              <option value="" disabled>Selecione o departamento</option>
              <option v-for="department in departments" :key="department.id" :value="department.id">{{ department.name }}</option>
            </select>
          </div>

          <div class="conversation-tabs">
            <button :class="{ active: contactType === 'customers' }" @click="contactType = 'customers'">
              Clientes <span>{{ customerCount }}</span>
            </button>
            <button :class="{ active: contactType === 'employees' }" @click="contactType = 'employees'">
              Funcionários <span>{{ employeeCount }}</span>
            </button>
          </div>

          <div class="conversation-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input v-model="search" autofocus type="text" placeholder="Nome, WhatsApp, e-mail, CPF ou CNPJ..." />
            <button v-if="search" type="button" @click="search = ''"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>

        <div class="conversation-list">
          <div v-if="loading" class="conversation-state"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando contatos...</div>
          <div v-else-if="filteredContacts.length === 0" class="conversation-state">
            <i class="fa-regular fa-address-book"></i>
            <strong>Cliente não encontrado ou funcionário não encontrado!</strong>
            <span>Cadastre ou importe contatos com um número de WhatsApp.</span>
          </div>
          <template v-else>
            <button
              v-for="contact in filteredContacts"
              :key="contact.id"
              type="button"
              class="conversation-contact"
              :disabled="startingId === contact.id"
              @click="startConversation(contact)"
            >
              <span class="conversation-avatar" :style="{ background: contactAvatarUrl(contact) && !failedAvatars[contact.id] ? 'transparent' : avatarColor(contact.name) }">
                <img
                  v-if="contactAvatarUrl(contact) && !failedAvatars[contact.id]"
                  :src="contactAvatarUrl(contact)"
                  alt=""
                  class="conversation-avatar-img"
                  referrerpolicy="no-referrer"
                  @error="failedAvatars[contact.id] = true"
                />
                <span v-else>{{ initials(contact.name) }}</span>
              </span>
              <span class="conversation-contact-info">
                <strong>{{ contact.name }}</strong>
                <small><i class="fa-brands fa-whatsapp"></i> {{ formatPhone(contact.phone) }}<template v-if="contact.email"> • {{ contact.email }}</template></small>
                <small v-if="contact.cnpj">CPF/CNPJ: {{ contact.cnpj }}</small>
              </span>
              <span class="conversation-start-icon">
                <i :class="startingId === contact.id ? 'fa-solid fa-circle-notch fa-spin' : 'fa-solid fa-arrow-right'"></i>
              </span>
            </button>
          </template>
        </div>

        <div class="modal-footer">
          <span>Somente contatos ativos com WhatsApp são exibidos.</span>
          <button type="button" class="btn-secondary" @click="emit('close')">Cancelar</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/api/http'
import { ticketsApi } from '@/api/tickets.api'
import { useTicketStore } from '@/stores/tickets.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { formatPhone } from '@/utils/formatters'

const emit = defineEmits(['close', 'started'])
const ticketStore = useTicketStore()
const settingsStore = useSettingsStore()
const auth = useAuthStore()
const ui = useUiStore()

const contacts = ref([])
const loading = ref(true)
const search = ref('')
const contactType = ref('customers')
const departmentId = ref(auth.departmentId || '')
const startingId = ref(null)

const departments = computed(() => settingsStore.departments || [])
const customerCount = computed(() => contacts.value.filter(contact => !contact.is_employee && usable(contact)).length)
const employeeCount = computed(() => contacts.value.filter(contact => contact.is_employee && usable(contact)).length)

function usable(contact) {
  return contact?.status !== 'Inativo' && String(contact?.phone || '').replace(/\D/g, '').length >= 10
}

const filteredContacts = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('pt-BR')
  return contacts.value.filter(contact => {
    if (!usable(contact)) return false
    if (contactType.value === 'employees' ? !contact.is_employee : contact.is_employee) return false
    if (!term) return true
    return [contact.name, contact.phone, contact.email, contact.cnpj, contact.notes]
      .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term))
  }).slice(0, 100)
})

const failedAvatars = ref({})
const avatarColors = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626', '#0891b2']

function avatarColor(name) {
  const hash = [...String(name || 'CL')].reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

function contactAvatarUrl(contact) {
  if (contact?.avatar_url) return contact.avatar_url
  if (contact?.photo_url) return contact.photo_url
  const phone = String(contact?.phone || '').replace(/\D/g, '')
  const match = (ticketStore.tickets || []).find(t => {
    const tPhone = String(t.phone || '').replace(/\D/g, '')
    return (phone && tPhone.endsWith(phone.slice(-8))) || (t.contact_id && String(t.contact_id) === String(contact.id))
  })
  return match?.avatar_url || null
}

function initials(name) {
  return String(name || 'CL').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

async function startConversation(contact) {
  if (!departmentId.value) {
    ui.showToast('Selecione o departamento do atendimento.', 'error')
    return
  }
  startingId.value = contact.id
  try {
    const { data } = await ticketsApi.startConversation(contact.id, departmentId.value)
    if (!data.success || !data.ticket) throw new Error(data.error || 'Não foi possível iniciar a conversa.')
    ticketStore.receiveTicket(data.ticket)
    await ticketStore.selectTicket(data.ticket.id)
    ui.showToast(data.existing ? 'Conversa existente aberta.' : 'Nova conversa aberta. Digite a primeira mensagem.')
    emit('started', data.ticket)
    emit('close')
  } catch (error) {
    ui.showToast(error.response?.data?.error || error.message || 'Não foi possível iniciar a conversa.', 'error')
  } finally {
    startingId.value = null
  }
}

onMounted(async () => {
  try {
    await settingsStore.fetchDepartments()
    if (!departmentId.value) departmentId.value = departments.value[0]?.id || ''
    const { data } = await api.get('/contacts')
    contacts.value = data.contacts || []
  } catch (error) {
    ui.showToast('Não foi possível carregar os contatos.', 'error')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.conversation-modal {
  width: min(520px, calc(100vw - 24px));
  max-width: 520px;
  max-height: min(700px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
}

.modal-header p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 11px;
}

.conversation-controls {
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--border-color);
  display: grid;
  gap: 10px;
}

.department-select {
  display: grid;
  gap: 4px;
}

.department-select label {
  color: var(--text-muted);
  font-size: 10.5px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.department-select select {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #d7dce2;
  border-radius: 6px;
  background: #ffffff;
  color: var(--text-main);
  font-size: 12.5px;
  outline: none;
}

.department-select select:focus {
  border-color: var(--brand-primary);
}

.conversation-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border-radius: 6px;
  background: #f1f3f6;
  gap: 3px;
}

.conversation-tabs button {
  border: none;
  border-radius: 5px;
  padding: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.conversation-tabs button.active {
  background: #ffffff;
  color: var(--brand-primary);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
}

.conversation-tabs span {
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #e2e8f0;
  font-size: 9.5px;
}

.conversation-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid #d7dce2;
  border-radius: 6px;
  color: var(--text-light);
  background: #ffffff;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.conversation-search:focus-within {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(31, 98, 208, 0.09);
}

.conversation-search input {
  min-width: 0;
  flex: 1;
  padding: 8px 0;
  border: none;
  outline: none;
  color: var(--text-main);
  font-size: 12.5px;
}

.conversation-search button {
  border: none;
  background: none;
  color: var(--text-light);
  cursor: pointer;
  padding: 4px;
}

.conversation-list {
  min-height: 220px;
  max-height: 340px;
  overflow-y: auto;
  padding: 6px 8px;
}

.conversation-contact {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  border-bottom: 1px solid #f1f5f9;
  border-radius: 6px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.conversation-contact:hover {
  background: #f8fafc;
}

.conversation-contact:disabled {
  opacity: 0.65;
  cursor: wait;
}

.conversation-avatar {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--brand-primary);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  position: relative;
}

.conversation-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.conversation-contact-info {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;
}

.conversation-contact-info strong {
  overflow: hidden;
  color: var(--text-main);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-contact-info small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-contact-info .fa-whatsapp {
  color: #168a52;
}

.conversation-start-icon {
  color: var(--brand-primary);
  font-size: 11px;
}

.conversation-state {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-light);
  font-size: 12px;
  text-align: center;
}

.conversation-state > i {
  font-size: 22px;
}

.conversation-state strong {
  color: var(--text-muted);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-footer span {
  margin-right: auto;
  color: var(--text-muted);
  font-size: 10px;
}

@media (max-width: 520px) {
  .modal-footer span {
    display: none;
  }
}
</style>
