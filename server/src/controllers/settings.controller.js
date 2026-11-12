// ==========================================================================
// SETTINGS CONTROLLER (system_settings)
// ==========================================================================

const { supabase } = require('../config/supabase');
const { DEFAULT_BOT_CONFIG, normalizeBotConfig, invalidateBotConfigCache } = require('../services/bot-config.service');
const { isAdmin } = require('../services/access-control.service');

class SettingsController {
  
  async getSettings(req, res) {
    try {
      const { data, error } = await supabase.from('system_settings').select('*');
      
      if (error && error.code !== 'PGRST205') {
        throw error;
      }
      
      const settings = {};
      if (data) {
        data.forEach(item => {
          settings[item.key] = item.value;
        });
      }
      settings.bot_config = normalizeBotConfig(settings.bot_config || DEFAULT_BOT_CONFIG);
      settings.whatsapp_disconnect_rules = settings.whatsapp_disconnect_rules || {
        queue_retention_minutes: 60,
        discard_hours: 24
      };

      return res.json({ success: true, settings });
    } catch (error) {
      console.error('Erro ao buscar settings:', error);
      return res.status(500).json({ success: false, error: 'Erro interno ao buscar configurações.' });
    }
  }

  async saveSetting(req, res) {
    const { key, value } = req.body;
    if (!key || typeof value === 'undefined') {
      return res.status(400).json({ success: false, error: 'Chave (key) e valor (value) são obrigatórios.' });
    }

    if (!isAdmin(req.user) && key !== 'company_info') {
      return res.status(403).json({ success: false, error: 'Apenas administradores podem alterar esta configuração.' });
    }

    try {
      let normalizedValue = value;
      if (key === 'whatsapp_disconnect_rules') {
        normalizedValue = {
          queue_retention_minutes: Math.max(1, Math.min(10080, Number(value?.queue_retention_minutes) || 60)),
          discard_hours: Math.max(1, Math.min(720, Number(value?.discard_hours) || 24))
        };
      }
      if (key === 'bot_config') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return res.status(400).json({ success: false, error: 'Configuração do bot inválida.' });
        }
        normalizedValue = normalizeBotConfig(value);
        if ((!normalizedValue.enabled || normalizedValue.auto_route_after_invalid || normalizedValue.human_handoff_enabled) && !normalizedValue.default_department_id) {
          return res.status(400).json({ success: false, error: 'Defina o departamento padrão para o roteamento automático.' });
        }
        if (normalizedValue.default_department_id) {
          const { data: department } = await supabase
            .from('departments').select('id').eq('id', normalizedValue.default_department_id).maybeSingle();
          if (!department) return res.status(400).json({ success: false, error: 'Departamento padrão inválido.' });
        }
      }
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key, value: normalizedValue, updated_at: new Date() }, { onConflict: 'key' });

      if (error) {
        throw error;
      }

      if (key === 'bot_config') invalidateBotConfigCache();

      return res.json({ success: true, value: normalizedValue, message: 'Configuração salva com sucesso.' });
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      return res.status(500).json({ success: false, error: 'Erro interno ao salvar configuração.' });
    }
  }

}

module.exports = new SettingsController();
