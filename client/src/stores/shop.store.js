import { defineStore } from 'pinia'
import { ref,computed } from 'vue'
import { shopApi } from '@/api/shop.api'
import { useAuthStore } from '@/stores/auth.store'
export const useShopStore=defineStore('shop',()=>{
 const snapshot=ref({company:null,products:[],history:[],imports:[],departments:[],conversations:[],mode:''})
 const ready=ref(false),loading=ref(false),error=ref('')
 let generation=0,pending=null
 function reset(){generation++;pending=null;snapshot.value={company:null,products:[],history:[],imports:[],departments:[],conversations:[],mode:''};ready.value=false;loading.value=false;error.value=''}
 async function load(){
  if(pending)return pending
  const current=++generation,auth=useAuthStore(),identity=auth.token
  loading.value=true;error.value=''
  pending=(async()=>{
   try{const {data}=await shopApi.workspace();if(current!==generation||auth.token!==identity)return false;snapshot.value=data;ready.value=true;return true}
   catch(e){if(current===generation)error.value=e.response?.data?.error||'Não foi possível carregar a loja. Verifique o servidor local.';return false}
   finally{if(current===generation){loading.value=false;pending=null}}
  })()
  return pending
 }
 return {ready,loading,error,load,reset,company:computed(()=>snapshot.value.company),products:computed(()=>snapshot.value.products),history:computed(()=>snapshot.value.history),imports:computed(()=>snapshot.value.imports),departments:computed(()=>snapshot.value.departments),conversations:computed(()=>snapshot.value.conversations),mode:computed(()=>snapshot.value.mode)}
})
