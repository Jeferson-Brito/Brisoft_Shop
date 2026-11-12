const test = require('node:test');
const assert = require('node:assert/strict');
const whatsappController = require('../src/controllers/whatsapp.controller');
const whatsappService = require('../src/services/whatsapp.service');

test('WhatsAppController.isUserAuthorizedForAccount valida permissões por departamento e admin', () => {
  const adminUser = {
    id: 'user-admin',
    role: 'Administrador',
    department_id: null
  };

  const suporteUser = {
    id: 'user-suporte',
    role: 'Atendente',
    department_id: 'dept-suporte',
    department_ids: ['dept-suporte']
  };

  const multiDeptUser = {
    id: 'user-multi',
    role: 'Atendente',
    department_id: 'dept-comercial',
    department_ids: ['dept-comercial', 'dept-financeiro']
  };

  const accountSuporte = {
    id: 'acc-1',
    name: 'WhatsApp Suporte',
    departmentId: 'dept-suporte',
    fallbackDepartmentId: null
  };

  const accountComercial = {
    id: 'acc-2',
    name: 'WhatsApp Comercial',
    departmentId: 'dept-comercial',
    fallbackDepartmentId: null
  };

  const accountFinanceiroFallback = {
    id: 'acc-3',
    name: 'WhatsApp Geral (Fallback Financeiro)',
    departmentId: null,
    fallbackDepartmentId: 'dept-financeiro'
  };

  const accountOutro = {
    id: 'acc-4',
    name: 'WhatsApp Outro',
    departmentId: 'dept-rh',
    fallbackDepartmentId: null
  };

  // 1. Admin pode acessar qualquer conta
  assert.equal(whatsappController.isUserAuthorizedForAccount(adminUser, accountSuporte), true);
  assert.equal(whatsappController.isUserAuthorizedForAccount(adminUser, accountComercial), true);
  assert.equal(whatsappController.isUserAuthorizedForAccount(adminUser, accountOutro), true);

  // 2. Atendente de Suporte só pode acessar conta vinculada ao Suporte
  assert.equal(whatsappController.isUserAuthorizedForAccount(suporteUser, accountSuporte), true);
  assert.equal(whatsappController.isUserAuthorizedForAccount(suporteUser, accountComercial), false);
  assert.equal(whatsappController.isUserAuthorizedForAccount(suporteUser, accountOutro), false);

  // 3. Atendente multi-departamento acessa Comercial e Financeiro, mas não Suporte ou Outro
  assert.equal(whatsappController.isUserAuthorizedForAccount(multiDeptUser, accountComercial), true);
  assert.equal(whatsappController.isUserAuthorizedForAccount(multiDeptUser, accountFinanceiroFallback), true);
  assert.equal(whatsappController.isUserAuthorizedForAccount(multiDeptUser, accountSuporte), false);
  assert.equal(whatsappController.isUserAuthorizedForAccount(multiDeptUser, accountOutro), false);
});

test('whatsappService.getStatusForUser filtra contas pelo departamento do atendente', () => {
  const originalAccounts = whatsappService.accounts;
  whatsappService.accounts = new Map([
    ['acc-1', { id: 'acc-1', name: 'Suporte', status: 'disconnected', departmentId: 'dept-suporte' }],
    ['acc-2', { id: 'acc-2', name: 'Vendas', status: 'connected', departmentId: 'dept-vendas' }]
  ]);

  try {
    const adminUser = { role: 'Administrador' };
    const adminStatus = whatsappService.getStatusForUser(adminUser);
    assert.equal(adminStatus.accounts.length, 2);

    const suporteUser = { role: 'Atendente', department_id: 'dept-suporte', department_ids: ['dept-suporte'] };
    const suporteStatus = whatsappService.getStatusForUser(suporteUser);
    assert.equal(suporteStatus.accounts.length, 1);
    assert.equal(suporteStatus.accounts[0].id, 'acc-1');

    const financeiroUser = { role: 'Atendente', department_id: 'dept-financeiro' };
    const financeiroStatus = whatsappService.getStatusForUser(financeiroUser);
    assert.equal(financeiroStatus.accounts.length, 0);
  } finally {
    whatsappService.accounts = originalAccounts;
  }
});

test('Supervisor tem autorização para gerenciar e conectar/desconectar WhatsApp de seus departamentos', () => {
  const supervisor = {
    id: 'sup-1',
    role: 'Supervisor',
    department_id: 'dept-vendas',
    department_ids: ['dept-vendas', 'dept-pos-venda']
  };

  const accountVendas = { id: 'w1', name: 'WPP Vendas', departmentId: 'dept-vendas' };
  const accountPosVenda = { id: 'w2', name: 'WPP Pós Venda', fallbackDepartmentId: 'dept-pos-venda' };
  const accountFinanceiro = { id: 'w3', name: 'WPP Financeiro', departmentId: 'dept-financeiro' };

  assert.equal(whatsappController.isUserAuthorizedForAccount(supervisor, accountVendas), true);
  assert.equal(whatsappController.isUserAuthorizedForAccount(supervisor, accountPosVenda), true);
  assert.equal(whatsappController.isUserAuthorizedForAccount(supervisor, accountFinanceiro), false);
});
