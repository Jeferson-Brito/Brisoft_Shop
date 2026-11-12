const { XMLParser, XMLValidator } = require('fast-xml-parser');
function parseInvoice(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > 2000000) throw new Error('Selecione um XML de até 2 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('XML inválido ou com declarações não permitidas.');
  const data = new XMLParser({ ignoreAttributes:false, removeNSPrefix:true, parseTagValue:false, trimValues:true }).parse(xml);
  const info = (data.nfeProc?.NFe || data.NFe)?.infNFe;
  const key = String(info?.['@_Id'] || '').replace(/^NFe/,'');
  if (!/^\d{44}$/.test(key) || !info?.emit?.xNome) throw new Error('O arquivo deve ser uma NF-e com chave de 44 dígitos e emitente.');
  const items = Array.isArray(info.det) ? info.det : info.det ? [info.det] : [];
  if (!items.length || items.length > 500) throw new Error('A nota deve conter de 1 a 500 produtos.');
  const supplierId = String(info.emit.CNPJ || info.emit.CPF || key.slice(6,20));
  return { key, supplier:String(info.emit.xNome).slice(0,180), items:items.map((item,index) => {
    const p = item.prod;const cost = Number(p?.vUnCom);
    if (!p?.cProd || !p?.xProd || !p?.uCom || !Number.isFinite(cost) || cost < 0 || cost > 1000000) throw new Error(`Confira os dados do item ${index+1} no XML.`);
    return { index, supplier_code:String(p.cProd), sku:`${supplierId}-${p.cProd}`.slice(0,80), name:String(p.xProd).slice(0,180), unit:String(p.uCom).slice(0,12), barcode:/^\d{8,14}$/.test(String(p.cEAN))?String(p.cEAN):null, quantity:String(p.qCom || ''), cost_cents:Math.round(cost*100) };
  }) };
}
const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function answerCatalog(message, products) {
  const stop = new Set('ola oi bom boa dia tarde noite voces voce tem teria quanto custa preco qual valor quero gostaria de saber comprar por favor o os as um uma do da dos das de para com esta esse essa produto produtos disponivel disponibilidade'.split(' '));
  const words = normalize(message).split(/[^a-z0-9]+/).filter(word=>word.length>1&&!stop.has(word));
  if (!words.length) return { reply:'Olá! Qual produto você procura? Informe o nome ou código para eu consultar o catálogo da loja.', matches:[] };
  const matches = products.filter(p=>words.every(w=>normalize(`${p.name} ${p.sku} ${p.barcode || ''}`).includes(w))).slice(0,5);
  if (!matches.length) return { reply:'Não encontrei esse produto no catálogo desta loja. Você pode informar outro nome ou o código?', matches:[] };
  const reply=renderProducts(matches);
  return { reply, matches:matches.map(p=>({id:p.id,name:p.name,availability:p.availability})) };
}
function renderProducts(products){
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
  return products.map(p=>p.availability==='DISCONTINUED'?`${p.name}: a loja não trabalha mais com este produto.`:p.availability==='OUT_OF_STOCK'?`${p.name}: está sem estoque no momento.`:p.price_cents==null?`${p.name}: preço de venda ainda não informado. Consulte a equipe da loja.`:`${p.name}: ${money(p.price_cents)} — disponível, conforme informado pela loja.`).join('\n');
}
module.exports={parseInvoice,answerCatalog,renderProducts};
