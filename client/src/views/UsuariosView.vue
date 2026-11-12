<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">Usuários</h2>
      <div class="header-actions">
        <div v-if="showSearchInput" class="search-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input
            ref="searchInputRef"
            v-model="searchTerm"
            type="text"
            placeholder="Buscar usuário..."
            class="search-input"
            @keydown.esc="closeSearch"
          />
          <button
            v-if="searchTerm"
            type="button"
            class="btn-clear-search"
            title="Limpar pesquisa"
            @click="clearSearch"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <button
          class="btn-search"
          type="button"
          :class="{ active: showSearchInput }"
          @click="toggleSearch"
          :title="showSearchInput ? 'Fechar busca' : 'Buscar usuário'"
        >
          <i :class="showSearchInput ? 'fa-solid fa-xmark' : 'fa-solid fa-magnifying-glass'"></i>
        </button>
        <button class="btn-primary" @click="openNewUserModal">
          <i class="fa-solid fa-user-plus"></i> Novo Usuário
        </button>
      </div>
    </div>

    <div class="settings-section-card">
      <table class="data-table" style="width:100%;">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>E-mail</th>
            <th>Cargo / Perfil</th>
            <th>Departamento</th>
            <th>Status</th>
            <th style="text-align:right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="filteredUsers.length === 0">
            <td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">
              {{ searchTerm ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.' }}
            </td>
          </tr>
          <tr v-for="u in filteredUsers" :key="u.id">
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <div
                  style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden;"
                  :style="{ background: u.role === 'Administrador' ? '#059669' : '#7c3aed' }"
                >
                  <img
                    v-if="u.avatar_url"
                    :src="u.avatar_url"
                    :alt="u.name"
                    style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;"
                  />
                  <span v-else>{{ getUserInitials(u.name) }}</span>
                </div>
                <div>
                  <span style="font-weight:600;font-size:12.5px;">{{ normalizePersonName(u.name) || '—' }}</span>
                  <span v-if="u.id === authStore.user?.id" style="margin-left:6px;background:#ecfdf5;color:#047857;border-radius:20px;font-size:9px;font-weight:700;padding:1px 6px;">VOCÊ</span>
                </div>
              </div>
            </td>
            <td style="font-size:12px;color:#64748b;">{{ u.email }}</td>
            <td>
              <span
                class="badge"
                :style="{
                  background: u.role === 'Administrador' ? '#ecfdf5' : '#f5f3ff',
                  color: u.role === 'Administrador' ? '#059669' : '#7c3aed',
                  border: `1px solid ${u.role === 'Administrador' ? '#a7f3d0' : '#ddd6fe'}`
                }"
              >
                {{ u.cargo || u.role || 'Analista' }}
              </span>
              <small v-if="u.cargo && u.cargo !== u.role" style="display:block;margin-top:2px;font-size:10.5px;color:#94a3b8;">
                {{ u.role }}
              </small>
            </td>
            <td style="font-size:12px;color:#64748b;">
              {{ userDepartmentLabel(u) }}
            </td>
            <td>
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;">
                <i class="fa-solid fa-circle" style="font-size:7px;" :style="{ color: u.is_active !== false ? '#22c55e' : '#ef4444' }"></i>
                {{ u.is_active !== false ? 'Ativo' : 'Inativo' }}
              </span>
            </td>
            <td class="actions-cell">
              <button class="btn-icon" style="color:#059669;" title="Editar" @click="editUser(u)">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn-icon" style="color:#ef4444;" title="Excluir" @click="deleteUser(u)">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <ModalUsuario
      v-if="showModalUser"
      :editing-user="selectedUserForEdit"
      @close="showModalUser = false"
      @saved="loadUsers"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useShopStore } from '@/stores/shop.store'
const shop = useShopStore()
import { useUiStore } from '@/stores/ui.store'
import { usersApi } from '@/api/users.api'
import ModalUsuario from '@/components/modals/ModalUsuario.vue'
import { normalizePersonName } from '@/utils/person-display'

const authStore = useAuthStore()
const ui = useUiStore()

const usersList = ref([])
const showModalUser = ref(false)
const selectedUserForEdit = ref(null)
const searchTerm = ref('')
const showSearchInput = ref(false)
const searchInputRef = ref(null)

const filteredUsers = computed(() => {
  const list = [...usersList.value].sort((a, b) => {
    const nameA = normalizePersonName(a.name || '').toLowerCase()
    const nameB = normalizePersonName(b.name || '').toLowerCase()
    return nameA.localeCompare(nameB, 'pt-BR')
  })

  if (!searchTerm.value.trim()) return list

  const term = searchTerm.value.trim().toLowerCase()
  return list.filter((user) => {
    const name = normalizePersonName(user.name || '').toLowerCase()
    const email = (user.email || '').toLowerCase()
    const role = (user.role || '').toLowerCase()
    const cargo = (user.cargo || '').toLowerCase()
    return name.includes(term) || email.includes(term) || role.includes(term) || cargo.includes(term)
  })
})

function getUserInitials(name) {
  return (name || 'U').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function userDepartmentLabel(user) {
  if (user.role === 'Supervisor' && user.supervised_departments?.length) return user.supervised_departments.map(item => item.name).join(', ')
  if (user.role === 'Administrador') return 'Todos os departamentos'
  return shop.departments.filter(d => (user.department_ids || []).includes(d.id)).map(d => d.name).join(', ') || '—'
}

async function loadUsers() {
  try {
    const { data } = await usersApi.list()
    if (data.success) {
      usersList.value = data.users || []
    }
  } catch (e) {
    ui.showToast(e.response?.data?.error || 'Erro ao carregar usuários', 'error')
  }
}

function toggleSearch() {
  showSearchInput.value = !showSearchInput.value
  if (showSearchInput.value) {
    nextTick(() => searchInputRef.value?.focus())
  } else {
    searchTerm.value = ''
  }
}

function closeSearch() {
  showSearchInput.value = false
  searchTerm.value = ''
}

function clearSearch() {
  searchTerm.value = ''
  nextTick(() => searchInputRef.value?.focus())
}

function openNewUserModal() {
  selectedUserForEdit.value = null
  showModalUser.value = true
}

function editUser(u) {
  selectedUserForEdit.value = u
  showModalUser.value = true
}

async function deleteUser(u) {
  if (!confirm(`Deseja realmente excluir o usuário ${u.name}?`)) return
  try {
    const { data } = await usersApi.remove(u.id, u.version)
    if (data.success) {
      ui.showToast('Usuário excluído com sucesso!')
      await loadUsers()
    } else {
      ui.showToast(`⚠️ ${data.error}`, 'error')
    }
  } catch (e) {
    ui.showToast(e.response?.data?.error || 'Erro ao excluir usuário', 'error')
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.page-container {
  padding: 16px 20px 32px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #fff;
}
.search-box i {
  color: #94a3b8;
  font-size: 12px;
}
.search-input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 12px;
  color: var(--text-main);
  background: transparent;
}
.search-input::placeholder {
  color: #94a3b8;
}
.btn-clear-search {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
}
.btn-clear-search:hover {
  color: #475569;
  background: #f1f5f9;
}
.btn-search {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-search.active {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #cbd5e1;
}
.settings-section-card {
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  padding: 16px;
  box-shadow: none;
  overflow-x: auto;
  margin-bottom: 24px;
}
.data-table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
}
.data-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  text-align: left;
  padding: 12px 10px;
  font-weight: 700;
  color: #334155;
  border-bottom: 1px solid var(--border-color);
}
.data-table tbody td {
  padding: 12px 10px;
  border-bottom: 1px solid #eef2f7;
  vertical-align: middle;
}
.actions-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 120px;
  text-align: right;
}
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-size: 10.5px;
  font-weight: 600;
  border-radius: 4px;
}
</style>
