<template>
  <div class="empty-chat-motion-stage" aria-label="Aguardando seleção de atendimento">
    <!-- Efeito de Fundo: Círculos Concêntricos de Radar / Pulso -->
    <div class="pulse-stage">
      <div class="pulse-ring ring-1"></div>
      <div class="pulse-ring ring-2"></div>
      <div class="pulse-ring ring-3"></div>

      <!-- Partículas flutuantes sutis no ar -->
      <span class="particle p-1"></span>
      <span class="particle p-2"></span>
      <span class="particle p-3"></span>
      <span class="particle p-4"></span>

      <!-- Hub Central Animado -->
      <div class="central-avatar-glow">
        <div class="central-avatar-core">
          <i class="ri-customer-service-2-line central-icon"></i>
        </div>
      </div>

      <!-- Balão 1 (Top-Right): Mensagem com Digitação Animada -->
      <div class="floating-bubble bubble-customer">
        <div class="bubble-avatar-mini client">
          <i class="ri-user-line"></i>
        </div>
        <div class="typing-indicator">
          <span class="dot dot-1"></span>
          <span class="dot dot-2"></span>
          <span class="dot dot-3"></span>
        </div>
      </div>

      <!-- Balão 2 (Bottom-Left): Resposta Rápida / Confirmação -->
      <div class="floating-bubble bubble-agent">
        <div class="bubble-avatar-mini agent">
          <i class="ri-flashlight-line"></i>
        </div>
        <span class="bubble-text">Pronto para atender</span>
        <i class="ri-check-double-line check-icon"></i>
      </div>

      <!-- Balão 3 (Top-Left): Ícone WhatsApp / Conexão Ativa -->
      <div class="floating-bubble bubble-channel">
        <i class="ri-whatsapp-line channel-icon"></i>
        <span class="pulse-dot"></span>
      </div>
    </div>

    <!-- Texto Informativo Elegante -->
    <div class="empty-chat-caption">
      <div class="status-live-chip">
        <span class="live-dot"></span>
        <span>Pronto para Atendimento</span>
      </div>
      <h3 class="empty-chat-title">Nenhuma conversa selecionada</h3>
      <p class="empty-chat-desc">
        Selecione um cliente na <strong>Fila de Atendimento</strong> ao lado para conversar em tempo real.
      </p>
    </div>
  </div>
</template>

<script setup>
// Componente puramente animado de espera
</script>

<style scoped>
.empty-chat-motion-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  user-select: none;
  animation: fadeInStage 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

@keyframes fadeInStage {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}

/* ─── Palco de Pulso e Balões Flutuantes ────────────────────────────────── */
.pulse-stage {
  position: relative;
  width: 240px;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

/* Anéis de Pulso Concêntricos */
.pulse-ring {
  position: absolute;
  border-radius: 50%;
  border: 1.5px solid rgba(5, 150, 105, 0.16);
  pointer-events: none;
  transition: all 0.3s ease;
}

.ring-1 {
  width: 130px;
  height: 130px;
  animation: rippleRing 3.2s infinite ease-out;
}

.ring-2 {
  width: 190px;
  height: 190px;
  border-color: rgba(5, 150, 105, 0.10);
  animation: rippleRing 3.2s infinite ease-out 1.1s;
}

.ring-3 {
  width: 240px;
  height: 240px;
  border-color: rgba(5, 150, 105, 0.05);
  animation: rippleRing 3.2s infinite ease-out 2.2s;
}

@keyframes rippleRing {
  0% {
    transform: scale(0.75);
    opacity: 0.8;
  }
  50% {
    opacity: 0.4;
  }
  100% {
    transform: scale(1.15);
    opacity: 0;
  }
}

/* Partículas Flutuantes Sutis */
.particle {
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #34d399);
  pointer-events: none;
  opacity: 0.6;
}

.p-1 {
  width: 6px;
  height: 6px;
  top: 18%;
  left: 20%;
  animation: floatParticle 4s infinite ease-in-out;
}

.p-2 {
  width: 4px;
  height: 4px;
  bottom: 22%;
  right: 18%;
  animation: floatParticle 3.4s infinite ease-in-out 1s;
}

.p-3 {
  width: 5px;
  height: 5px;
  top: 25%;
  right: 22%;
  animation: floatParticle 4.6s infinite ease-in-out 0.5s;
}

.p-4 {
  width: 4px;
  height: 4px;
  bottom: 26%;
  left: 24%;
  animation: floatParticle 3.8s infinite ease-in-out 1.8s;
}

@keyframes floatParticle {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
  50% { transform: translateY(-12px) scale(1.3); opacity: 0.8; }
}

/* ─── Hub Central (Avatar com Headset) ──────────────────────────────────── */
.central-avatar-glow {
  position: relative;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(5, 150, 105, 0.2) 0%, rgba(5, 150, 105, 0) 70%);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: hubPulse 2.8s infinite ease-in-out;
  z-index: 2;
}

@keyframes hubPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

.central-avatar-core {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 10px 24px -4px rgba(5, 150, 105, 0.38), 0 4px 10px rgba(0, 0, 0, 0.08);
  border: 3px solid #ffffff;
}

.central-icon {
  font-size: 26px;
  animation: gentleTilt 3.6s infinite ease-in-out;
}

@keyframes gentleTilt {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}

/* ─── Balões Flutuantes Orbitais ────────────────────────────────────────── */
.floating-bubble {
  position: absolute;
  background: #ffffff;
  border-radius: 20px;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 20px -3px rgba(15, 23, 42, 0.12), 0 3px 8px rgba(15, 23, 42, 0.05);
  border: 1px solid #e2e8f0;
  z-index: 3;
}

/* Balão Cliente (Top Right) com Digitação */
.bubble-customer {
  top: 14px;
  right: 6px;
  animation: floatBubbleTop 4.2s infinite ease-in-out;
}

@keyframes floatBubbleTop {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(4px, -8px); }
}

.bubble-avatar-mini {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.bubble-avatar-mini.client {
  background: #ecfdf5;
  color: #059669;
}

.bubble-avatar-mini.agent {
  background: #fef3c7;
  color: #d97706;
}

/* Indicador de Digitação (Typing Dots) */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 2px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #94a3b8;
  animation: typingBounce 1.4s infinite ease-in-out;
}

.dot-1 { animation-delay: 0s; }
.dot-2 { animation-delay: 0.2s; }
.dot-3 { animation-delay: 0.4s; }

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-5px); opacity: 1; background: #059669; }
}

/* Balão Atendente (Bottom Left) */
.bubble-agent {
  bottom: 16px;
  left: 6px;
  padding: 7px 13px;
  animation: floatBubbleBottom 4.6s infinite ease-in-out 0.8s;
}

@keyframes floatBubbleBottom {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-4px, 7px); }
}

.bubble-text {
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  letter-spacing: -0.01em;
}

.check-icon {
  font-size: 11px;
  color: #22c55e;
}

/* Balão WhatsApp (Top Left) */
.bubble-channel {
  top: 32px;
  left: 12px;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  justify-content: center;
  position: absolute;
  animation: floatBubbleChannel 3.8s infinite ease-in-out 0.4s;
}

@keyframes floatBubbleChannel {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-3px, -6px); }
}

.channel-icon {
  font-size: 17px;
  color: #25d366;
}

.pulse-dot {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  border: 1.5px solid #ffffff;
}

/* ─── Textos Descritivos Modernos ────────────────────────────────────────── */
.empty-chat-caption {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 340px;
}

.status-live-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 10px;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  animation: liveBlink 1.6s infinite ease-in-out;
}

@keyframes liveBlink {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.85); }
}

.empty-chat-title {
  font-family: var(--font-heading);
  margin: 0 0 6px 0;
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.015em;
}

.empty-chat-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}

.empty-chat-desc strong {
  color: #334155;
}
</style>
