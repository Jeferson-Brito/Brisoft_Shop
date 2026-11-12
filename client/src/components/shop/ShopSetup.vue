<template><section class="shop-setup"><span class="shop-setup-icon"><i class="ri-store-2-line"></i></span><h2>Vamos preparar sua loja?</h2><p>Comece com os dados do estabelecimento. Depois cadastre os produtos ou importe uma NF-e.</p><div v-if="error" class="shop-alert error" role="alert">{{error}}</div><form @submit.prevent="save"><label>Nome do estabelecimento<input v-model="name" required minlength="2" maxlength="120" placeholder="Ex.: Mercado Boa Praça"/></label><label>Identificador<input v-model="slug" required minlength="3" maxlength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="mercado-boa-praca"/><small>Use letras minúsculas, números e hífens.</small></label><button class="shop-primary" :disabled="busy">{{busy?'Preparando…':'Começar minha loja'}}<i class="ri-arrow-right-line"></i></button></form></section></template>
<script setup>
import { ref,watch } from 'vue'
import { shopApi } from '@/api/shop.api'
import { useShopStore } from '@/stores/shop.store'
const shop=useShopStore(),name=ref(''),slug=ref(''),error=ref(''),busy=ref(false)
let suggested=''
watch(name,value=>{if(!slug.value||slug.value===suggested){suggested=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);slug.value=suggested}})
async function save(){error.value='';busy.value=true;try{await shopApi.createCompany({name:name.value,slug:slug.value});if(!await shop.load())error.value=shop.error}catch(e){error.value=e.response?.data?.error||'Não foi possível preparar a loja.'}finally{busy.value=false}}
</script>
