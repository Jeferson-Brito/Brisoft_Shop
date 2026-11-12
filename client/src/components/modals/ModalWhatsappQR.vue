<template>
  <Teleport to="body">
    <div class="modal-overlay active" id="modalWhatsappQr" @click.self="ui.closeModal('whatsappQr')">
      <div class="modal-container" style="max-width:400px;text-align:center;">
        <div class="modal-header" style="justify-content:center;position:relative;">
          <span class="modal-title" style="display:flex;align-items:center;gap:6px;">
            <i class="fa-brands fa-whatsapp" style="color:#22c55e;font-size:18px;"></i>
            Conectar WhatsApp
          </span>
          <button
            type="button"
            class="btn-icon"
            style="position:absolute;right:14px;top:14px;"
            @click="ui.closeModal('whatsappQr')"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="modal-body" style="padding:24px 20px;display:flex;flex-direction:column;align-items:center;">
          <p style="font-size:12.5px;color:#64748b;margin:0 0 16px 0;line-height:1.45;">
            Abra o WhatsApp no celular, vá em <strong>Aparelhos conectados</strong> &gt; <strong>Conectar um aparelho</strong> e aponte para o QR Code:
          </p>

          <!-- QR Code Image -->
          <div
            style="width:240px;height:240px;border-radius:12px;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden;"
          >
            <img
              v-if="ui.whatsappQrCode"
              :src="ui.whatsappQrCode"
              alt="QR Code WhatsApp"
              style="width:100%;height:100%;object-fit:contain;"
            />
            <div v-else style="display:flex;flex-direction:column;align-items:center;gap:8px;color:#94a3b8;font-size:12px;">
              <i class="fa-solid fa-spinner fa-spin" style="font-size:32px;color:#3b82f6;"></i>
              <span>Gerando QR Code...</span>
            </div>
          </div>

          <span style="font-size:11px;color:#94a3b8;margin-top:14px;">
            O QR Code atualiza automaticamente a cada 20 segundos.
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useUiStore } from '@/stores/ui.store'

const ui = useUiStore()
</script>
