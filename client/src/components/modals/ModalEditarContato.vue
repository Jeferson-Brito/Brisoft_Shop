<template>
  <Teleport to="body">
    <div class="modal-overlay active" @click.self="$emit('close')">
      <div class="modal-container" style="max-width:500px;">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:32px;height:32px;border-radius:50%;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:14px;">
              <i class="fa-solid fa-user-pen"></i>
            </div>
            <span class="modal-title">Editar Dados do Contato / Cliente</span>
          </div>
          <button type="button" class="btn-icon" @click="$emit('close')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form @submit.prevent="handleSave">
          <div class="modal-body">
            <div class="form-group">
              <label>Nome do Cliente *</label>
              <input v-model="form.name" type="text" required placeholder="Ex: Jeferson Brito" class="form-control" />
            </div>

            <div class="form-group">
              <label>Tipo de contato</label>
              <div class="contact-type-picker">
                <button type="button" :class="{ active: !form.is_employee }" @click="form.is_employee = false">
                  <i class="fa-solid fa-user"></i> Cliente
                </button>
                <button type="button" :class="{ active: form.is_employee }" @click="form.is_employee = true">
                  <i class="fa-solid fa-id-badge"></i> Funcionário
                </button>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label>Telefone / WhatsApp Real</label>
                <input v-model="form.phone" type="text" placeholder="Ex: (11) 98765-4321" class="form-control" />
              </div>
              <div class="form-group">
                <label>E-mail</label>
                <input v-model="form.email" type="email" placeholder="cliente@empresa.com.br" class="form-control" />
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label>CNPJ / CPF</label>
                <input v-model="form.cnpj" type="text" placeholder="12.345.678/0001-99" class="form-control" />
              </div>
              <div class="form-group">
                <label>Empresa / Razão Social</label>
                <input v-model="form.company" type="text" placeholder="Grupo Combate Segurança" class="form-control" />
              </div>
            </div>

            <div class="form-group">
              <label>Observação Interna</label>
              <textarea v-model="form.note" placeholder="Informações relevantes sobre este cliente..." rows="2" class="form-control" style="resize:none;"></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" @click="$emit('close')">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="loading">
              <i class="fa-solid fa-check" :class="{ 'fa-spin': loading }"></i> Salvar Dados
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { ticketsApi } from '@/api/tickets.api'
import { useUiStore } from '@/stores/ui.store'
import { useTicketStore } from '@/stores/tickets.store'

const props = defineProps({
  ticket: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'saved'])

const ui = useUiStore()
const ticketStore = useTicketStore()
const loading = ref(false)

const form = ref({
  name: props.ticket?.clientName || props.ticket?.client_name || '',
  phone: props.ticket?.contact?.phone || props.ticket?.phone || '',
  email: props.ticket?.contact?.email || '',
  cnpj: props.ticket?.contact?.cnpj || '',
  company: props.ticket?.contact?.company || '',
  note: typeof props.ticket?.contact?.notes === 'string'
    ? props.ticket.contact.notes
    : props.ticket?.contact?.notes?.[0]?.text || '',
  is_employee: Boolean(props.ticket?.is_employee)
})

async function handleSave() {
  loading.value = true
  try {
    const { data } = await ticketsApi.updateContact(props.ticket.id, form.value)
    if (data.success) {
      ui.showToast('Dados do contato atualizados com sucesso!')
      if (data.ticket) ticketStore.receiveTicket(data.ticket)
      ticketStore.notifyKpisUpdated()
      emit('saved', data.ticket || form.value)
      emit('close')
    } else {
      ui.showToast(`⚠️ ${data.error}`, 'error')
    }
  } catch (e) {
    ui.showToast(e.response?.data?.error || 'Não foi possível salvar os dados do contato.', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.contact-type-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  padding: 4px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.contact-type-picker button {
  border: 0;
  border-radius: 6px;
  padding: 8px;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.contact-type-picker button.active {
  background: #fff;
  color: #1d4ed8;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.1);
}
</style>
