const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createShopService}=require('../src/services/shop.service');
const {parseInvoice,answerCatalog}=require('../src/services/shop-invoice');
const a={id:'workflow-a',email:'a@example.test',role:'Administrador'},b={id:'workflow-b',email:'b@example.test',role:'Administrador'};
const product={name:'Arroz branco 5 kg',sku:'ARR001',category:'Alimentos',unit:'UN',barcode:null,price_cents:2490,availability:'AVAILABLE'};
const xml=key=>`<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${key}"><emit><CNPJ>12345678000199</CNPJ><xNome>Fornecedor de teste</xNome></emit><det><prod><cProd>0001</cProd><cEAN>SEM GTIN</cEAN><xProd>Feijão 1 kg</xProd><uCom>UN</uCom><qCom>12.0000</qCom><vUnCom>5.3500</vUnCom></prod></det><det><prod><cProd>0002</cProd><xProd>Açúcar 1 kg</xProd><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>3.00</vUnCom></prod></det></infNFe></NFe></nfeProc>`;
async function setup(options={}){const service=createShopService({allowMemory:true,...options});await service.createCompany(a,{name:'Mercado A',slug:'mercado-a'});await service.createCompany(b,{name:'Mercado B',slug:'mercado-b'});return service;}
test('NF-e: preserva códigos, separa custo e preço e rejeita XML inseguro',()=>{
 const invoice=parseInvoice(xml('1'.repeat(44)));assert.equal(invoice.items[0].supplier_code,'0001');assert.equal(invoice.items[0].cost_cents,535);assert.equal('price_cents' in invoice.items[0],false);
 for(const value of ['<NFe>','<!DOCTYPE a><a/>','<!ENTITY x "test"><a/>',xml('123')])assert.throws(()=>parseInvoice(value));
});
test('NF-e: conferência atômica, isolamento, duplicação e confirmação concorrente',async()=>{
 const service=await setup();const invoice=await service.previewInvoice(a,{xml:xml('2'.repeat(44))});
 await assert.rejects(service.confirmInvoice(b,invoice.id,{items:[{index:0,product}]}),e=>e.status===404);
 await service.save(a,product);
 await assert.rejects(service.confirmInvoice(a,invoice.id,{items:[{index:0,product:{...product,sku:'NEW'}},{index:1,product}]}),e=>e.status===409);
 assert.equal((await service.list(a)).length,1);assert.equal((await service.listImports(a))[0].confirmed_at,null);
 await assert.rejects(service.confirmInvoice(a,invoice.id,{items:[{index:0,product},{index:0,product:{...product,sku:'NEW'}}]}),e=>e.status===409||e.status===400);
 const items=[{index:0,product:{...product,name:'Feijão 1 kg',sku:'FEI001',price_cents:799}}];
 const results=await Promise.allSettled([service.confirmInvoice(a,invoice.id,{items}),service.confirmInvoice(a,invoice.id,{items})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await service.list(a)).length,2);assert.deepEqual(await service.list(b),[]);
 await assert.rejects(service.previewInvoice(a,{xml:xml('2'.repeat(44))}),e=>e.status===409);
 assert.equal((await service.listImports(b)).length,0);
 const sameInvoice=await service.previewInvoice(b,{xml:xml('2'.repeat(44))});assert.notEqual(sameInvoice.id,invoice.id);
});
test('Conversas: preserva mensagens ao transferir, pausa o bot e protege departamentos da outra loja',async()=>{
 const service=await setup();await service.save(a,product);
 const counter=await service.saveDepartment(a,{name:'Balcão',description:'Atendimento inicial',active:true});
 const butcher=await service.saveDepartment(a,{name:'Açougue',description:'Carnes',active:true});
 const foreign=await service.saveDepartment(b,{name:'Caixa',description:'Pagamento',active:true});
 const chat=await service.chat(a,{message:'Qual o preço do arroz?'});assert.match(chat.reply,/24,90/);
 await assert.rejects(service.conversation(b,chat.conversation.id),e=>e.status===404);
 await assert.rejects(service.transfer(a,chat.conversation.id,{department_id:foreign.id,version:1}),e=>e.status===400);
 let current=await service.transfer(a,chat.conversation.id,{department_id:counter.id,version:1,reason:'Atendimento humano'});assert.equal(current.messages.length,2);assert.equal(current.status,'waiting');
 await assert.rejects(service.transfer(a,current.id,{department_id:butcher.id,version:1}),e=>e.status===409);
 const next=await service.chat(a,{message:'Quero falar com o açougue',conversation_id:current.id});assert.equal(next.reply,null);assert.equal(next.conversation.messages.length,3);
 current=await service.transfer(a,current.id,{department_id:butcher.id,version:next.conversation.version,reason:'Consultar carnes'});
 current=await service.reply(a,current.id,{message:'Olá, sou da equipe do açougue.',version:current.version});assert.equal(current.messages.at(-1).role,'staff');assert.equal(current.status,'human');assert.equal(current.transfers.length,2);
 assert.equal(current.messages[0].text,'Qual o preço do arroz?');
 await assert.rejects(service.saveDepartment(a,{name:'Açougue',description:'Carnes',active:false},butcher.id),e=>e.status===409);
 await assert.rejects(service.reply(b,current.id,{message:'Invasão',version:current.version}),e=>e.status===404);
 assert.equal((await service.listConversations(b)).length,0);
 assert.equal((await service.history(a)).filter(e=>e.action==='CHAT_TRANSFERRED').length,2);
  current=await service.closeConversation(a,current.id,{version:current.version});assert.equal(current.status,'closed');
  assert.equal((await service.saveDepartment(a,{name:'Açougue',description:'Carnes',active:false},butcher.id)).active,false);
  await assert.rejects(service.chat(a,{message:'Arroz',conversation_id:current.id}),e=>e.status===409);
});
test('Simulador: disponibilidade manual e ausência de invenção de produtos',()=>{
 assert.match(answerCatalog('Tem arroz?',[{...product,availability:'OUT_OF_STOCK'}]).reply,/sem estoque/);
 assert.doesNotMatch(answerCatalog('Tem arroz?',[{...product,availability:'OUT_OF_STOCK'}]).reply,/24,90/);
 assert.match(answerCatalog('Tem arroz?',[{...product,availability:'DISCONTINUED'}]).reply,/não trabalha mais/);
 assert.match(answerCatalog('Tem batata?',[product]).reply,/Não encontrei/);
});
test('Piloto: dados, notas e histórico sobrevivem à reinicialização local',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brisoft-shop-test-')),file=path.join(dir,'shop.json');
 try{
  const first=await setup({persistencePath:file});await first.save(a,product);await first.updateCompany(a,{name:'Novo nome',phone:'123',description:'Mercado local',address:'Rua Teste',opening_hours:'8h às 18h'});const invoice=await first.previewInvoice(a,{xml:xml('3'.repeat(44))});await first.saveDepartment(a,{name:'Caixa',description:'Pagamentos',active:true});await first.chat(a,{message:'Arroz'});
  const second=createShopService({allowMemory:true,persistencePath:file});assert.equal((await second.context(a)).mode,'local');assert.equal((await second.context(a)).company.name,'Novo nome');assert.equal((await second.list(a))[0].price_cents,2490);assert.equal((await second.listImports(a))[0].id,invoice.id);assert.equal((await second.listDepartments(a))[0].name,'Caixa');assert.equal((await second.listConversations(a)).length,1);assert.equal((await second.history(a)).length,4);
 }finally{for(const entry of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,entry));fs.rmdirSync(dir);}
});
