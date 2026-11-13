<template><section class="atendimentos-view-layout shop-adapted-conversations"><div class="atendimentos-main-grid" :class="{'mobile-chat-active':!!selected}"><ShopQueueList :active-id="selected?.id" @select="select" @refresh="refresh"/><div class="shop-chat-column-wrap"><div v-if="error" class="shop-alert error" role="alert">{{error}}<button @click="refresh">Atualizar</button></div><ShopChatPanel ref="chatPanel" :conversation="selected" :busy="busy" @transfer="showTransfer=true" @send="send" @retry-message="retryMessage" @back="backToQueue" @close-conversation="closeConversation"/></div></div><ModalTransferir v-if="showTransfer&&selected" :ticket="selected" @close="showTransfer=false" @transferred="transferred"/></section></template>
<script setup>
import { computed,nextTick,onBeforeUnmount,onMounted,ref } from 'vue'
import { useRoute,useRouter } from 'vue-router'
import { useShopStore } from '@/stores/shop.store'
import { shopApi } from '@/api/shop.api'
import { apiError,date } from '@/utils/shop'
import ModalTransferir from '@/components/modals/ModalTransferir.vue'
import ShopQueueList from '@/components/shop/ShopQueueList.vue'
import ShopChatPanel from '@/components/shop/ShopChatPanel.vue'
const shop=useShopStore(),route=useRoute(),router=useRouter(),selected=ref(null),filter=ref(String(route.query.departamento||'ALL')),message=ref(''),busy=ref(false),error=ref(''),showTransfer=ref(false),messageList=ref(null),chatPanel=ref(null)
const visible=computed(()=>shop.conversations.filter(c=>filter.value==='ALL'||filter.value==='BOT'&&!c.department_id||c.department_id===filter.value))
let disposed=false,timer=null,request=0
async function scroll(){await nextTick();if(messageList.value)messageList.value.scrollTop=messageList.value.scrollHeight}
async function select(id){const n=++request;error.value='';try{const {data}=await shopApi.conversation(id);if(disposed||n!==request)return;const changed=selected.value?.id!==id;selected.value=data.conversation;if(changed)message.value='';await router.replace({path:'/conversas',query:{conversa:id}});scroll()}catch(e){if(!disposed&&n===request){if(e.response?.status===404){selected.value=null;await router.replace('/conversas');await shop.load();}else error.value=apiError(e)}}}
async function refresh(){if(busy.value||showTransfer.value)return;await shop.load();if(disposed)return;const id=selected.value?.id||String(route.query.conversa||'');if(id)await select(id)}
async function send(text){if(busy.value||!selected.value||!text.trim())return;busy.value=true;error.value='';const id=selected.value.id;request++;try{const {data}=await shopApi.reply(id,text,selected.value.version);if(disposed||selected.value?.id!==id)return;selected.value=data.conversation;message.value='';chatPanel.value?.clearMessage();await shop.load();scroll()}catch(e){error.value=apiError(e)}finally{busy.value=false}}
async function retryMessage(messageId){if(busy.value||!selected.value)return;busy.value=true;error.value='';try{const {data}=await shopApi.retryMessage(selected.value.id,messageId,selected.value.version);selected.value=data.conversation;await shop.load()}catch(e){error.value=apiError(e)}finally{busy.value=false}}
async function closeConversation(){if(busy.value||!selected.value)return;busy.value=true;error.value='';try{const {data}=await shopApi.closeConversation(selected.value.id,selected.value.version);selected.value=data.conversation;await shop.load()}catch(e){error.value=apiError(e)}finally{busy.value=false}}
async function backToQueue(){request++;selected.value=null;await router.replace('/conversas')}
async function transferred(value){selected.value=value;showTransfer.value=false;if(!value){request++;await router.replace('/conversas');}await shop.load();scroll()}
onMounted(()=>{refresh();timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},5000)})
onBeforeUnmount(()=>{disposed=true;request++;clearInterval(timer)})
</script>
