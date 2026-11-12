const wallboardService = require('../services/wallboard.service');
const whatsappService = require('../services/whatsapp.service');

class WallboardController {
  async getData(req, res) {
    try {
      const wallboard = await wallboardService.getData(req.user, {
        departmentId: req.query.departmentId,
        force: req.query.force === 'true',
        includeAvatars: req.query.includeAvatars === 'true'
      }, req.app.get('io'), whatsappService);
      return res.json({ success: true, wallboard });
    } catch (error) {
      const status = /selecione|não encontrado/i.test(error.message || '') ? 400 : 500;
      return res.status(status).json({ success: false, error: error.message });
    }
  }

  async saveConfig(req, res) {
    try {
      const departmentId = String(req.body.departmentId || '');
      if (!departmentId) return res.status(400).json({ success: false, error: 'Departamento obrigatório.' });
      const config = await wallboardService.saveConfig(departmentId, req.body.config || {});
      return res.json({ success: true, config });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new WallboardController();
