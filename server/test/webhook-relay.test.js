const http=require('node:http');
const {createWebhookRelay}=require('../src/webhook-relay');
const test=require('node:test'),assert=require('node:assert/strict');
test('Relay: expõe apenas webhook e preserva o corpo assinado',async()=>{
 let received;const backend=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{received={body,signature:req.headers['x-hub-signature-256']};res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');});});
 await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));const relay=createWebhookRelay({targetPort:backend.address().port});await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+relay.address().port;
 try{assert.equal((await fetch(base+'/api/shop/products')).status,404);assert.equal((await fetch(base+'/')).status,404);assert.equal((await fetch(base+'/api/whatsapp/webhook',{method:'DELETE'})).status,404);const r=await fetch(base+'/api/whatsapp/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':'sha256=abc'},body:'{"value": 1}'});assert.equal(await r.text(),'ok');assert.deepEqual(received,{body:'{"value": 1}',signature:'sha256=abc'});}finally{relay.closeAllConnections();backend.closeAllConnections();await Promise.all([new Promise(r=>relay.close(r)),new Promise(r=>backend.close(r))]);}
});
