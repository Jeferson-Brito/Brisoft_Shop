const test=require('node:test'),assert=require('node:assert/strict');
const {parsePdfInvoice,parsePdfPages}=require('../src/services/shop-pdf');
const {createShopService}=require('../src/services/shop.service');
const key='35260112345678000190550010000000011000000010';
const item=(text,x,y)=>({text,x,y});
function page(extra=[]){return [item('RECEBEMOS DE FORNECEDOR TESTE OS PRODUTOS CONSTANTES DA NOTA',20,790),item(key,20,750),item('DADOS DO PRODUTO/SERVICO',20,500),item('CODIGO DESCRICAO',20,480),item('NCM/SH CST CFOP UNID QTD VLR UNIT TOTAL',235,480),item('2172 THINNER TESTE 32082011 0102 5102 UN 4 96,00 384,00',20,460),...extra,item('DADOS ADICIONAIS',20,100)];}
// Valid PDF generated only in memory; no customer documents in fixtures.
function pdf(pages){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];const kids=[];
 for(const rows of pages){const pid=objects.length+1,cid=pid+1;kids.push(pid+' 0 R');
  const stream=rows.map(r=>`BT /F1 8 Tf 1 0 0 1 ${r.x} ${r.y} Tm (${r.text.replace(/[()\\]/g,'\\$&')}) Tj ET`).join('\n');
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cid} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
 }
 objects[1]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}] >>`;
 let value='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(value));value+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(value);
 value+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(value).toString('base64');
}
test('PDF: lê DANFE e preserva código, unidade, quantidade e custo unitário',async()=>{
 const invoice=await parsePdfInvoice(pdf([page()]));assert.equal(invoice.key,key);assert.equal(invoice.source,'pdf');assert.equal(invoice.items.length,1);assert.equal(invoice.items[0].cost_cents,9600);assert.equal(invoice.items[0].quantity,'4');assert.equal(invoice.items[0].unit,'UN');assert.equal(invoice.items[0].sku,'12345678000190-2172');assert.ok(invoice.warnings.length);
});
test('PDF: descrições quebradas e várias páginas não perdem itens',()=>{
 const first=page([item('COMPLEMENTO DA DESCRICAO',55,450)]),second=page().map(i=>({...i,text:i.text.replace('2172 THINNER','2173 THINNER')}));
 const result=parsePdfPages([first,second]);assert.equal(result.items.length,2);assert.match(result.items[0].name,/COMPLEMENTO/);assert.equal(result.items[1].index,1);
});
test('PDF: rejeita imagem, arquivos inválidos, notas misturadas e valores inconsistentes',async()=>{
 await assert.rejects(parsePdfInvoice(pdf([[]])),/OCR/);
 await assert.rejects(parsePdfInvoice(Buffer.from('arquivo falso').toString('base64')),/inválido/);
 await assert.rejects(parsePdfInvoice('a'.repeat(2666672)),/2 MB/);
 await assert.rejects(parsePdfInvoice(Buffer.from('%PDF-1.4 corrompido').toString('base64')));
 await assert.rejects(parsePdfInvoice(pdf(Array.from({length:21},()=>[]))),/20 páginas/);
 assert.throws(()=>parsePdfPages([page([item('ITEM 2 ILEGIVEL',20,440)])]),/linhas/);
 assert.throws(()=>parsePdfPages([page().map(i=>({...i,text:i.text.replace('384,00','380,00')}))]),/não conferem/);
 assert.throws(()=>parsePdfPages([page([item('35260112345678000190550010000000011000000011',20,720)])]),/única chave/);
});
test('PDF: conferência obrigatória, isolamento e duplicidade entre XML e PDF',async()=>{
 const service=createShopService({allowMemory:true}),admin={id:'pdf-admin',role:'Administrador'},other={id:'pdf-other',role:'Administrador'};
 await service.createCompany(admin,{name:'Mercado PDF',slug:'mercado-pdf'});await service.createCompany(other,{name:'Outra loja PDF',slug:'outra-pdf'});
 const encoded=pdf([page()]),preview=await service.previewInvoice(admin,{pdf:encoded});assert.equal((await service.list(admin)).length,0);
 await assert.rejects(service.previewInvoice({...admin,role:'Analista'},{pdf:encoded}),e=>e.status===403);
 await assert.rejects(service.previewInvoice(admin,{pdf:encoded,xml:'<xml/>'}),e=>e.status===400);
 await assert.rejects(service.confirmInvoice(other,preview.id,{items:[]}),e=>e.status===404);
 await assert.rejects(service.confirmInvoice(admin,preview.id,{items:[{index:0,product:{}}]}));assert.equal((await service.list(admin)).length,0);
 const product={name:preview.items[0].name,sku:preview.items[0].sku,category:'Tintas',unit:'UN',barcode:null,availability:'AVAILABLE',price_cents:12000};
 await service.confirmInvoice(admin,preview.id,{items:[{index:0,product}]});assert.equal((await service.list(admin))[0].price_cents,12000);
 await assert.rejects(service.previewInvoice(admin,{pdf:encoded}),e=>e.status===409);
 const xml=`<NFe><infNFe Id="NFe${key}"><emit><xNome>Fornecedor</xNome></emit><det><prod><cProd>2172</cProd><xProd>Thinner</xProd><uCom>UN</uCom><vUnCom>96.00</vUnCom></prod></det></infNFe></NFe>`;
 await assert.rejects(service.previewInvoice(admin,{xml}),e=>e.status===409);
 assert.ok((await service.previewInvoice(other,{pdf:encoded})).id);
 const automatic=await service.readInvoice(other,{pdf:encoded});assert.equal(automatic.count,1);assert.equal((await service.list(other))[0].price_cents,null);assert.ok(automatic.invoice.confirmed_at);
});
