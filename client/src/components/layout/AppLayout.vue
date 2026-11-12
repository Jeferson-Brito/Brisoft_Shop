<template><div class="app-container"><AppSidebar/><main class="main-wrapper"><AppTopbar/><div class="views-container with-mobile-nav" :class="{'shop-original-inbox':route.name==='conversas'}"><div v-if="auth.isAuthenticated&&shop.loading&&!shop.ready" class="shop-empty">Carregando sua loja…</div><div v-else-if="auth.isAuthenticated&&!shop.ready" class="shop-page"><div class="shop-alert error" role="alert">{{shop.error}}<button @click="shop.load">Tentar novamente</button></div></div><ShopSetup v-else-if="auth.isAdmin&&!shop.company&&route.name!=='perfil'"/><RouterView v-else/></div><MobileBottomNav/></main></div></template>
<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import MobileBottomNav from '@/components/layout/MobileBottomNav.vue'
import ShopSetup from '@/components/shop/ShopSetup.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useShopStore } from '@/stores/shop.store'
import '@/assets/css/views/shop.css'
import '@/assets/css/shop-shell.css'
const auth=useAuthStore(),shop=useShopStore(),route=useRoute()
onMounted(()=>{if(auth.isAuthenticated)shop.load()})
</script>
<style scoped>
.app-container {
  display: flex;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-app, #f8fafc);
}

.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  min-width: 0;
  overflow: hidden;
  background: var(--bg-app, #f8fafc);
}

.views-container {
  flex: 1;
  height: calc(100vh - 48px);
  height: calc(100dvh - 48px);
  min-height: 0;
  overflow: hidden;
  display: flex;
  position: relative;
  z-index: 1;
  background: var(--bg-app, #f8fafc);
}

@media (max-width: 768px) {
  .views-container {
    height: calc(100dvh - 48px - env(safe-area-inset-top, 0px));
  }
  .views-container.with-mobile-nav {
    height: calc(100dvh - 48px - env(safe-area-inset-top, 0px) - 54px - env(safe-area-inset-bottom, 0px));
  }
}

/* ─── Indicador visual instantâneo de transição de rota ──────────────────── */
.route-nav-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2.5px;
  background: linear-gradient(90deg, #059669, #10b981, #34d399, #059669);
  background-size: 200% 100%;
  z-index: 999999;
  pointer-events: none;
  animation: navProgressPulse 0.85s ease-in-out infinite;
}

@keyframes navProgressPulse {
  0% {
    background-position: 100% 0;
    opacity: 0.85;
  }
  50% {
    background-position: 0% 0;
    opacity: 1;
  }
  100% {
    background-position: -100% 0;
    opacity: 0.85;
  }
}
</style>
