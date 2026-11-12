import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import AppLayout from '@/components/layout/AppLayout.vue'
const loaders={
  '/usuarios':()=>import('@/views/UsuariosView.vue'),
  '/departamentos':()=>import('@/views/ShopDepartmentsView.vue'),
  '/conversas':()=>import('@/views/ShopConversationsView.vue'),
  '/dashboard':()=>import('@/views/DashboardView.vue'),
  '/produtos':()=>import('@/views/ShopView.vue'),
  '/importacoes':()=>import('@/views/ImportsView.vue'),
  '/historico':()=>import('@/views/ShopHistoryView.vue'),
  '/simulador':()=>import('@/views/SimulatorView.vue'),
  '/configuracoes':()=>import('@/views/ShopSettingsView.vue'),
  '/perfil':()=>import('@/views/ShopAccountView.vue')
}
export function prefetchRoute(path){loaders[path]?.().catch(()=>{})}
export function prefetchCoreViews(){Object.keys(loaders).forEach(prefetchRoute)}
const routes=[
 {path:'/login',name:'login',component:()=>import('@/views/LoginView.vue')},
 {path:'/',component:AppLayout,meta:{requiresAuth:true},children:[
  {path:'',redirect:()=>useAuthStore().isAdmin?'/dashboard':'/conversas'},
  ...Object.entries(loaders).map(([path,component])=>({path:path.slice(1),name:path.slice(1),component,meta:{requiresAdmin:!['/perfil','/conversas'].includes(path)}}))
 ]},
 {path:'/loja',redirect:'/produtos'},
 {path:'/atendimentos',redirect:'/conversas'},
 {path:'/equipe',redirect:'/usuarios'},
 ...['/desempenho','/avaliacoes','/painel-tv','/clientes','/mensagens-rapidas','/configuracao-ia'].map(path=>({path,redirect:'/dashboard'})),
 {path:'/:pathMatch(.*)*',redirect:'/dashboard'}
]
const router=createRouter({history:createWebHistory(),routes})
router.beforeEach(async to=>{
 const auth=useAuthStore()
 if(!auth.initialized)await auth.initAuth()
 if(to.meta.requiresAuth&&(!auth.isAuthenticated||!auth.user))return {name:'login',query:{redirect:to.fullPath}}
 if(to.meta.requiresAdmin&&!auth.isAdmin)return {name:'conversas'}
 if(to.name==='login'&&auth.isAuthenticated&&auth.user)return {name:auth.isAdmin?'dashboard':'conversas'}
})
export default router
