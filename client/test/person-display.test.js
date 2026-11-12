import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePersonName, splitPersonLabel } from '../src/utils/person-display.js'

test('suaviza nomes inteiramente em caixa alta', () => {
  assert.equal(normalizePersonName('ERALDO LIMA DOS SANTOS'), 'Eraldo Lima dos Santos')
})

test('preserva nomes que já possuem capitalização intencional', () => {
  assert.equal(normalizePersonName('João da Silva'), 'João da Silva')
})

test('separa nome e cargo sem alterar o cargo', () => {
  assert.deepEqual(splitPersonLabel('ERALDO LIMA - Técnico de Segurança Eletrônica'), {
    name: 'Eraldo Lima',
    role: 'Técnico de Segurança Eletrônica'
  })
})
