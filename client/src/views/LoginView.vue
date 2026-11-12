<template>
  <div class="login-split-page">
    <!-- ─── 1. Coluna da Esquerda: Painel de Branding & Marketing ─────────── -->
    <div class="login-brand-panel">
      <!-- Camadas de fundo com malha e ondas 3D sutis (FIXAS) -->
      <div class="brand-fixed-bg">
        <div class="brand-mesh-bg"></div>
        <div class="brand-curves-bg"></div>
        <div class="brand-particles-overlay"></div>
      </div>

      <div class="brand-panel-content">
        <!-- Logo Oficial Brisoft -->
        <div class="brand-header-box">
          <img :src="logoDarkUrl" alt="Brisoft Shop" class="brand-logo-img" />
        </div>

        <!-- Área Central de Conteúdo e Valor Comercial -->
        <div class="brand-hero-section">
          <!-- Título Principal de Alto Impacto -->
          <h1 class="brand-headline">
            Seu comércio, bem informado.<br />
            <span class="headline-emerald">Mais perto de cada cliente.</span>
          </h1>

          <!-- Subtítulo Persuasivo -->
          <p class="brand-description">
            Organize produtos e preços, informe a disponibilidade e encaminhe cada conversa para o setor certo da sua loja.
          </p>

          <!-- 3 Destaques Comerciais de Alto Impacto -->
          <div class="brand-features-list">
            <div class="feature-item">
              <div class="feature-icon-box">
                <i class="ri-whatsapp-line"></i>
              </div>
              <div class="feature-copy">
                <strong class="feature-title">Catálogo sob seu controle</strong>
                <span class="feature-subtitle">Produtos, preços de venda e disponibilidade atualizados pelo próprio comerciante.</span>
              </div>
            </div>

            <div class="feature-item">
              <div class="feature-icon-box">
                <i class="ri-tv-2-line"></i>
              </div>
              <div class="feature-copy">
                <strong class="feature-title">Da nota fiscal ao catálogo</strong>
                <span class="feature-subtitle">Importe o XML da NF-e, confira os itens e defina os preços antes de cadastrar.</span>
              </div>
            </div>

            <div class="feature-item">
              <div class="feature-icon-box">
                <i class="ri-flashlight-line"></i>
              </div>
              <div class="feature-copy">
                <strong class="feature-title">A conversa no setor certo</strong>
                <span class="feature-subtitle">Balcão, Açougue e Caixa conectados pelo encaminhamento de conversas entre departamentos.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Rodapé do Painel Esquerdo -->
        <div class="brand-panel-footer">
          <span>© {{ currentYear }} Brisoft · Todos os direitos reservados</span>
        </div>
      </div>
    </div>

    <!-- ─── 2. Coluna da Direita: Formulário de Autenticação ────────────────── -->
    <div class="login-auth-panel">
      <div class="auth-form-card">
        <!-- Logo visível apenas no Mobile -->
        <div class="mobile-brand-header">
          <img :src="logoLightUrl" alt="Brisoft Shop" class="mobile-logo-img" />
        </div>

        <h2 class="auth-card-title">Bem-vindo de volta</h2>
        <p class="auth-card-subtitle">Acesse sua conta para gerenciar sua loja.</p>

        <!-- Alerta de Sessão Encerrada por Inatividade -->
        <div v-if="isInactivityLogout" class="auth-inactivity-banner" role="status">
          <i class="ri-shield-user-line"></i>
          <span>Sua sessão foi encerrada após 12h de inatividade por segurança. Faça login novamente para continuar.</span>
        </div>

        <!-- Formulário de Login -->
        <form class="auth-form" id="loginForm" @submit.prevent="handleSubmit">
          <!-- Campo E-mail -->
          <div class="form-field-group">
            <label class="form-field-label" for="loginEmail">E-mail</label>
            <div class="form-input-wrap">
              <span class="input-icon-box"><i class="ri-mail-line"></i></span>
              <input
                v-model="email"
                type="email"
                id="loginEmail"
                class="form-input"
                placeholder="seu@email.com.br"
                autocomplete="email"
                required
              />
            </div>
          </div>

          <!-- Campo Senha -->
          <div class="form-field-group">
            <label class="form-field-label" for="loginCompany">Empresa <small style="font-weight:400;color:#94a3b8">(identificador)</small></label>
            <div class="form-input-wrap"><span class="input-icon-box"><i class="ri-store-2-line"></i></span><input v-model="company" id="loginCompany" class="form-input" maxlength="60" placeholder="Ex.: loja-demonstracao" autocomplete="organization" autocapitalize="none" spellcheck="false"/></div>
            <small style="font-size:10px;color:#94a3b8;line-height:1.6;display:block;margin-top:6px">No acesso inicial de demonstração, você pode deixar em branco.</small>
          </div>
          <div class="form-field-group">
            <label class="form-field-label" for="loginPassword">Senha</label>
            <div class="form-input-wrap">
              <span class="input-icon-box"><i class="ri-lock-2-line"></i></span>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                id="loginPassword"
                class="form-input"
                placeholder="••••••••••••"
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="pwd-toggle-btn"
                :title="showPassword ? 'Ocultar senha' : 'Exibir senha'"
                @click="showPassword = !showPassword"
                tabindex="-1"
              >
                <i :class="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'"></i>
              </button>
            </div>
          </div>

          <!-- Opções: Lembrar de mim e Esqueci minha senha -->
          <div class="form-options-row">
            <label class="remember-checkbox-label">
              <input
                v-model="rememberMe"
                type="checkbox"
                class="remember-checkbox"
              />
              <span class="custom-checkbox-box">
                <i class="ri-check-line"></i>
              </span>
              <span class="remember-text">Lembrar de mim</span>
            </label>

            <button
              type="button"
              class="forgot-pwd-link"
              @click="handleForgotPassword"
            >
              Esqueci minha senha
            </button>
          </div>

          <!-- Mensagem de erro / feedback -->
          <Transition name="auth-error-slide">
            <div v-if="errorMsg" class="auth-error-banner" role="alert">
              <i class="ri-error-warning-line"></i>
              <span>{{ errorMsg }}</span>
            </div>
          </Transition>

          <!-- Botão Entrar -->
          <button
            type="submit"
            class="btn-login-submit"
            id="loginSubmitBtn"
            :disabled="loading"
            :class="{ loading }"
          >
            <span v-if="loading" class="login-spinner"></span>
            <span v-else class="login-btn-inner">
              <i class="ri-login-box-line"></i>
              <span>Entrar</span>
            </span>
          </button>
        </form>

        <!-- Rodapé do Card -->
        <div class="auth-card-footer">
          <span>Ainda não tem acesso? </span>
          <button type="button" class="support-link" @click="handleSupport">
            Fale com o suporte
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import logoDarkUrl from '@/assets/img/logo_shop_white.svg'
import logoLightUrl from '@/assets/img/logo_shop.svg'

const router   = useRouter()
const route    = useRoute()
const auth     = useAuthStore()

const email        = ref('')
const company      = ref('')
const password     = ref('')
const rememberMe   = ref(true)
const showPassword = ref(false)
const loading      = ref(false)
const errorMsg     = ref('')
const currentYear  = new Date().getFullYear()

const isInactivityLogout = computed(() => route.query.reason === 'inactivity')

onMounted(() => {
  try {
    const savedEmail = localStorage.getItem('brisoft_shop_saved_email')
    if (savedEmail) {
      email.value = savedEmail
      rememberMe.value = true
    }
  } catch (_) {}
})

async function handleSubmit() {
  if (!email.value || !password.value) {
    errorMsg.value = 'Preencha seu e-mail e senha para continuar.'
    return
  }

  errorMsg.value = ''
  loading.value  = true

  try {
    const cleanEmail = email.value.trim()
    const result = await auth.login(cleanEmail, password.value, company.value.trim())

    if (result.success) {
      // Salvar ou limpar e-mail lembrado
      try {
        if (rememberMe.value) {
          localStorage.setItem('brisoft_shop_saved_email', cleanEmail)
        } else {
          localStorage.removeItem('brisoft_shop_saved_email')
        }
      } catch (_) {}

      const redirect = String(route.query.redirect || '')
      const defaultDest = auth.isAdmin ? { name: 'dashboard' } : { name: 'conversas' }
      await router.replace(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : defaultDest)
    } else {
      errorMsg.value = result.error || 'E-mail ou senha incorretos. Tente novamente.'
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.error || err.message || 'Erro de conexão. Verifique se o servidor está online.'
  } finally {
    loading.value = false
  }
}

function handleForgotPassword() {
  alert('Para redefinir sua senha, solicite ao administrador do sistema ou entre em contato com o suporte da Brisoft.')
}

function handleSupport() {
  const supportText = encodeURIComponent('Olá, preciso de suporte para acessar minha conta no Brisoft Shop.')
  window.open(`https://wa.me/5583981131352?text=${supportText}`, '_blank')
}
</script>

