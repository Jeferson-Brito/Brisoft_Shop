const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'temporary-test-password';
const { requireAuth, requireAdmin } = require('../src/middleware/auth.middleware');
const { initTempAdmin, TEMP_ADMIN_ID } = require('../src/controllers/auth.controller');

function responseRecorder() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('requireAuth rejeita requisição sem token', async () => {
  const res = responseRecorder();
  await requireAuth({ headers: {} }, res, () => assert.fail('next não deveria ser chamado'));
  assert.equal(res.statusCode, 401);
});

test('requireAuth aceita token temporário válido e injeta o usuário', async () => {
  await initTempAdmin();
  const token = jwt.sign({ id: TEMP_ADMIN_ID, role: 'Administrador', is_temporary: true }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  let called = false;
  await requireAuth(req, responseRecorder(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.id, TEMP_ADMIN_ID);
});

test('requireAdmin bloqueia analista', () => {
  const res = responseRecorder();
  requireAdmin({ user: { role: 'Analista' } }, res, () => assert.fail('next não deveria ser chamado'));
  assert.equal(res.statusCode, 403);
});

test('requireAdmin aceita administrador', () => {
  let called = false;
  requireAdmin({ user: { role: 'Administrador' } }, responseRecorder(), () => { called = true; });
  assert.equal(called, true);
});
