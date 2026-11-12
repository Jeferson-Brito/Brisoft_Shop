const express=require('express');
const {shopAuth}=require('../services/shop-auth.service');
const {shopService}=require('../services/shop.service');
const {createUsersController}=require('../controllers/users.controller');
function createUsersRouter({service=shopService,auth=shopAuth}={}){
  const router=express.Router(),controller=createUsersController(service);
  router.use(auth.requireAuth,auth.requireAdmin);
  router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.get('/',controller.listUsers);
  router.post('/',controller.createUser);
  router.put('/:id',controller.updateUser);
  router.delete('/:id',controller.deleteUser);
  return router;
}
module.exports=createUsersRouter();
module.exports.createUsersRouter=createUsersRouter;
