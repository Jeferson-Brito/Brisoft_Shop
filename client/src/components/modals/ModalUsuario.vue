<template>
  <Teleport to="body">
    <div class="modal-overlay active" id="modalNovoUsuario" @click.self="$emit('close')">
      <div class="modal-container" style="max-width:520px;">
        <div class="modal-header">
          <span class="modal-title">{{ editingUser ? 'Editar Usuário' : 'Novo Usuário' }}</span>
          <button type="button" class="btn-icon" @click="$emit('close')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="modal-body">
            <!-- Avatar Preview -->
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:4px;">
              <div
                style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0;"
                :style="{ background: formData.role === 'Administrador' ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)' }"
              >
                <img v-if="formData.avatar_url" :src="formData.avatar_url" alt="Foto do usuário" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />
                <span v-else>{{ initials }}</span>
              </div>
              <div style="flex:1;">
                <label style="font-size:11px;font-weight:600;color:#64748b;display:block;margin-bottom:4px;">Foto de perfil (opcional)</label>
                <label class="btn-secondary" style="display:inline-flex;cursor:pointer;font-size:11px;padding:6px 9px;">Escolher arquivo<input type="file" accept="image/jpeg,image/png,image/webp" hidden @change="choosePhoto" /></label>
                <button v-if="formData.avatar_url" type="button" style="border:0;background:none;color:#dc2626;font-size:11px;cursor:pointer;margin-left:7px;" @click="formData.avatar_url = null">Remover</button>
              </div>
            </div>

            <!-- Nome + E-mail -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label>Nome Completo *</label>
                <input v-model="formData.name" type="text" required placeholder="João Silva" class="form-control" />
              </div>
              <div class="form-group">
                <label>E-mail de Acesso *</label>
                <input v-model="formData.email" type="email" required placeholder="joao@minhaloja.com.br" class="form-control" />
              </div>
            </div>

            <!-- Senha -->
            <div class="form-group">
              <label>
                {{ editingUser ? 'Nova Senha (deixe em branco para manter a atual)' : 'Senha de Acesso *' }}
              </label>
              <div style="position:relative;display:flex;align-items:center;">
                <input
                  v-model="formData.password"
                  :type="showPassword ? 'text' : 'password'"
                  :required="!editingUser" minlength="12" maxlength="128" autocomplete="new-password"
                  placeholder="••••••••"
                  class="form-control"
                  style="padding-right:38px;width:100%;"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  :title="showPassword ? 'Ocultar senha' : 'Exibir senha'"
                  tabindex="-1"
                  style="position:absolute;right:10px;background:none;border:none;color:#64748b;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;font-size:14px;"
                >
                  <i :class="showPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
                </button>
              </div>
            </div>

            <!-- Cargo / Função -->
            <div class="form-group">
              <label>Cargo / Função</label>
              <input
                v-model="formData.cargo"
                type="text"
                placeholder="Ex: Operador de caixa, Açougueiro, Gerente..."
                class="form-control"
              />
              <small style="display:block;margin-top:4px;color:#64748b;font-size:11px;">
                Título profissional que será exibido nas conversas, fila e perfil.
              </small>
            </div>

            <!-- Perfil + Departamento -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label>Papel / Perfil *</label>
                <select v-model="formData.role" required class="form-control" :disabled="!auth.isAdmin">
                  <option value="Administrador">Administrador (acesso total)</option>
                  <option value="Supervisor">Supervisor de departamento</option>
                  <option value="Analista">Analista / Atendente</option>
                </select>
              </div>
              <div class="form-group">
                <label>Acesso aos departamentos</label>
                <small>{{ formData.role === 'Administrador' ? 'Todos os departamentos da loja.' : 'Selecione os setores autorizados abaixo.' }}</small>
              </div>
            </div>
            <div v-if="formData.role !== 'Administrador'" class="form-group">
              <label>Departamentos autorizados *</label>
              <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:10px;border:1px solid #cbd5e1;border-radius:7px;">
                <label v-for="d in settingsStore.departments.filter(d => d.active || formData.department_ids.includes(d.id))" :key="d.id" style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;">
                  <input v-model="formData.department_ids" type="checkbox" :value="d.id" /> {{ d.name }}{{ d.active ? '' : ' (inativo)' }}
                </label>
              </div>
              <small style="display:block;margin-top:5px;color:#64748b;">Acesso às conversas dos setores selecionados. Cadastros e acessos são administrados pelo administrador da loja.</small>
            </div>

            <!-- Telefone + Status -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label>Telefone / WhatsApp</label>
                <input v-model="formData.phone" type="text" placeholder="(11) 99999-9999" class="form-control" />
              </div>
              <div class="form-group">
                <label>Status da Conta</label>
                <select v-model="formData.is_active" class="form-control">
                  <option :value="true">Ativo</option>
                  <option :value="false">Inativo</option>
                </select>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" @click="$emit('close')">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="loading">
              <i class="fa-solid fa-check" :class="{ 'fa-spin': loading }"></i>
              {{ editingUser ? 'Salvar Alterações' : 'Criar Usuário' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useShopStore } from '@/stores/shop.store'
import { usersApi } from '@/api/users.api'
import { useUiStore } from '@/stores/ui.store'
import { useAuthStore } from '@/stores/auth.store'
import { prepareAvatar } from '@/utils/avatar-upload'

const props = defineProps({
  editingUser: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const settingsStore = useShopStore()
const ui = useUiStore()
const auth = useAuthStore()
const loading = ref(false)
const showPassword = ref(false)

const formData = ref({
  name: props.editingUser?.name || '',
  email: props.editingUser?.email || '',
  password: '',
  role: props.editingUser?.role === 'Atendente' ? 'Analista' : props.editingUser?.role || 'Analista',
  cargo: props.editingUser?.cargo || '',
  department_id: props.editingUser?.department_id || props.editingUser?.department_ids?.[0] || null,
  department_ids: props.editingUser?.department_ids || [props.editingUser?.department_id].filter(Boolean),
  phone: props.editingUser?.phone || '',
  avatar_url: props.editingUser?.avatar_url || '',
  is_active: props.editingUser ? props.editingUser.is_active !== false : true
})

const initials = computed(() => {
  const name = formData.value.name || 'U'
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
})

async function choosePhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try { formData.value.avatar_url = await prepareAvatar(file) }
  catch (error) { ui.showToast(error.message, 'error') }
}

async function handleSubmit() {
  loading.value = true
  try {
    const payload = {
      ...formData.value,
      ...(props.editingUser ? {version:props.editingUser.version} : {}),
      cargo: formData.value.cargo ? formData.value.cargo.trim() : null
    }
    if (payload.role === 'Administrador') payload.department_ids = []
    else if (!payload.department_ids.length) return ui.showToast('Selecione ao menos um departamento.', 'error')
    payload.department_id = payload.department_ids[0] || null
    if (!payload.password) delete payload.password

    let res
    if (props.editingUser) {
      res = await usersApi.update(props.editingUser.id, payload)
    } else {
      res = await usersApi.create(payload)
    }

    if (res.data.success) {
      ui.showToast(props.editingUser ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!')
      emit('saved')
      emit('close')
    } else {
      ui.showToast(`⚠️ ${res.data.error}`, 'error')
    }
  } catch (e) {
    ui.showToast(e.response?.data?.error || 'Erro ao salvar usuário', 'error')
  } finally {
    loading.value = false
  }
}
</script>
