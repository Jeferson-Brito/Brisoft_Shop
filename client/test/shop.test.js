import test from 'node:test'
import assert from 'node:assert/strict'
import {priceCents,normalize,money} from '../src/utils/shop.js'
test('Preços: aceita reais com vírgula ou ponto e bloqueia valores ambíguos',()=>{
 assert.equal(priceCents('24,90'),2490);assert.equal(priceCents('0.01'),1);assert.equal(priceCents('0'),0);
 for(const value of ['-1','1,234','1.000,00','abc','1000000.01',''])assert.throws(()=>priceCents(value));
})
test('Busca: encontra produtos com acentos independentemente da digitação',()=>{assert.equal(normalize('AÇÚCAR'),normalize('acucar'))})

test('Preço pendente não é confundido com preço zero',()=>{assert.equal(money(null),'Preço pendente');assert.match(money(0),/0,00/);assert.notEqual(money(null),money(0))})
