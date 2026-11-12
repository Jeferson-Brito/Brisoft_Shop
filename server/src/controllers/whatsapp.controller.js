const whatsappService = require('../services/whatsapp.service');
const { isAdmin } = require('../services/access-control.service');

class WhatsAppController {
  getUserDepartmentIds(user) {
    if (!user) return [];
    const ids = [
      ...(Array.isArray(user.department_ids) ? user.department_ids : []),
      user.department_id
    ].filter(Boolean).map(String);
    return [...new Set(ids)];
  }

  isUserAuthorizedForAccount(user, account) {
    if (!user || !account) return false;
    if (isAdmin(user)) return true;
    const userDepts = this.getUserDepartmentIds(user);
    if (!userDepts.length) return false;
    const accountDept = account.departmentId ? String(account.departmentId) : null;
    const fallbackDept = account.fallbackDepartmentId ? String(account.fallbackDepartmentId) : null;
    return Boolean((accountDept && userDepts.includes(accountDept)) || (fallbackDept && userDepts.includes(fallbackDept)));
  }

  getStatus(req, res) {
    const status = req.user ? whatsappService.getStatusForUser(req.user) : whatsappService.getPublicStatus();
    return res.json({ success: true, ...status });
  }

  listAccounts(req, res) {
    const includeQr = isAdmin(req.user) || req.user?.role === 'Supervisor';
    const allAccounts = whatsappService.getAccounts(includeQr);
    if (isAdmin(req.user)) {
      return res.json({ success: true, accounts: allAccounts });
    }
    const filtered = allAccounts.filter(account => this.isUserAuthorizedForAccount(req.user, account));
    return res.json({ success: true, accounts: filtered });
  }

  async createAccount(req, res) {
    try {
      if (!isAdmin(req.user)) {
        const userDepts = this.getUserDepartmentIds(req.user);
        const targetDept = String(
          req.body?.fallbackDepartmentId ||
          req.body?.fallback_department_id ||
          req.body?.departmentId ||
          req.body?.department_id ||
          ''
        );
        if (!targetDept || !userDepts.includes(targetDept)) {
          return res.status(403).json({ success: false, error: 'Você só pode criar conexões de WhatsApp para os seus departamentos.' });
        }
      }
      const account = await whatsappService.createAccount(req.body?.name, req.body || {});
      return res.status(201).json({ success: true, account });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async connectAccount(req, res) {
    try {
      const allAccounts = whatsappService.getAccounts(true);
      const targetAccount = allAccounts.find(a => String(a.id) === String(req.params.id));
      if (!targetAccount) {
        return res.status(404).json({ success: false, error: 'Conta de WhatsApp não encontrada.' });
      }
      if (!this.isUserAuthorizedForAccount(req.user, targetAccount)) {
        return res.status(403).json({ success: false, error: 'Você não tem permissão para gerenciar a conexão deste WhatsApp.' });
      }
      const account = await whatsappService.initialize(req.params.id);
      return res.json({ success: true, account });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async updateAccount(req, res) {
    try {
      const allAccounts = whatsappService.getAccounts(true);
      const targetAccount = allAccounts.find(a => String(a.id) === String(req.params.id));
      if (!targetAccount) {
        return res.status(404).json({ success: false, error: 'Conta de WhatsApp não encontrada.' });
      }
      if (!this.isUserAuthorizedForAccount(req.user, targetAccount)) {
        return res.status(403).json({ success: false, error: 'Você não tem permissão para alterar este WhatsApp.' });
      }
      if (!isAdmin(req.user)) {
        const userDepts = this.getUserDepartmentIds(req.user);
        const newDept = req.body?.department_id || req.body?.fallback_department_id || req.body?.departmentId || req.body?.fallbackDepartmentId;
        if (newDept && !userDepts.includes(String(newDept))) {
          return res.status(403).json({ success: false, error: 'Você só pode vincular o WhatsApp aos departamentos sob sua supervisão.' });
        }
      }
      const account = await whatsappService.updateAccountRouting(req.params.id, req.body);
      return res.json({ success: true, account });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async disconnectAccount(req, res) {
    try {
      const allAccounts = whatsappService.getAccounts(true);
      const targetAccount = allAccounts.find(a => String(a.id) === String(req.params.id));
      if (!targetAccount) {
        return res.status(404).json({ success: false, error: 'Conta de WhatsApp não encontrada.' });
      }
      if (!this.isUserAuthorizedForAccount(req.user, targetAccount)) {
        return res.status(403).json({ success: false, error: 'Você não tem permissão para desconectar este WhatsApp.' });
      }
      await whatsappService.disconnect(req.params.id);
      return res.json({ success: true, message: 'Conta desconectada. Agora é possível vincular outro número.' });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  }

  async removeAccount(req, res) {
    try {
      const allAccounts = whatsappService.getAccounts(true);
      const targetAccount = allAccounts.find(a => String(a.id) === String(req.params.id));
      if (!targetAccount) {
        return res.status(404).json({ success: false, error: 'Conta de WhatsApp não encontrada.' });
      }
      if (!this.isUserAuthorizedForAccount(req.user, targetAccount)) {
        return res.status(403).json({ success: false, error: 'Você não tem permissão para remover este WhatsApp.' });
      }
      await whatsappService.removeAccount(req.params.id);
      return res.json({ success: true, message: 'Conta removida com sucesso.' });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  }
}

module.exports = new WhatsAppController();
