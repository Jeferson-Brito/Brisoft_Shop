const http=require('node:http');
// Exposes only the signed webhook through a development tunnel, never the UI/API.
function createWebhookRelay({targetPort=3010}={}){
 return http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/api/whatsapp/webhook'||!['GET','POST'].includes(req.method)){res.writeHead(404);res.end();return;}
  let size=0;const chunks=[];
  req.on('data',chunk=>{size+=chunk.length;if(size>256*1024){res.writeHead(413);res.end();req.destroy();}else chunks.push(chunk);});
  req.on('end',()=>{
   if(res.writableEnded)return;
   const upstream=http.request({host:'127.0.0.1',port:targetPort,path:req.url,method:req.method,headers:{'Content-Type':'application/json','x-hub-signature-256':req.headers['x-hub-signature-256']||''}},response=>{res.writeHead(response.statusCode,{'Content-Type':response.headers['content-type']||'text/plain'});response.pipe(res);});
   upstream.setTimeout(10000,()=>upstream.destroy());
   upstream.on('error',()=>{if(!res.writableEnded){res.writeHead(502);res.end();}});
   upstream.end(Buffer.concat(chunks));
  });
 });
}
if(require.main===module)createWebhookRelay().listen(3011,'127.0.0.1',()=>console.log('Relay de teste pronto na porta 3011. Apenas /api/whatsapp/webhook está disponível.'));
module.exports={createWebhookRelay};
