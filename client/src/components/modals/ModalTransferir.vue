<template>
  <Teleport to="body">
    <div class="modal-overlay active" style="z-index:9999;" @click.self="$emit('close')">
      <div class="modal-container" role="dialog" aria-modal="true" aria-label="Transferir atendimento" style="max-width:480px;width:100%;">
        <!-- Modal Header -->
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:32px;height:32px;border-radius:6px;background:#eff6ff;color:var(--brand-primary);display:flex;align-items:center;justify-content:center;font-size:14px;">
              <i class="fa-solid fa-arrow-right-arrow-left"></i>
            </div>
            <div>
              <h3 class="modal-title" style="margin:0;font-size:14px;color:var(--text-main);">Transferir atendimento</h3>
              <span style="font-size:11.5px;color:var(--text-muted);">
                Cliente: <strong>{{ normalizePersonName(ticket?.customer_name || ticket?.clientName || ticket?.client_name || 'Cliente') }}</strong>
              </span>
            </div>
          </div>
          <button type="button" class="btn-icon" @click="$emit('close')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:16px;background:#ffffff;">
          <!-- Informação Atual -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">
            <span style="color:#64748b;">Departamento atual:</span>
            <span class="badge" style="background:#e0e7ff;color:#4338ca;font-weight:600;">
              {{ ticket?.department_name || ticket?.department || 'Assistente / sem departamento' }}
            </span>
          </div>

          <!-- Seleção do Novo Departamento -->
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:12.5px;font-weight:600;color:#334155;margin-bottom:6px;display:block;">
              Novo Departamento <span style="color:#ef4444;">*</span>
            </label>
            <select
              v-model="selectedDeptId"
              class="form-control"
              style="width:100%;height:38px;font-size:13px;border-radius:6px;"
              required
              @change="onDeptChange"
            >
              <option value="" disabled>Selecione o departamento de destino...</option>
              <option
                v-for="dept in availableDepartments"
                :key="dept.id"
                :value="dept.id"
              >
                {{ dept.name }}
              </option>
            </select>
          </div>

          <!-- Motivo / Observação -->
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:12.5px;font-weight:600;color:#334155;margin-bottom:6px;display:block;">
              Motivo da Transferência <span style="font-size:11px;color:#94a3b8;font-weight:normal;">(Opcional)</span>
            </label>
            <textarea
              v-model="transferNote"
              class="form-control"
              rows="3"
              placeholder="Ex.: Cliente precisa consultar um produto do açougue."
              style="width:100%;resize:none;font-size:12.5px;border-radius:6px;padding:8px 10px;"
            ></textarea>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 20px;display:flex;justify-content:flex-end;gap:10px;">
          <button
            type="button"
            class="btn-secondary"
            :disabled="loading"
            @click="$emit('close')"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="loading || !selectedDeptId"
            style="gap:6px;"
            @click="handleConfirmTransfer"
          >
            <i v-if="loading" class="fa-solid fa-spinner fa-spin"></i>
            <i v-else class="fa-solid fa-check"></i>
            {{ loading ? 'Transferindo...' : 'Confirmar Transferência' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref,computed } from 'vue'
import { useShopStore } from '@/stores/shop.store'
import { useUiStore } from '@/stores/ui.store'
import { shopApi } from '@/api/shop.api'
import { normalizePersonName } from '@/utils/person-display'
const props=defineProps({ticket:{type:Object,required:true}}),emit=defineEmits(['close','transferred'])
const shop=useShopStore(),ui=useUiStore(),loading=ref(false),selectedDeptId=ref(''),transferNote=ref('')
const availableDepartments=computed(()=>shop.departments.filter(d=>d.active&&d.id!==props.ticket.department_id))
function onDeptChange(){}
async function handleConfirmTransfer(){
 if(!selectedDeptId.value||loading.value)return
 loading.value=true
 try{const {data}=await shopApi.transfer(props.ticket.id,{department_id:selectedDeptId.value,reason:transferNote.value,version:props.ticket.version});ui.showToast('Conversa transferida para '+data.department_name+'.');emit('transferred',data.conversation);emit('close')}
 catch(e){ui.showToast(e.response?.data?.error||'Não foi possível transferir. Atualize a conversa.','error',7000)}
 finally{loading.value=false}
}
</script>
