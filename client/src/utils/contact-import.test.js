import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, rowsToContacts } from './contact-import.js'

test('converte planilha de contatos reconhecendo aliases e funcionários', () => {
  const contacts = rowsToContacts([
    ['Nome completo', 'WhatsApp', 'E-mail', 'CPF/CNPJ', 'Tipo'],
    ['Maria Silva', '5583999990000', 'maria@empresa.com', '123', 'Funcionária'],
    ['Cliente Um', '5583888880000', '', '456', 'Cliente']
  ])
  assert.equal(contacts.length, 2)
  assert.equal(contacts[0].is_employee, true)
  assert.equal(contacts[1].is_employee, false)
})

test('lê CSV separado por ponto e vírgula e preserva campos entre aspas', () => {
  const rows = parseCsv('Nome;Telefone;Observações\n"Empresa, A";5583999990000;"Cliente ativo"')
  assert.equal(rows[1][0], 'Empresa, A')
  assert.equal(rowsToContacts(rows)[0].notes, 'Cliente ativo')
})
