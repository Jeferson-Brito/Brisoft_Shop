const assert = require('node:assert/strict');

const target = String(process.env.TARGET_URL || '').replace(/\/$/, '');
if (!/^https?:\/\//i.test(target)) {
  console.error('Defina TARGET_URL com a URL pública, por exemplo: https://seu-app.onrender.com');
  process.exit(2);
}

async function request(path, options = {}) {
  return fetch(`${target}${path}`, { redirect: 'manual', ...options });
}

async function run() {
  const health = await request('/api/health');
  assert.equal(health.status, 200, 'A rota de saúde deve responder 200');

  const root = await request('/');
  assert.equal(root.status, 200, 'A aplicação deve responder 200');
  assert.equal(root.headers.get('x-powered-by'), null, 'O servidor não deve revelar Express');
  assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(root.headers.get('x-frame-options'), 'DENY');
  assert.match(root.headers.get('content-security-policy') || '', /default-src 'self'/);

  for (const path of ['/api/users', '/api/system/logs', '/api/tickets', '/api/settings']) {
    const response = await request(path);
    assert.equal(response.status, 401, `${path} deve exigir autenticação`);
  }

  const traversal = await request('/api/media/%2e%2e%2f.env');
  assert.ok([400, 401, 404].includes(traversal.status), 'Tentativa de travessia de diretório deve ser bloqueada');

  const cors = await request('/api/health', { headers: { Origin: 'https://site-malicioso.invalid' } });
  assert.notEqual(cors.headers.get('access-control-allow-origin'), 'https://site-malicioso.invalid', 'Origem não autorizada não pode receber CORS');

  console.log('Verificações públicas de segurança aprovadas.');
}

run().catch(error => {
  console.error(`Falha na verificação de segurança: ${error.message}`);
  process.exit(1);
});
