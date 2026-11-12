<template>
  <div class="profile-page">
    <form class="profile-card" @submit.prevent="save">
      <div class="profile-heading">
        <div class="photo-wrap">
          <img v-if="form.avatar_url" :src="form.avatar_url" alt="Foto do perfil" />
          <span v-else>{{ initials }}</span>
        </div>
        <div>
          <h2>{{ form.name || auth.user?.name || 'Perfil' }}</h2>
          <p>Atualize seus dados pessoais e sua foto.</p>
          <div class="photo-actions">
            <label class="btn-secondary">Escolher foto<input type="file" accept="image/jpeg,image/png,image/webp" hidden @change="choosePhoto" /></label>
            <button v-if="form.avatar_url" type="button" class="link-danger" @click="form.avatar_url = null">Remover</button>
          </div>
        </div>
      </div>

      <div class="grid">
        <label>Nome e sobrenome<input v-model="form.name" class="form-control" required /></label>
        <label>Cargo / Função<input v-model="form.cargo" class="form-control" placeholder="Ex: Analista de Suporte, Supervisor de TI..." /></label>
        <label>E-mail de login<input :value="auth.user?.email || ''" class="form-control locked" disabled /><small>O e-mail de acesso não pode ser alterado.</small></label>
        <label>
          Telefone
          <input
            v-model="form.phone"
            type="tel"
            class="form-control"
            placeholder="(00) 90000-0000"
            maxlength="15"
            autocomplete="tel"
            @input="onPhoneInput"
            @keypress="onlyAllowDigits"
          />
        </label>
        <label>
          Departamento
          <input
            :value="auth.departmentName || auth.user?.department_name || ''"
            class="form-control locked"
            disabled
            placeholder="Não informado"
          />
        </label>
      </div>

      <div class="password-box">
        <h3>Alterar senha</h3>
        <p>Deixe os campos abaixo vazios para manter a senha atual.</p>
        <div class="grid three">
          <label>
            Senha atual
            <div class="password-input-wrapper">
              <input
                v-model="form.current_password"
                :type="showCurrentPassword ? 'text' : 'password'"
                class="form-control"
                autocomplete="current-password"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="password-toggle-btn"
                @click="showCurrentPassword = !showCurrentPassword"
                :title="showCurrentPassword ? 'Ocultar senha' : 'Exibir senha'"
                tabindex="-1"
              >
                <i :class="showCurrentPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
              </button>
            </div>
          </label>

          <label>
            Nova senha
            <div class="password-input-wrapper">
              <input
                v-model="form.new_password"
                :type="showNewPassword ? 'text' : 'password'"
                class="form-control"
                autocomplete="new-password"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="password-toggle-btn"
                @click="showNewPassword = !showNewPassword"
                :title="showNewPassword ? 'Ocultar senha' : 'Exibir senha'"
                tabindex="-1"
              >
                <i :class="showNewPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
              </button>
            </div>
          </label>

          <label>
            Confirmar nova senha
            <div class="password-input-wrapper">
              <input
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                class="form-control"
                autocomplete="new-password"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="password-toggle-btn"
                @click="showConfirmPassword = !showConfirmPassword"
                :title="showConfirmPassword ? 'Ocultar senha' : 'Exibir senha'"
                tabindex="-1"
              >
                <i :class="showConfirmPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
              </button>
            </div>
          </label>
        </div>
      </div>

      <div class="actions"><button class="btn-primary" :disabled="saving">{{ saving ? 'Salvando...' : 'Salvar alterações' }}</button></div>
    </form>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { authApi } from '@/api/auth.api'
import { prepareAvatar } from '@/utils/avatar-upload'

const auth = useAuthStore()
const ui = useUiStore()
const saving = ref(false)
const confirmPassword = ref('')
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

function sanitizeInitialPhone(raw) {
  if (!raw || typeof raw !== 'string') return ''
  if (raw.includes('@')) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return ''
  return formatPhoneInput(digits)
}

function onlyAllowDigits(e) {
  if (!/\d/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
    e.preventDefault()
  }
}

function formatPhoneInput(val) {
  if (!val) return ''
  if (typeof val === 'string' && val.includes('@')) return ''
  let digits = String(val).replace(/\D/g, '')

  if (digits.startsWith('55') && digits.length === 13) {
    digits = digits.slice(2)
  }
  digits = digits.slice(0, 11)

  // O 9 na frente após o DDD (posição 2, 3º dígito) é obrigatório
  if (digits.length >= 3) {
    if (digits[2] !== '9') {
      if (digits.length === 10) {
        // Injeta o 9 caso venha 10 dígitos (DDD + 8 dígitos)
        digits = digits.slice(0, 2) + '9' + digits.slice(2)
      } else {
        // Se usuário digitou número diferente de 9 no 3º dígito, rejeita esse dígito
        digits = digits.slice(0, 2)
      }
    }
  }

  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

function onPhoneInput(e) {
  form.phone = formatPhoneInput(e.target.value)
}

const form = reactive({
  name: auth.user?.name || '',
  cargo: auth.user?.cargo || '',
  phone: sanitizeInitialPhone(auth.user?.phone),
  avatar_url: auth.user?.avatar_url || null,
  current_password: '',
  new_password: ''
})

watch(() => auth.user, (u) => {
  if (u) {
    if (!form.name) form.name = u.name || ''
    if (!form.cargo && u.cargo) form.cargo = u.cargo || ''
    if (!form.phone && u.phone) form.phone = sanitizeInitialPhone(u.phone)
    if (form.avatar_url === null && u.avatar_url) form.avatar_url = u.avatar_url
  }
}, { deep: true })

const initials = computed(() => (form.name || auth.user?.name || 'U').split(' ').slice(0, 2).map(v => v[0]).join('').toUpperCase())

async function choosePhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try { form.avatar_url = await prepareAvatar(file) } catch (error) { ui.showToast(error.message, 'error') }
}

async function save() {
  if (form.phone) {
    const digits = form.phone.replace(/\D/g, '')
    if (digits.length !== 11 || digits[2] !== '9') {
      return ui.showToast('Informe o telefone completo no formato (00) 90000-0000 com o 9 na frente.', 'error')
    }
  }
  if (form.new_password !== confirmPassword.value) return ui.showToast('A confirmação da nova senha não confere.', 'error')
  saving.value = true
  auth.suppressUnauthorizedLogout()
  try {
    const payload = {
      ...form,
      cargo: form.cargo ? form.cargo.trim() : null,
      phone: form.phone ? form.phone.trim() : null
    }
    const { data } = await authApi.updateProfile(payload)
    if (!data.success) throw new Error(data.error)
    auth.setSession(data.token, data.user)
    form.cargo = data.user?.cargo || ''
    form.phone = sanitizeInitialPhone(data.user?.phone)
    form.current_password = ''
    form.new_password = ''
    confirmPassword.value = ''
    ui.showToast('Perfil atualizado com sucesso!')
  } catch (error) { ui.showToast(error.response?.data?.error || error.message || 'Não foi possível atualizar o perfil.', 'error') }
  finally { saving.value = false }
}
</script>

<style scoped>
.profile-page{padding:20px 20px 40px;max-width:980px;margin:0 auto;width:100%;height:100%;overflow-y:auto;box-sizing:border-box}.profile-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.04)}.profile-heading{display:flex;align-items:center;gap:18px;padding-bottom:22px;border-bottom:1px solid #e2e8f0}.profile-heading h2{margin:0;color:#0f172a;font-size:20px}.profile-heading p,.password-box p{margin:4px 0 10px;color:#64748b;font-size:12px}.photo-wrap{width:82px;height:82px;border-radius:50%;overflow:hidden;background:#e8f0ff;color:#1f62d0;display:grid;place-items:center;font-size:22px;font-weight:800}.photo-wrap img{width:100%;height:100%;object-fit:cover}.photo-actions{display:flex;align-items:center;gap:12px}.photo-actions .btn-secondary{cursor:pointer;padding:7px 11px;font-size:12px}.link-danger{border:0;background:none;color:#dc2626;cursor:pointer;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px}.grid.three{grid-template-columns:repeat(3,1fr);margin-top:14px}.grid label{font-size:12px;font-weight:650;color:#334155}.form-control{display:block;width:100%;box-sizing:border-box;margin-top:6px}.form-control.locked{background:#f8fafc;color:#64748b}.grid small{display:block;color:#94a3b8;font-weight:400;margin-top:5px}.password-box{margin-top:24px;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px}.password-box h3{margin:0;font-size:14px;color:#0f172a}.password-input-wrapper{position:relative;display:flex;align-items:center;margin-top:6px}.password-input-wrapper .form-control{margin-top:0;padding-right:38px;width:100%}.password-toggle-btn{position:absolute;right:10px;background:none;border:none;color:#64748b;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;font-size:13px;transition:color .15s ease}.password-toggle-btn:hover{color:#0f172a}.actions{display:flex;justify-content:flex-end;margin-top:20px}@media(max-width:760px){.grid,.grid.three{grid-template-columns:1fr}.profile-page{padding:12px}.profile-card{padding:16px}}
</style>
