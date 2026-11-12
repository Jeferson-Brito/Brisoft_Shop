// ==========================================================================
// SIDEBAR STORE — controla o estado do drawer mobile da sidebar
// ==========================================================================
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSidebarStore = defineStore('sidebar', () => {
  const mobileOpen = ref(false)
  const isExpanded = ref(localStorage.getItem('brisoft_sidebar_expanded') !== 'false')

  function open()   { mobileOpen.value = true  }
  function close()  { mobileOpen.value = false }
  function toggle() { mobileOpen.value = !mobileOpen.value }

  function toggleExpanded() {
    isExpanded.value = !isExpanded.value
    localStorage.setItem('brisoft_sidebar_expanded', String(isExpanded.value))
  }

  function setExpanded(val) {
    isExpanded.value = !!val
    localStorage.setItem('brisoft_sidebar_expanded', String(isExpanded.value))
  }

  return { mobileOpen, isExpanded, open, close, toggle, toggleExpanded, setExpanded }
})
