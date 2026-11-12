const {Worker}=require('node:worker_threads');
const path=require('node:path');
let active=0;
const normalized=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function lines(items){
 const result=[];
 for(const item of [...items].sort((a,b)=>b.y-a.y||a.x-b.x)){
  let row=result.at(-1);if(row&&Math.abs(row.y-item.y)>=2)row=null;
  if(!row){row={y:item.y,items:[]};result.push(row);}row.items.push(item);
 }
 return result.sort((a,b)=>b.y-a.y).map(r=>({...r,text:r.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')}));
}
function decimal(value){
 if(!/^\d+(?:\.\d{3})*(?:,\d+)?$/.test(value))throw new Error('Não foi possível reconhecer os valores dos itens. Utilize o XML da nota.');
 return Number(value.replace(/\./g,'').replace(',','.'));
}
function parsePdfPages(pages){
 const all=pages.map(lines),text=all.flat().map(r=>r.text).join('\n');
 if(text.replace(/\s/g,'').length<80)throw new Error('Este PDF não contém texto legível. PDFs digitalizados precisam de OCR; envie o XML ou um PDF com texto selecionável.');
 const keys=[...text.matchAll(/(?<!\d)(?:\d{4}[ \t]*){10}\d{4}(?!\d)/g)].map(m=>m[0].replace(/\s/g,''));
 const distinct=[...new Set(keys)];
 if(distinct.length!==1)throw new Error('Não foi possível identificar uma única chave de NF-e de 44 dígitos. Envie um DANFE por arquivo ou utilize o XML.');
 const key=distinct[0],supplierMatch=text.match(/RECEBEMOS DE\s+([\s\S]+?)\s+OS PRODUTOS/i);
 const supplier=supplierMatch?.[1].replace(/\s+/g,' ').trim();
 if(!supplier)throw new Error('Não foi possível identificar o emitente no DANFE. Utilize o XML da nota.');
 const items=[];
 for(const page of all){
  const heading=page.findIndex(r=>/DADOS DO[S]? PRODUTO/.test(normalized(r.text)));
  if(heading<0)continue;
  let started=false,ncmX=null;
  for(const row of page.slice(heading+1)){
   const norm=normalized(row.text);
   if(/DADOS ADICIONAIS|INFORMACOES COMPLEMENTARES|CALCULO DO ISSQN/.test(norm))break;
   const header=row.items.find(i=>/NCM/.test(normalized(i.text)));
   if(header){ncmX=header.x;continue;}
   if(!ncmX)continue;
   const match=row.text.match(/^(\S+)\s+(.+?)\s+(\d{8})\s+(\d{2,4})\s+(\d{4})\s+([A-Za-z0-9]{1,12})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)(?:\s+.*)?$/);
   if(match){
    started=true;
    const [,code,name,,,cfop,unit,quantity,costValue,totalValue]=match;
    const cost=decimal(costValue),qty=decimal(quantity),total=decimal(totalValue);
    if(!qty||!Number.isFinite(cost)||cost<0||cost>1000000||Math.abs(qty*cost-total)>Math.max(0.05,qty*0.0001))throw new Error('Os valores de um item não conferem no PDF. Utilize o XML para uma leitura precisa.');
    items.push({index:items.length,supplier_code:code,sku:`${key.slice(6,20)}-${code}`.slice(0,80),name:name.slice(0,180),unit,barcode:null,quantity,cost_cents:Math.round(cost*100)});
    if(items.length>500)throw new Error('A nota deve conter até 500 produtos.');
   }else if(started){
    // Accept wrapped descriptions only inside the description column.
    const prior=items.at(-1);
    const codeX=page.find(r=>r.text.startsWith(prior.supplier_code+' '))?.items[0].x;
    if(row.items.every(i=>i.x>codeX+10&&i.x<ncmX-5))prior.name=(prior.name+' '+row.text).slice(0,180);
    else throw new Error('Há linhas de produtos que não puderam ser lidas com segurança. Utilize o XML da nota.');
   }else if(!/^(?:CSOSN|ICMS|CST)(?:\s|$)/.test(norm)){
    throw new Error('O formato da tabela deste PDF não foi reconhecido. Utilize o XML da nota.');
   }
  }
 }
 if(!items.length)throw new Error('Nenhum produto foi reconhecido neste DANFE. Utilize o XML da nota.');
 return {key,supplier:supplier.slice(0,180),source:'pdf',warnings:['Leitura de PDF: confira todos os produtos, unidades, quantidades e custos com o documento original. O custo é unitário e não inclui o rateio de descontos ou frete.'],items};
}
function parsePdfInvoice(base64){
 if(typeof base64!=='string'||base64.length>2666668||!base64.length||base64.length%4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))return Promise.reject(new Error('Selecione um PDF de até 2 MB.'));
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length>2000000||bytes.subarray(0,5).toString()!=='%PDF-')return Promise.reject(new Error('Arquivo PDF inválido ou maior que 2 MB.'));
 if(active>=2)return Promise.reject(Object.assign(new Error('Há outras notas em leitura. Tente novamente em instantes.'),{status:429}));
 active++;
 return new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'shop-pdf-worker.js'),{workerData:bytes,resourceLimits:{maxOldGenerationSizeMb:256}});
  let done=false;
  const finish=(error,pages)=>{if(done)return;done=true;active--;clearTimeout(timer);worker.terminate();if(error)reject(error);else{try{resolve(parsePdfPages(pages));}catch(e){reject(e);}}};
  const timer=setTimeout(()=>finish(new Error('A leitura do PDF demorou demais. Utilize o XML da nota.')),15000);
  worker.on('message',data=>{if(data?.kind==='shop-pdf-result')finish(data.error?new Error(data.error):null,data.pages);});
  worker.once('error',()=>finish(new Error('Não foi possível ler este PDF. Utilize um DANFE com texto selecionável ou o XML.')));
  worker.once('exit',code=>{if(!done)finish(new Error('A leitura do PDF foi interrompida. Utilize o XML da nota.'));});
 });
}
module.exports={parsePdfInvoice,parsePdfPages};
