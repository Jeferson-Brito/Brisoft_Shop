<template>
  <Teleport to="body">
    <div class="toast-container" id="toastContainer">
      <TransitionGroup name="toast">
        <div
          v-for="toast in ui.toasts"
          :key="toast.id"
          class="toast"
          :class="`toast--${toast.type}`"
        >
          <i :class="iconFor(toast.type)"></i>
          <span>{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { useUiStore } from '@/stores/ui.store'

const ui = useUiStore()

function iconFor(type) {
  const icons = {
    success: 'fa-solid fa-circle-check',
    error:   'fa-solid fa-circle-xmark',
    warning: 'fa-solid fa-triangle-exclamation',
    info:    'fa-solid fa-circle-info'
  }
  return icons[type] || icons.success
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 10px;
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.08);
  color: #f1f5f9;
  font-size: 13.5px;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  pointer-events: all;
  max-width: 360px;
}

.toast--success i { color: #22c55e; }
.toast--error   i { color: #ef4444; }
.toast--warning i { color: #f59e0b; }
.toast--info    i { color: #3b82f6; }

/* TransitionGroup animations */
.toast-enter-active, .toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
