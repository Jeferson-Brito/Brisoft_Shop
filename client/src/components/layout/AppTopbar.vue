<template><header class="topbar-bitrix" id="appTopNavigation">
 <button class="topbar-hamburger" title="Abrir menu" aria-label="Abrir menu lateral" @click="sidebar.toggle"><span class="topbar-icon-box"><i class="ri-menu-line"></i></span></button>
 <RouterLink :to="auth.isAdmin?'/dashboard':'/conversas'" class="topbar-mobile-brand" title="Brisoft Shop"><img :src="logo" alt="Brisoft Shop" class="topbar-mobile-logo"/></RouterLink>
 <div class="topbar-tabs-track"><div class="topbar-nav-pill active"><span class="pill-icon-box"><i :class="current.icon"></i></span><span class="pill-label">{{current.label}}</span></div></div>
 <div class="topbar-right"><span class="shop-top-local">Desenvolvimento local</span><RouterLink to="/perfil" class="user-avatar-circle" title="Minha conta" style="text-decoration:none;width:32px;height:32px;border-radius:50%;background:#edf5f0;color:#438267;display:grid;place-items:center;font-size:11px">{{initials}}</RouterLink><button class="shop-top-logout" title="Sair" aria-label="Sair" @click="logout"><i class="ri-logout-box-r-line"></i></button></div>
 </header></template>
<script setup>
import { computed } from 'vue'
import { useRoute,useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useSidebarStore } from '@/stores/sidebar.store'
import logo from '@/assets/img/logo_shop.svg'
const auth=useAuthStore(),sidebar=useSidebarStore(),route=useRoute(),router=useRouter()
const titles={usuarios:['Usuários','ri-team-line'],dashboard:['Dashboard','ri-pie-chart-2-line'],produtos:['Produtos','ri-box-3-line'],importacoes:['Importar NF-e','ri-file-upload-line'],conversas:['Conversas','ri-inbox-archive-line'],departamentos:['Departamentos','ri-building-2-line'],historico:['Alterações','ri-history-line'],simulador:['Simulador de IA','ri-robot-line'],configuracoes:['Configurações','ri-settings-3-line'],perfil:['Minha conta','ri-user-line']}
const current=computed(()=>{const [label,icon]=titles[route.name]||titles.dashboard;return {label,icon}})
const initials=computed(()=>auth.userName.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase())
async function logout(){await auth.logout();router.push('/login')}
</script>
<style scoped>
/* ─── Barra Superior Estilo Bitrix24 ─────────────────────────────────────── */
.topbar-bitrix {
  height: 48px;
  min-height: 48px;
  max-height: 48px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-sizing: border-box;
  position: relative;
  z-index: 2500;
  user-select: none;
}

/* Hambúrguer Mobile */
.topbar-hamburger {
  display: none;
  background: none;
  border: none;
  font-size: 16px;
  color: #475569;
  cursor: pointer;
  padding: 6px;
  margin-right: 8px;
}

/* Trilho de Abas Horizontal com Scroll Invisível */
.topbar-tabs-track {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-width: 0;
  flex: 1;
}

.topbar-tabs-track::-webkit-scrollbar {
  display: none;
}

/* ─── Pílula de Navegação (Estilo da Imagem) ─────────────────────────── */
.topbar-nav-pill {
  height: 32px;
  padding: 0 14px;
  border-radius: 20px;
  font-size: 12.5px;
  font-weight: 500;
  color: #64748b;
  background: transparent;
  border: 1px solid transparent;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.topbar-nav-pill:hover {
  color: #0f172a;
  background: #f8fafc;
}

.topbar-nav-pill.active {
  background: #ecfdf5 !important;
  color: #059669 !important;
  border-color: #a7f3d0 !important;
  font-weight: 600;
}

.pill-count-badge {
  background: #d1fae5;
  color: #065f46;
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
  margin-left: 2px;
}

.unread-internal-badge {
  background: #ef4444 !important;
  color: #ffffff !important;
  animation: pulse-badge 2s infinite ease-in-out;
}

@keyframes pulse-badge {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.disabled-pill {
  opacity: 0.6;
  cursor: default;
}

.pill-icon-box {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pill-icon-box i {
  font-size: 15px;
  line-height: 1;
}

.btn-icon-box {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-icon-box i {
  font-size: 16px;
  line-height: 1;
}

.topbar-icon-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.topbar-icon-box i {
  font-size: 18px;
  line-height: 1;
}

.topbar-fallback-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

/* ─── Área Direita: Avatar Stack + Botão Novo Atendimento ────────────────── */
.topbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto; /* Garante que fique SEMPRE alinhado na extrema direita */
  flex-shrink: 0;
}

.online-users-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.online-users-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 8px;
  transition: background 0.14s ease;
}

.online-users-pill-btn:hover {
  background: #f8fafc;
}

.avatar-stack-container {
  display: flex;
  align-items: center;
}

.avatar-stack-circle {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  margin-left: -6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8.5px;
  font-weight: 700;
  flex-shrink: 0;
  position: relative;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.avatar-stack-circle:first-child {
  margin-left: 0;
}

.avatar-stack-circle img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.online-status-dot-static {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  flex-shrink: 0;
}

.online-label-text {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

/* Botão + Novo atendimento */
.btn-new-attendance-cta {
  height: 34px;
  padding: 0 16px;
  border-radius: 8px;
  background: #059669;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  box-shadow: 0 1px 3px rgba(5, 150, 105, 0.25);
  transition: all 0.16s ease;
  white-space: nowrap;
}

.btn-new-attendance-cta:hover {
  background: #047857;
  box-shadow: 0 2px 6px rgba(5, 150, 105, 0.35);
}

/* Popover Lista de Usuários Online */
.online-users-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 275px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18), 0 3px 10px rgba(15, 23, 42, 0.08);
  border: 1px solid #e2e8f0;
  z-index: 2600;
  box-sizing: border-box;
  overflow: hidden;
}

.online-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
}

.popover-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.status-live-dot-mini {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
}

.popover-title {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
}

.online-count-pill {
  font-size: 10.5px;
  font-weight: 600;
  color: #15803d;
  background: #dcfce7;
  padding: 2px 7px;
  border-radius: 12px;
}

.online-users-list-scroll {
  max-height: 250px;
  overflow-y: auto;
  padding: 6px;
}

.online-user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  transition: background-color 0.12s ease;
}

.online-user-item:hover {
  background: #f8fafc;
}

.online-user-avatar {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  overflow: visible;
}

.online-user-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.avatar-online-badge {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #22c55e;
  border: 2px solid #ffffff;
  z-index: 2;
}

.online-user-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.online-user-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.online-user-name {
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.you-chip {
  font-size: 9.5px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 0 4px;
  border-radius: 4px;
  line-height: 1.3;
}

.online-user-role {
  font-size: 11px;
  color: #64748b;
  line-height: 1.2;
}

.online-empty-msg {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}

/* Transições do Dropdown */
.dropdown-pop-enter-active,
.dropdown-pop-leave-active {
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-pop-enter-from,
.dropdown-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}

.topbar-mobile-brand {
  display: none;
}

@media (max-width: 768px) {
  .topbar-bitrix {
    padding-left: max(12px, env(safe-area-inset-left, 12px));
    padding-right: max(12px, env(safe-area-inset-right, 12px));
    padding-top: env(safe-area-inset-top, 0px);
    height: calc(48px + env(safe-area-inset-top, 0px));
    min-height: calc(48px + env(safe-area-inset-top, 0px));
    max-height: calc(48px + env(safe-area-inset-top, 0px));
  }
  /* Ocultar hambúrguer no mobile (navegação agora é inferior) */
  .topbar-hamburger {
    display: none !important;
  }
  /* Logo da Brisoft no canto superior esquerdo */
  .topbar-mobile-brand {
    display: flex;
    align-items: center;
    text-decoration: none;
    flex-shrink: 0;
  }
  .topbar-mobile-logo {
    height: 28px;
    max-width: 130px;
    object-fit: contain;
    display: block;
  }
  /* Ocultar abas superiores no mobile (Fila, Chatbot, Conversas, Campanhas) */
  .topbar-tabs-track {
    display: none !important;
  }
  .btn-new-attendance-cta {
    padding: 0;
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: 8px;
    justify-content: center;
    gap: 0;
  }
  .btn-new-attendance-cta .btn-cta-text {
    display: none !important;
  }
  .topbar-right-area {
    gap: 8px;
  }
  .online-indicator-btn {
    padding: 3px 8px;
  }
  .online-label-text {
    font-size: 11px;
  }
  .topbar-right {
    gap: 8px;
    margin-left: auto;
  }
  .topbar-user-avatar {
    width: 32px;
    height: 32px;
    font-size: 11px;
  }
  .user-profile-popover {
    width: 240px;
    right: 0;
  }
}

/* ─── Perfil do Usuário na Topbar (Apenas Mobile - No Desktop já existe no Sidebar) ─── */
.user-menu-wrapper {
  display: none;
}

@media (max-width: 768px) {
  .user-menu-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
}

.topbar-user-avatar-btn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  outline: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.topbar-user-avatar-btn:hover,
.topbar-user-avatar-btn.active {
  box-shadow: 0 0 0 2px #059669;
}

.topbar-user-avatar {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  background: #059669;
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.topbar-user-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

/* Popover do Perfil */
.user-profile-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 260px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18), 0 3px 10px rgba(15, 23, 42, 0.08);
  border: 1px solid #e2e8f0;
  z-index: 2650;
  box-sizing: border-box;
  overflow: hidden;
  padding: 12px;
}

.user-popover-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
}

.user-popover-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #059669;
  color: #ffffff;
  overflow: hidden;
}

.user-popover-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.user-popover-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.user-popover-name {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-popover-role {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
}

.user-popover-email {
  font-size: 10.5px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-popover-divider {
  height: 1px;
  background: #f1f5f9;
  margin: 6px 0;
}

.user-popover-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-popover-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #334155;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}

.user-popover-item i {
  font-size: 16px;
  color: #64748b;
  flex-shrink: 0;
}

.user-popover-item:hover {
  background: #f8fafc;
  color: #0f172a;
}

.user-popover-item:hover i {
  color: #059669;
}

.user-popover-item.logout-item {
  color: #ef4444;
}

.user-popover-item.logout-item i {
  color: #ef4444;
}

.user-popover-item.logout-item:hover {
  background: #fef2f2;
  color: #dc2626;
}
</style>

