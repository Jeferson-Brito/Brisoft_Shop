const quickMessageService = require('../services/quick-message.service');

class QuickMessageController {
  async list(req, res) {
    try {
      const messages = await quickMessageService.list(req.user, req.user?.role === 'Analista');
      return res.json({ success: true, messages });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async create(req, res) {
    try {
      const message = await quickMessageService.create(req.body, req.user);
      return res.status(201).json({ success: true, message });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async update(req, res) {
    try {
      const message = await quickMessageService.update(req.params.id, req.body, req.user);
      return res.json({ success: true, message });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async remove(req, res) {
    try {
      await quickMessageService.remove(req.params.id, req.user);
      return res.json({ success: true });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  }
}

module.exports = new QuickMessageController();
