// ==========================================================================
// BRISOFT SHOP - AUTH CONTROLLER
// Login, logout e sessão de usuários
//
// SEGURANÇA: O administrador temporário existe APENAS em memória (runtime).
// Suas credenciais não são gravadas em arquivo, banco de dados ou código-fonte.
// O hash bcrypt é gerado dinamicamente no startup do processo Node.js.
// ==========================================================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const { enrichUserAccess } = require('../services/access-control.service');
const userCargoService = require('../services/user-cargo.service');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = '24h';

function sanitizePhone(val) {
  if (!val || typeof val !== 'string') return null;
  if (val.includes('@')) return null;
  const digits = val.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 11 && digits[2] === '9') {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }
  return null;
}

// ==========================================================================
// ADMIN TEMPORÁRIO EM MEMÓRIA (runtime only — sem rastro em disco)
// ==========================================================================
// O hash é gerado a partir da senha de bootstrap definida no ambiente.
// É mantido apenas enquanto o processo vive.
// Assim que você criar seu admin definitivo e excluir este, ele desaparece.
let _tempAdminHash = null;
const TEMP_ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@combate.com.br';
const TEMP_ADMIN_ID = '__temp_admin__';

// Inicializa o hash do admin temporário de forma assíncrona no startup
async function initTempAdmin() {
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) {
    console.warn('⚠️ Admin temporário desativado. Defina BOOTSTRAP_ADMIN_PASSWORD apenas no primeiro acesso.');
    return;
  }
  _tempAdminHash = await bcrypt.hash(password, 12);
  console.log('🔑 Admin temporário de bootstrap habilitado em memória.');
}

// Retorna o admin temporário se as credenciais baterem (nunca persiste em disco)
async function checkTempAdmin(email, password) {
  if (!_tempAdminHash) return null;
  if (email.toLowerCase() !== TEMP_ADMIN_EMAIL) return null;
  const match = await bcrypt.compare(password, _tempAdminHash);
  if (!match) return null;
  return {
    id: TEMP_ADMIN_ID,
    name: 'Admin Temporário',
    email: TEMP_ADMIN_EMAIL,
    role: 'Administrador',
    is_temporary: true,
    avatar_url: null,
    department_id: null,
  };
}

// Chamado quando o admin temporário é excluído — apaga o hash da memória
function destroyTempAdmin() {
  _tempAdminHash = null;
  console.log('🗑️ Admin temporário destruído. Acesso com credenciais de bootstrap desabilitado.');
}

function isTempAdminActive() {
  return !!_tempAdminHash;
}

// ==========================================================================
// CONTROLLER
// ==========================================================================

class AuthController {

  /**
   * POST /api/auth/login
   * Body: { email, password }
   */
  async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
    }

    try {
      // 1. Verificar admin temporário primeiro (em memória)
      const tempAdmin = await checkTempAdmin(email, password);
      if (tempAdmin) {
        const token = jwt.sign(
          { id: tempAdmin.id, email: tempAdmin.email, name: tempAdmin.name, role: tempAdmin.role, is_temporary: true },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES }
        );
        const { clearLoginAttempts } = require('../middleware/auth.middleware');
        clearLoginAttempts(req);
        return res.json({ success: true, token, user: tempAdmin });
      }

      // 2. Verificar usuários do banco de dados
      if (!isSupabaseConfigured()) {
        return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
      }

      const { data: users, error } = await supabase
        .from('users')
        .select('id, name, email, role, department_id, avatar_url, password_hash, is_active, is_temporary, phone, departments!users_department_id_fkey(id, name, color)')
        .eq('email', email.toLowerCase())
        .eq('is_active', true)
        .limit(1);

      if (error) throw error;
      if (!users || users.length === 0) {
        return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
      }

      const user = users[0];

      if (!user.password_hash) {
        return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
      }

      const department_name = user.departments ? user.departments.name : null;
      const department_color = user.departments ? user.departments.color : null;

      user.phone = sanitizePhone(user.phone);

      const userWithAccess = await enrichUserAccess({ ...user, department_name, department_color });
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role, is_temporary: !!user.is_temporary, department_id: user.department_id, department_name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      // Retorna os dados do usuário sem o hash da senha
      const { password_hash, ...userPublic } = user;
      Object.assign(userPublic, userWithAccess, { department_name, department_color, phone: user.phone });
      await userCargoService.enrichUserWithCargo(userPublic);
      const { clearLoginAttempts } = require('../middleware/auth.middleware');
      clearLoginAttempts(req);
      return res.json({ success: true, token, user: userPublic });

    } catch (err) {
      console.error('Erro no login:', err);
      return res.status(500).json({ success: false, error: 'Erro interno ao processar login.' });
    }
  }

  /**
   * GET /api/auth/me
   * Retorna dados do usuário logado (a partir do JWT)
   */
  async me(req, res) {
    // req.user é injetado pelo middleware requireAuth
    const { id, is_temporary } = req.user;

    if (is_temporary || id === TEMP_ADMIN_ID) {
      return res.json({
        success: true,
        user: {
          id: TEMP_ADMIN_ID,
          name: 'Admin Temporário',
          email: TEMP_ADMIN_EMAIL,
          role: 'Administrador',
          is_temporary: true,
          avatar_url: null,
          department_id: null,
          department_name: null,
          phone: null,
        }
      });
    }

    try {
      if (!isSupabaseConfigured()) return res.status(503).json({ success: false, error: 'Banco de dados indisponível.' });

      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, department_id, avatar_url, status, is_active, is_temporary, phone, departments!users_department_id_fkey(id, name, color)')
        .eq('id', id)
        .single();

      if (error || !data || data.is_active === false) return res.status(401).json({ success: false, error: 'Usuário inativo ou inexistente.' });
      if (data && data.departments) {
        data.department_name = data.departments.name;
        data.department_color = data.departments.color;
      }
      if (data.phone) {
        if (data.phone.includes('@')) {
          // Se havia um e-mail salvo indevidamente como telefone, limpa no banco e no retorno
          supabase.from('users').update({ phone: null }).eq('id', id).catch(() => {});
          data.phone = null;
        } else {
          data.phone = sanitizePhone(data.phone);
        }
      } else {
        data.phone = null;
      }
      const publicUser = await enrichUserAccess(data);
      await userCargoService.enrichUserWithCargo(publicUser);
      return res.json({ success: true, user: publicUser });
    } catch (err) {
      console.error('Erro ao buscar usuário:', err.message);
      return res.status(401).json({ success: false, error: 'Não foi possível validar a sessão.' });
    }
  }

  /** PUT /api/auth/profile — o e-mail de login nunca é alterado aqui. */
  async updateProfile(req, res) {
    const { id, is_temporary } = req.user;
    if (is_temporary || id === TEMP_ADMIN_ID) {
      return res.status(400).json({ success: false, error: 'Crie um administrador definitivo antes de editar o perfil.' });
    }
    if (!isSupabaseConfigured()) return res.status(503).json({ success: false, error: 'Banco de dados indisponível.' });

    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
    const rawPhone = String(req.body?.phone || '').trim();
    let phone = null;
    if (rawPhone && !rawPhone.includes('@')) {
      const digits = rawPhone.replace(/\D/g, '');
      if (digits.length === 11 && digits[2] === '9') {
        phone = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
      } else if (digits.length > 0) {
        return res.status(400).json({ success: false, error: 'O telefone deve estar no formato (00) 90000-0000 com o 9 obrigatório.' });
      }
    }
    const avatar = req.body?.avatar_url;
    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');

    if (name.length < 3 || name.length > 100 || !name.includes(' ')) {
      return res.status(400).json({ success: false, error: 'Informe nome e sobrenome.' });
    }
    const updates = { name, phone };
    if (avatar === null || avatar === '') {
      updates.avatar_url = null;
    } else if (avatar !== undefined) {
      const match = String(avatar).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match || Buffer.byteLength(match[2], 'base64') > 512 * 1024) {
        return res.status(400).json({ success: false, error: 'Foto inválida ou maior que 512 KB.' });
      }
      updates.avatar_url = avatar;
    }

    try {
      if (req.body?.cargo !== undefined) {
        await userCargoService.setUserCargo(id, req.body.cargo);
      }
      if (newPassword) {
        if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'A nova senha deve ter ao menos 8 caracteres.' });
        if (!currentPassword) return res.status(400).json({ success: false, error: 'Informe a senha atual.' });
        const { data: current, error: currentError } = await supabase.from('users').select('password_hash').eq('id', id).single();
        if (currentError || !current || !(await bcrypt.compare(currentPassword, current.password_hash || ''))) {
          return res.status(400).json({ success: false, error: 'A senha atual está incorreta.' });
        }
        updates.password_hash = await bcrypt.hash(newPassword, 12);
      }
      const { error } = await supabase.from('users').update(updates).eq('id', id);
      if (error) throw error;
      if (updates.password_hash) {
        const { stampCredentialsChanged } = require('../middleware/auth.middleware');
        await stampCredentialsChanged(id);
      }
      const { data: refreshed, error: readError } = await supabase
        .from('users')
        .select('id, name, email, role, department_id, avatar_url, status, is_active, is_temporary, phone, departments!users_department_id_fkey(id, name, color)')
        .eq('id', id)
        .single();
      if (readError || !refreshed) throw readError || new Error('Usuário não encontrado.');
      refreshed.department_name = refreshed.departments?.name || null;
      refreshed.department_color = refreshed.departments?.color || null;
      refreshed.phone = sanitizePhone(refreshed.phone);
      const publicUser = await enrichUserAccess(refreshed);
      await userCargoService.enrichUserWithCargo(publicUser);
      const token = jwt.sign(
        { id: publicUser.id, email: publicUser.email, name: publicUser.name, role: publicUser.role, cargo: publicUser.cargo, is_temporary: false, department_id: publicUser.department_id, department_name: publicUser.department_name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );
      global.broadcastOnlineUsers?.();
      return res.json({ success: true, user: publicUser, token });
    } catch (err) {
      console.error('Erro ao atualizar perfil:', err.message);
      return res.status(500).json({ success: false, error: 'Não foi possível atualizar o perfil.' });
    }
  }

  /**
   * POST /api/auth/logout
   */
  async logout(req, res) {
    // JWT é stateless — o cliente apenas descarta o token
    return res.json({ success: true, message: 'Logout realizado com sucesso.' });
  }
}

module.exports = new AuthController();
module.exports.initTempAdmin = initTempAdmin;
module.exports.destroyTempAdmin = destroyTempAdmin;
module.exports.TEMP_ADMIN_ID = TEMP_ADMIN_ID;
module.exports.TEMP_ADMIN_EMAIL = TEMP_ADMIN_EMAIL;
module.exports.isTempAdminActive = isTempAdminActive;
