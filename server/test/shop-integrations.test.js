const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),crypto=require('node:crypto');
const {createAssistant}=require('../src/services/shop-assistant');
const {createShopService}=require('../src/services/shop.service');
const {createBudget}=require('../src/services/integration-budget');
const {createWhatsAppCloud}=require('../src/routes/whatsapp-cloud');
const budget=()=>createBudget({limit:20});
test('LLM: seleciona produtos, mas preços e disponibilidade vêm do servidor; não vaza atributos privados',async()=>{
 let payload;const env={GEMINI_ENABLED:'true',GEMINI_COMPANY_ID:'loja-a',GEMINI_API_KEY:'test-key'};
 const assistant=createAssistant({env,budget:budget(),fetchImpl:async(url,options)=>{payload=JSON.parse(options.body);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({intent:'products',product_ids:['p','foreign'],department_id:'',reply:'R$ 1,00 inventado'})}]}}]});}});
 const result=await assistant.answer({company:{id:'loja-a',name:'Loja',secret:'nunca enviar'},catalog:[{id:'p',name:'Arroz',sku:'001',price_cents:2500,availability:'AVAILABLE',cost_cents:999,company_id:'loja-a'}],message:'quero arroz'});
 assert.equal(result.provider,'gemini');assert.match(result.reply,/25,00/);assert.doesNotMatch(result.reply,/1,00/);assert.equal(result.matches.length,1);
 assert.doesNotMatch(JSON.stringify(payload),/cost_cents|secret|nunca enviar/);
 const other=await assistant.answer({company:{id:'loja-b'},catalog:[],message:'arroz'});assert.equal(other.provider,'local-catalog');
});
test('LLM: preço pendente, limites, erro do provedor e resposta inválida não inventam preço',async()=>{
 const env={GEMINI_ENABLED:'true',GEMINI_COMPANY_ID:'a',GEMINI_API_KEY:'key'};let calls=0;
 const assistant=createAssistant({env,budget:createBudget({limit:1}),fetchImpl:async()=>{calls++;return Response.json({candidates:[{content:{parts:[{text:'{"intent":"products","product_ids":["p"],"department_id":""}'}]}}]});}});
 const input={company:{id:'a'},catalog:[{id:'p',name:'Arroz',price_cents:null,availability:'AVAILABLE'}],message:'arroz'};
 assert.match((await assistant.answer(input)).reply,/não informado/);assert.equal((await assistant.answer(input)).provider,'local-catalog');assert.equal(calls,1);
 const broken=createAssistant({env,budget:budget(),fetchImpl:async()=>{throw new Error('token must not leak');}});const fallback=await broken.answer(input);assert.equal(fallback.provider,'local-catalog');assert.doesNotMatch(JSON.stringify(fallback),/token must/);
});
test('WhatsApp: verifica assinatura, aceita só número e destinatário permitidos, deduplica e responde com fila durável',async()=>{
 const service=createShopService({allowMemory:true}),admin={id:'owner-cloud',role:'Administrador'};
 const company=await service.createCompany(admin,{name:'Loja WhatsApp',slug:'whatsapp-teste'});
 await service.save(admin,{name:'Arroz',sku:'1',unit:'UN',price_cents:2500,availability:'AVAILABLE'});
 const env={WHATSAPP_CLOUD_ENABLED:'true',WHATSAPP_CLOUD_MODE:'test',WHATSAPP_ACCESS_TOKEN:'test-token',WHATSAPP_APP_SECRET:'test-app-secret',WHATSAPP_VERIFY_TOKEN:'test-verify',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_COMPANY_ID:company.id,WHATSAPP_TEST_RECIPIENTS:'5583999999999'};
 let sends=0;const cloud=createWhatsAppCloud({service,env,budget:budget(),fetchImpl:async(url,options)=>{sends++;assert.match(url,/graph.facebook.com/);assert.equal(JSON.parse(options.body).to,'5583999999999');return Response.json({messages:[{id:'wamid-out'}]});}});
 const app=express();app.use('/api/whatsapp',cloud.router);const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});const url='http://127.0.0.1:'+server.address().port+'/api/whatsapp/webhook';
 const body=(id,from='5583999999999',phone='123')=>JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:phone},messages:[{id,from,timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Arroz'}}]}}]}]});
 const request=async(value,signed=true)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':signed?'sha256='+crypto.createHmac('sha256',env.WHATSAPP_APP_SECRET).update(value).digest('hex'):'sha256='+'0'.repeat(64)},body:value});
 try{
  assert.equal((await fetch(url+'?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123')).status,200);
  assert.equal((await fetch(url+'?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123')).status,403);
  assert.equal((await request(body('x'),false)).status,401);
  assert.equal((await request(body('wrong-sender','5583888888888'))).status,200);assert.equal((await request(body('wrong-phone','5583999999999','999'))).status,200);assert.equal(service.pendingWhatsAppJobs().length,0);
  assert.equal((await request(body('wamid-in'))).status,200);assert.equal((await request(body('wamid-in'))).status,200);assert.equal(service.pendingWhatsAppJobs().length,1);
  await cloud.tick();await cloud.tick();assert.equal(sends,1);await cloud.tick();assert.equal(sends,1);
  const [conversation]=await service.listConversations(admin);assert.equal(conversation.channel,'whatsapp');const detail=await service.conversation(admin,conversation.id);assert.equal(detail.messages.length,2);assert.equal(detail.messages.at(-1).delivery_status,'accepted');assert.match(detail.messages.at(-1).text,/25,00/);
  await assert.rejects(service.chat(admin,{message:'Não pode',conversation_id:detail.id}),e=>e.status===400);
  const department=await service.saveDepartment(admin,{name:'Balcão',description:'',active:true});await request(body('wamid-before-transfer'));await cloud.tick();const beforeTransfer=await service.conversation(admin,detail.id);
  const transferred=await service.transfer(admin,detail.id,{department_id:department.id,version:beforeTransfer.version});
  await request(body('wamid-human'));await cloud.tick();await cloud.tick();assert.equal(sends,1);
  const latest=await service.conversation(admin,detail.id);await service.reply(admin,detail.id,{message:'Olá, sou da equipe.',version:latest.version});await cloud.tick();assert.equal(sends,2);
 }finally{cloud.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('WhatsApp: janela de 24h, timeout e reinício não provocam reenvio automático',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'brisoft-cloud-')),file=path.join(directory,'state.json');
 try{
  const service=createShopService({allowMemory:true,persistencePath:file}),owner={id:'cloud-persist',role:'Administrador'},company=await service.createCompany(owner,{name:'Loja persistente',slug:'loja-persistente'});
  const env={WHATSAPP_CLOUD_ENABLED:'true',WHATSAPP_CLOUD_MODE:'test',WHATSAPP_ACCESS_TOKEN:'token',WHATSAPP_APP_SECRET:'secret',WHATSAPP_VERIFY_TOKEN:'verify',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_COMPANY_ID:company.id,WHATSAPP_TEST_RECIPIENTS:'5583999999999'};
  let calls=0;const cloud=createWhatsAppCloud({service,env,budget:budget(),fetchImpl:async()=>{calls++;throw new Error('timeout');}});
  service.ingestWhatsApp(company.id,{id:'old',from:'5583999999999',phone_id:'123',timestamp:Date.now()-86400001,text:'oi'});
  await cloud.tick();await cloud.tick();assert.equal(calls,0);
  service.ingestWhatsApp(company.id,{id:'new',from:'5583999999999',phone_id:'123',timestamp:Date.now(),text:'oi'});
  await cloud.tick();await cloud.tick();await cloud.tick();assert.equal(calls,1);assert.equal(service.integrationStatus(company.id).failed,2);
  const restored=createShopService({allowMemory:true,persistencePath:file});assert.equal(restored.ingestWhatsApp(company.id,{id:'new'}),false);assert.equal(restored.pendingWhatsAppJobs().length,0);
 }finally{const target=path.resolve(directory),base=path.resolve(os.tmpdir())+path.sep;if(!target.startsWith(base)||!path.basename(target).startsWith('brisoft-cloud-'))throw new Error('Invalid temporary directory');fs.rmSync(target,{recursive:true,force:true});}
});

test('LLM: atualização de preço durante a chamada usa o catálogo mais recente',async()=>{
 let release,started;const gate=new Promise(resolve=>release=resolve),running=new Promise(resolve=>started=resolve);let selected;
 const service=createShopService({allowMemory:true,assistant:{status:()=>({}),answer:async()=>{started();await gate;return {reply:'preço antigo',kind:'products',matches:[{id:selected.id}],provider:'gemini'};}}});
 const user={id:'live-price',role:'Administrador'};await service.createCompany(user,{name:'Preço atual',slug:'preco-atual'});selected=await service.save(user,{name:'Arroz',sku:'1',price_cents:100,availability:'AVAILABLE'});
 const reply=service.chat(user,{message:'arroz'});await running;await service.save(user,{name:'Arroz',sku:'1',price_cents:200,availability:'AVAILABLE',version:selected.version},selected.id);release();assert.match((await reply).reply,/2,00/);
});

test('WhatsApp: mapa explícito de destinatário, status de falha/entrega e reenvio com isolamento',async()=>{
 const service=createShopService({allowMemory:true}),owner={id:'delivery-owner',role:'Administrador'},other={id:'delivery-other',role:'Administrador'};
 const company=await service.createCompany(owner,{name:'Envio de teste',slug:'envio-teste'});await service.createCompany(other,{name:'Outra loja',slug:'outra-envio'});
 const canonical='558393858500',verified='5583993858500';let calls=0;
 const env={WHATSAPP_CLOUD_ENABLED:'true',WHATSAPP_CLOUD_MODE:'test',WHATSAPP_ACCESS_TOKEN:'token',WHATSAPP_APP_SECRET:'secret',WHATSAPP_VERIFY_TOKEN:'verify',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_COMPANY_ID:company.id,WHATSAPP_TEST_RECIPIENTS:canonical,WHATSAPP_TEST_RECIPIENT_MAP:JSON.stringify({[canonical]:verified})};
 const cloud=createWhatsAppCloud({service,env,budget:budget(),fetchImpl:async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).to,verified);return Response.json({messages:[{id:'external-'+calls}]});}});
 service.ingestWhatsApp(company.id,{id:'in-mapped',from:canonical,phone_id:'123',timestamp:Date.now(),text:'oi'});await cloud.tick();await cloud.tick();
 const [summary]=await service.listConversations(owner);let current=await service.conversation(owner,summary.id);const messageId=current.messages.at(-1).id;
 assert.equal(service.applyWhatsAppStatus(company.id,{id:'external-1',status:'failed',error_code:131031}),true);assert.equal(service.integrationStatus(company.id).last_error,131031);
 assert.equal(service.applyWhatsAppStatus(company.id,{id:'external-1',status:'sent'}),false);
 current=await service.conversation(owner,current.id);assert.equal(current.messages.at(-1).delivery_status,'failed');
 await assert.rejects(service.retryWhatsAppSend(other,current.id,{message_id:messageId,version:current.version}),e=>e.status===404);
 await service.retryWhatsAppSend(owner,current.id,{message_id:messageId,version:current.version});await cloud.tick();assert.equal(calls,2);
 assert.equal(service.applyWhatsAppStatus(company.id,{id:'external-2',status:'delivered'}),true);assert.equal(service.applyWhatsAppStatus(company.id,{id:'external-2',status:'read'}),true);assert.equal(service.applyWhatsAppStatus(company.id,{id:'external-1',status:'failed',error_code:131031}),false);assert.equal(service.applyWhatsAppStatus(company.id,{id:'external-2',status:'failed',error_code:131031}),false);
 assert.equal((await service.conversation(owner,current.id)).messages.at(-1).delivery_status,'read');
});
