const express = require('express');
const { shopAuth: defaultAuth } = require('../services/shop-auth.service');
const { shopService: defaultService } = require('../services/shop.service');
function createShopRouter({service=defaultService,auth=defaultAuth}={}){
const shopService=service;
const { requireAuth, requireAdmin } = auth;
const router = express.Router();
router.use(requireAuth);
router.use((req,res,next) => { res.setHeader('Cache-Control','no-store'); next(); });
function action(handler) {
  return async (req,res) => {
    try { await handler(req,res); }
    catch (error) {
      if (!error.status) console.error('[Shop] Erro interno:', error.message);
      res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Não foi possível concluir a operação.' });
    }
  };
}
router.get('/context', action(async(req,res) => {const context=await shopService.context(req.user);const company=context.company;res.json({success:true,...context,company:req.user.role==='Administrador'||!company?company:{id:company.id,name:company.name,slug:company.slug}});}));
router.post('/company', requireAdmin, action(async(req,res) => res.status(201).json({ success: true, company: await shopService.createCompany(req.user,req.body) })));
router.put('/company', requireAdmin, action(async(req,res) => res.json({ success:true, company:await shopService.updateCompany(req.user,req.body) })));
router.get('/workspace', action(async(req,res) => {
  const context=await shopService.context(req.user);
  const isAdmin=req.user.role==='Administrador';
  const [products,history,imports,departments,conversations]=context.company?await Promise.all([isAdmin?shopService.list(req.user):[],isAdmin?shopService.history(req.user):[],isAdmin?shopService.listImports(req.user):[],shopService.listDepartments(req.user),shopService.listConversations(req.user)]):[[],[],[],[],[]];
  const company=isAdmin?context.company:context.company?{id:context.company.id,name:context.company.name,slug:context.company.slug}:null;
  res.json({success:true,...context,company,products,history,imports,departments,conversations});
}));
router.get('/products', requireAdmin, action(async(req,res) => res.json({ success: true, products: await shopService.list(req.user) })));
router.post('/products', action(async(req,res) => res.status(201).json({ success: true, product: await shopService.save(req.user,req.body) })));
router.put('/products/:id', action(async(req,res) => res.json({ success: true, product: await shopService.save(req.user,req.body,req.params.id) })));
router.get('/history', action(async(req,res) => res.json({ success: true, history: await shopService.history(req.user) })));
router.post('/imports/read',requireAdmin,action(async(req,res)=>res.status(201).json({success:true,...await shopService.readInvoice(req.user,req.body)})));
router.post('/imports/:id/register',requireAdmin,action(async(req,res)=>res.json({success:true,...await shopService.registerInvoice(req.user,req.params.id)})));
router.post('/imports/preview', action(async(req,res) => res.status(201).json({success:true,invoice:await shopService.previewInvoice(req.user,req.body)})));
router.post('/imports/:id/confirm', action(async(req,res) => res.json({success:true,...await shopService.confirmInvoice(req.user,req.params.id,req.body)})));
router.post('/chat', action(async(req,res) => res.json({success:true,...await shopService.chat(req.user,req.body)})));
router.post('/departments',action(async(req,res)=>res.status(201).json({success:true,department:await shopService.saveDepartment(req.user,req.body)})));
router.put('/departments/:id',action(async(req,res)=>res.json({success:true,department:await shopService.saveDepartment(req.user,req.body,req.params.id)})));
router.get('/conversations/:id',action(async(req,res)=>res.json({success:true,conversation:await shopService.conversation(req.user,req.params.id)})));
router.post('/conversations/:id/transfer',action(async(req,res)=>{const conversation=await shopService.transfer(req.user,req.params.id,req.body);res.json({success:true,department_name:conversation.department_name,conversation:shopService.canReadConversation(req.user,conversation)?conversation:null});}));
router.post('/conversations/:id/messages',action(async(req,res)=>res.json({success:true,conversation:await shopService.reply(req.user,req.params.id,req.body)})));
router.post('/conversations/:id/close',action(async(req,res)=>res.json({success:true,conversation:await shopService.closeConversation(req.user,req.params.id,req.body)})));
return router;
}
module.exports = createShopRouter();
module.exports.createShopRouter = createShopRouter;
