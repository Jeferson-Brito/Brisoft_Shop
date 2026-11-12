const express=require('express');
const crypto=require('node:crypto');
const {createBudget}=require('../services/integration-budget');
const path=require('node:path');
function createWhatsAppCloud({service,env=process.env,fetchImpl=fetch,budget=createBudget({file:env.WHATSAPP_CLOUD_ENABLED==='true'?path.join(__dirname,'../../data/whatsapp-usage.json'):null,limit:Math.min(Number(env.WHATSAPP_DAILY_LIMIT)||50,100)})}){
 const router=express.Router(),recipients=(env.WHATSAPP_TEST_RECIPIENTS||'').split(',').map(s=>s.trim()).filter(s=>/^\d{8,15}$/.test(s));
 const enabled=env.WHATSAPP_CLOUD_ENABLED==='true'&&env.WHATSAPP_CLOUD_MODE==='test'&&!!env.WHATSAPP_ACCESS_TOKEN&&!!env.WHATSAPP_APP_SECRET&&!!env.WHATSAPP_VERIFY_TOKEN&&/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID||'')&&!!env.WHATSAPP_COMPANY_ID&&recipients.length>0&&recipients.length<=5;
 function status(companyId){return {enabled:enabled&&companyId===env.WHATSAPP_COMPANY_ID,mode:'test',configured:companyId===env.WHATSAPP_COMPANY_ID&&enabled,usage:companyId===env.WHATSAPP_COMPANY_ID?budget.status():null,webhook:'/api/whatsapp/webhook'};}
 router.get('/webhook',(req,res)=>{
  if(!enabled)return res.sendStatus(503);
  if(req.query['hub.mode']==='subscribe'&&req.query['hub.verify_token']===env.WHATSAPP_VERIFY_TOKEN&&typeof req.query['hub.challenge']==='string')return res.status(200).type('text/plain').send(req.query['hub.challenge']);
  res.sendStatus(403);
 });
 router.post('/webhook',express.raw({type:'application/json',limit:'256kb'}),(req,res)=>{
  if(!enabled)return res.sendStatus(503);
  const signature=req.get('x-hub-signature-256')||'';
  if(!Buffer.isBuffer(req.body)||!/^sha256=[a-f0-9]{64}$/.test(signature))return res.sendStatus(401);
  const digest=crypto.createHmac('sha256',env.WHATSAPP_APP_SECRET).update(req.body).digest();
  if(!crypto.timingSafeEqual(digest,Buffer.from(signature.slice(7),'hex')))return res.sendStatus(401);
  let body;try{body=JSON.parse(req.body.toString('utf8'));}catch{return res.sendStatus(400);}
  if(body.object!=='whatsapp_business_account'||!Array.isArray(body.entry))return res.sendStatus(400);
  try{
   let count=0;
   for(const entry of body.entry)for(const change of entry.changes||[]){
    if(change.field!=='messages')continue;
    const value=change.value;
    if(value?.metadata?.phone_number_id!==env.WHATSAPP_PHONE_NUMBER_ID)continue;
    for(const message of value.messages||[]){
     if(++count>100)return res.sendStatus(413);
     if(!recipients.includes(message.from)||typeof message.id!=='string'||message.id.length>200)continue;
     const timestamp=Number(message.timestamp)*1000;
     if(!Number.isFinite(timestamp)||Date.now()-timestamp>24*60*60*1000||timestamp>Date.now()+5*60*1000)continue;
     const text=message.type==='text'&&typeof message.text?.body==='string'?message.text.body.slice(0,1000):'[Mensagem recebida em formato não suportado. Solicite o envio em texto.]';
     service.ingestWhatsApp(env.WHATSAPP_COMPANY_ID,{id:message.id,from:message.from,phone_id:env.WHATSAPP_PHONE_NUMBER_ID,timestamp,text});
    }
   }
   res.sendStatus(200);
  }catch{res.sendStatus(503);}
 });
 let running=false,timer;
 async function tick(){
  if(!enabled||running)return;running=true;
  try{for(const job of service.pendingWhatsAppJobs()){
   if(job.type==='incoming'){await service.prepareWhatsAppReply(job.id);continue;}
   const outgoing=service.claimWhatsAppSend(job.id);if(!outgoing)continue;
   if(outgoing.company_id!==env.WHATSAPP_COMPANY_ID||outgoing.phone_id!==env.WHATSAPP_PHONE_NUMBER_ID||!recipients.includes(outgoing.to)||!outgoing.last_customer_at||Date.now()-outgoing.last_customer_at>=86400000||!budget.take()){service.completeWhatsAppSend(job.id,{status:'failed'});continue;}
   try{
    const version=/^v\d+\.0$/.test(env.WHATSAPP_GRAPH_VERSION||'')?env.WHATSAPP_GRAPH_VERSION:'v25.0';
    const response=await fetchImpl(`https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:outgoing.to,type:'text',text:{preview_url:false,body:outgoing.text}})});
    const data=await response.json();service.completeWhatsAppSend(job.id,{status:response.ok&&data.messages?.[0]?.id?'accepted':'failed',external_id:data.messages?.[0]?.id||null});
   }catch{service.completeWhatsAppSend(job.id,{status:'unknown'});}
  }}finally{running=false;}
 }
 function start(){if(!timer){timer=setInterval(()=>tick().catch(()=>console.error('[WhatsApp Cloud] Falha no processamento local.')),1000);timer.unref();}}
 function stop(){clearInterval(timer);timer=null;}
 return {router,status,tick,start,stop};
}
module.exports={createWhatsAppCloud};
