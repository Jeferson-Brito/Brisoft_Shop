<template>
  <Teleport to="body">
    <div class="modal-overlay active" @click.self="$emit('close')">
      <div class="modal-container collaborator-modal">
        <div class="modal-header"><span class="modal-title">Participantes do atendimento</span><button class="btn-icon" @click="$emit('close')"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <p class="modal-help">Adicione outro atendente para acompanhar e responder esta conversa com você.</p>
          <input v-model="search" class="form-control" placeholder="Buscar atendente..." />
          <div v-if="loading" class="modal-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando equipe...</div>
          <div v-else class="people-list">
            <div v-for="person in filtered" :key="person.id" class="person-row">
              <span class="person-avatar"><img v-if="person.avatar_url" :src="person.avatar_url" alt="" /><b v-else>{{ initials(person.name) }}</b></span>
              <span class="person-copy"><strong>{{ person.name }}</strong><small>{{ person.role }}</small></span>
              <button v-if="isAdded(person.id)" class="btn-secondary danger" :disabled="busy === person.id" @click="remove(person)">Remover</button>
              <button v-else class="btn-primary" :disabled="busy === person.id" @click="add(person)">Adicionar</button>
            </div>
            <div v-if="filtered.length === 0" class="modal-state">Nenhum usuário encontrado.</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { ticketsApi } from '@/api/tickets.api'
import { useUiStore } from '@/stores/ui.store'
const props = defineProps({ ticket: { type: Object, required: true } })
const emit = defineEmits(['close', 'updated'])
const ui = useUiStore(), loading = ref(true), busy = ref(null), search = ref(''), users = ref([]), collaborators = ref([])
const filtered = computed(() => { const q=search.value.trim().toLowerCase(); return users.value.filter(p => !q || `${p.name} ${p.role}`.toLowerCase().includes(q)) })
const initials = name => (name || 'U').split(' ').slice(0,2).map(v=>v[0]).join('').toUpperCase()
const isAdded = id => collaborators.value.some(p => String(p.id) === String(id))
async function load(){ loading.value=true; try{ const {data}=await ticketsApi.collaborators(props.ticket.id); if(!data.success) throw new Error(data.error); users.value=data.users||[]; collaborators.value=data.collaborators||[] }catch(e){ui.showToast(e.response?.data?.error||e.message,'error')}finally{loading.value=false} }
async function add(person){busy.value=person.id;try{const{data}=await ticketsApi.addCollaborator(props.ticket.id,person.id);if(!data.success)throw new Error(data.error);collaborators.value=data.collaborators||[...collaborators.value,person];emit('updated',collaborators.value);ui.showToast(`${person.name} foi adicionado ao atendimento.`)}catch(e){ui.showToast(e.response?.data?.error||e.message,'error')}finally{busy.value=null}}
async function remove(person){busy.value=person.id;try{const{data}=await ticketsApi.removeCollaborator(props.ticket.id,person.id);if(!data.success)throw new Error(data.error);collaborators.value=collaborators.value.filter(p=>p.id!==person.id);emit('updated',collaborators.value)}catch(e){ui.showToast(e.response?.data?.error||e.message,'error')}finally{busy.value=null}}
onMounted(load)
</script>
<style scoped>
.collaborator-modal{max-width:500px}.modal-help{font-size:12px;color:#64748b;margin:0 0 12px}.people-list{margin-top:12px;max-height:340px;overflow:auto}.person-row{display:flex;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid #edf2f7}.person-avatar{width:36px;height:36px;border-radius:50%;overflow:hidden;background:#dbeafe;color:#1d4ed8;display:grid;place-items:center;font-size:11px}.person-avatar img{width:100%;height:100%;object-fit:cover}.person-copy{display:flex;flex-direction:column;flex:1}.person-copy strong{font-size:12.5px;color:#0f172a}.person-copy small{font-size:10.5px;color:#64748b}.person-row button{font-size:11px;padding:6px 9px}.person-row .danger{color:#dc2626}.modal-state{text-align:center;color:#64748b;font-size:12px;padding:24px}
</style>
