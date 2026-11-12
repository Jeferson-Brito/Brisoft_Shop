const {shopService}=require('../services/shop.service');

// The Desk users module uses the company repository in the local Shop pilot.
// This keeps one list and one set of credentials, including session revocation.
function createUsersController(service=shopService){
  const action=handler=>async(req,res)=>{
    try {await handler(req,res);}
    catch(error){res.status(error.status||500).json({success:false,error:error.status?error.message:'Não foi possível concluir a operação de usuários.'});}
  };
  return {
    listUsers:action(async(req,res)=>res.json({success:true,users:await service.listUsers(req.user)})),
    createUser:action(async(req,res)=>{
      if(req.user.is_temporary&&req.body?.email?.trim().toLowerCase()===req.user.email)throw Object.assign(new Error('Use um e-mail diferente do acesso de demonstração.'),{status:409});
      res.status(201).json({success:true,user:await service.saveUser(req.user,req.body)});
    }),
    updateUser:action(async(req,res)=>res.json({success:true,user:await service.saveUser(req.user,req.body,req.params.id)})),
    deleteUser:action(async(req,res)=>{await service.removeUser(req.user,req.params.id,req.body?.version);res.json({success:true});})
  };
}
module.exports=createUsersController();
module.exports.createUsersController=createUsersController;
