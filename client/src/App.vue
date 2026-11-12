<template><RouterView v-if="ready"/><div v-else class="shop-boot">Carregando Brisoft Shop…</div><AppToast/></template>
<script setup>
import { ref,onMounted,watch } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useShopStore } from '@/stores/shop.store'
import AppToast from '@/components/common/AppToast.vue'
const auth=useAuthStore(),shop=useShopStore(),ready=ref(false)
watch(()=>auth.user?.id,()=>shop.reset(),{flush:'sync'})
onMounted(async()=>{await auth.initAuth();ready.value=true})
</script>
<style>.shop-boot{display:grid;place-items:center;height:100dvh;color:#059669;font-size:14px}</style>
