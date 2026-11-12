const test=require('node:test'),assert=require('node:assert/strict');
const {createShopService}=require('../src/services/shop.service');
const {answerCatalog}=require('../src/services/shop-invoice');
test('NF-e: leitura cadastra sem preço, preserva produtos existentes e permite precificar depois',async()=>{
 const service=createShopService({allowMemory:true}),user={id:'auto-import',role:'Administrador'},other={id:'auto-other',role:'Administrador'};
 await service.createCompany(user,{name:'Mercado automático',slug:'mercado-auto'});await service.createCompany(other,{name:'Outra loja',slug:'outra-auto'});
 const xml=number=>`<NFe><infNFe Id="NFe3526011234567800019055001000000001100000001${number}"><emit><xNome>Fornecedor teste</xNome><CNPJ>12345678000190</CNPJ></emit><det><prod><cProd>1</cProd><xProd>Produto da nota</xProd><uCom>UN</uCom><vUnCom>96.00</vUnCom><qCom>4</qCom></prod></det></infNFe></NFe>`;
 const result=await service.readInvoice(user,{xml:xml(0)});assert.equal(result.count,1);assert.ok(result.invoice.confirmed_at);
 let [product]=await service.list(user);assert.equal(product.price_cents,null);assert.equal(product.availability,'OUT_OF_STOCK');assert.equal((await service.list(other)).length,0);
 assert.equal((await service.registerInvoice(user,result.invoice.id)).count,0);
 await assert.rejects(service.registerInvoice(other,result.invoice.id),e=>e.status===404);
 const input={name:product.name,sku:product.sku,category:product.category,unit:product.unit,barcode:product.barcode,price_cents:null,availability:'AVAILABLE',version:product.version};
 product=await service.save(user,input,product.id);
 const reply=answerCatalog('Produto da nota',[product]).reply;assert.match(reply,/preço de venda ainda não informado/);assert.doesNotMatch(reply,/R\$/);
 const priced=await service.save(user,{...input,price_cents:12345,version:product.version},product.id);
 assert.equal((await service.readInvoice(user,{xml:xml(1)})).count,0);assert.equal((await service.list(user))[0].price_cents,12345);assert.equal((await service.list(user))[0].version,priced.version);
 assert.equal((await service.history(user)).filter(h=>h.action==='NFE_PRODUCT_CREATED').length,1);
});
