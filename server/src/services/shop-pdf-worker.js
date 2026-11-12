const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 let task;
 try{
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  task=getDocument({data:new Uint8Array(workerData),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0,stopAtErrors:true});
  const doc=await task.promise;
  if(doc.numPages>20)throw new Error('Selecione um PDF com até 20 páginas.');
  const pages=[];let count=0,characters=0;
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n),content=await page.getTextContent();
   const items=content.items.filter(i=>i.str?.trim()).map(i=>({text:i.str.trim(),x:i.transform[4],y:i.transform[5]}));
   count+=items.length;characters+=items.reduce((sum,item)=>sum+item.text.length,0);if(count>20000||characters>2000000)throw new Error('PDF muito complexo. Utilize o XML da nota.');
   pages.push(items);page.cleanup();
  }
  parentPort.postMessage({kind:'shop-pdf-result',pages});
 }catch(error){parentPort.postMessage({kind:'shop-pdf-result',error:error.name==='PasswordException'?'O PDF está protegido por senha. Envie uma cópia sem proteção ou o XML.':error.message});}
 finally{if(task)await task.destroy();}
})().catch(()=>{});
