const notesService = require('../services/notes.service');

class NotesController {
  async list(req, res) {
    try {
      const notes = await notesService.list(req.user, req.query.user_id);
      return res.json({ success: true, notes });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async save(req, res) {
    try {
      const input = { ...req.body, id: req.params.id || req.body.id };
      const note = await notesService.save(input, req.user);
      return res.json({ success: true, note });
    } catch (error) {
      const status = error.message.includes('permissão') ? 403 : 400;
      return res.status(status).json({ success: false, error: error.message });
    }
  }

  async remove(req, res) {
    try {
      await notesService.remove(req.params.id, req.user);
      return res.json({ success: true });
    } catch (error) {
      const status = error.message.includes('permissão') ? 403 : 400;
      return res.status(status).json({ success: false, error: error.message });
    }
  }
}

module.exports = new NotesController();
