const test = require('node:test');
const assert = require('node:assert/strict');
const notesService = require('../src/services/notes.service');

test('Notas: Atendente lista apenas suas próprias notas e Admin vê todas', async () => {
  const user1 = { id: 'u1', name: 'Atendente João', role: 'agent' };
  const user2 = { id: 'u2', name: 'Atendente Maria', role: 'agent' };
  const admin = { id: 'adm', name: 'Admin Master', role: 'admin' };

  // Cria nota para user1
  const n1 = await notesService.save({ title: 'Nota do João', content: 'Lembrete' }, user1);
  assert.equal(n1.user_id, 'u1');
  assert.equal(n1.user_name, 'Atendente João');

  // Cria nota para user2
  const n2 = await notesService.save({ title: 'Nota da Maria', content: 'Protocolo' }, user2);
  assert.equal(n2.user_id, 'u2');

  // Atendente 1 lista suas notas
  const listU1 = await notesService.list(user1);
  assert.equal(listU1.some(n => n.id === n1.id), true);
  assert.equal(listU1.some(n => n.id === n2.id), false);

  // Atendente 2 lista suas notas
  const listU2 = await notesService.list(user2);
  assert.equal(listU2.some(n => n.id === n2.id), true);
  assert.equal(listU2.some(n => n.id === n1.id), false);

  // Admin lista todas
  const listAdmin = await notesService.list(admin);
  assert.equal(listAdmin.some(n => n.id === n1.id), true);
  assert.equal(listAdmin.some(n => n.id === n2.id), true);

  // Admin filtra por user1
  const listFiltered = await notesService.list(admin, 'u1');
  assert.equal(listFiltered.every(n => n.user_id === 'u1'), true);

  // Cleanup
  await notesService.remove(n1.id, admin);
  await notesService.remove(n2.id, admin);
});

test('Notas: Atendente não pode remover nota de outro usuário', async () => {
  const user1 = { id: 'u1', name: 'João', role: 'agent' };
  const user2 = { id: 'u2', name: 'Maria', role: 'agent' };

  const note = await notesService.save({ title: 'Nota Privada', content: 'Texto' }, user1);

  await assert.rejects(async () => {
    await notesService.remove(note.id, user2);
  }, /Permissão negada/);

  // Autor original pode remover
  const res = await notesService.remove(note.id, user1);
  assert.equal(res.success, true);
});
