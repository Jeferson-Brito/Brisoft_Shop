import { defineStore } from 'pinia'
import { ref } from 'vue'
import { departmentsApi } from '@/api/departments.api'
import { settingsApi } from '@/api/settings.api'

export const useSettingsStore = defineStore('settings', () => {
  const departments = ref([])
  const settings    = ref({})
  const loading     = ref(false)

  async function fetchDepartments() {
    const { data } = await departmentsApi.list()
    if (data.success) departments.value = data.departments || []
  }

  async function fetchSettings() {
    const { data } = await settingsApi.get()
    if (data.success) settings.value = data.settings || {}
  }

  async function saveSetting(key, value) {
    const { data } = await settingsApi.save(key, value)
    if (data.success) settings.value[key] = value
    return data
  }

  async function saveDepartment(dept) {
    const { data } = await departmentsApi.save(dept)
    if (data.success) await fetchDepartments()
    return data
  }

  async function deleteDepartment(id) {
    const { data } = await departmentsApi.remove(id)
    if (data.success) departments.value = departments.value.filter(d => d.id !== id)
    return data
  }

  async function reorderDepartments(departmentIds) {
    const { data } = await departmentsApi.reorder(departmentIds)
    if (data.success) await fetchDepartments()
    return data
  }

  return {
    departments, settings, loading,
    fetchDepartments, fetchSettings, saveSetting, saveDepartment, deleteDepartment, reorderDepartments
  }
})
