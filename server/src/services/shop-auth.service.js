const jwt=require('jsonwebtoken');
const bcrypt=require('bcryptjs');
const {createHmac}=require('node:crypto');
const {shopService,ShopError}=require('./shop.service');
function createShopAuth({service=shopService,secret=process.env.JWT_SECRET,bootstrapEmail=process.env.BOOTSTRAP_ADMIN_EMAIL||'admin@empresa.com',bootstrapPassword=process.env.BOOTSTRAP_ADMIN_PASSWORD||''}={}){
  const bootstrap=bootstrapPassword?{id:'__temp_admin__',email:bootstrapEmail.toLowerCase(),name:'Admin Temporário',role:'Administrador',is_temporary:true,department_ids:[]}:null;
  const hash=bootstrap?bcrypt.hashSync(bootstrapPassword,12):null;
  const marker=createHmac('sha256',secret||'not-configured').update(bootstrapPassword).digest('hex');
  async function login(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['email','password','company'].includes(k))||typeof input.email!=='string'||typeof input.password!=='string'||input.email.length>180||input.password.length>256||input.company!=null&&typeof input.company!=='string')throw new ShopError(400,'Informe empresa, e-mail e senha válidos.');
    let user=null;
    if(bootstrap&&input.email.trim().toLowerCase()===bootstrap.email&&await bcrypt.compare(input.password,hash)){
      const context=await service.context(bootstrap);
      if(!input.company?.trim()||input.company.trim()===context.company?.slug)user=bootstrap;
    }
    if(!user)user=await service.authenticateLocal(input);
    const sid=service.createSession(user,user.is_temporary?marker:null);
    const token=jwt.sign({sid,kind:'shop-local'},secret,{expiresIn:'8h',algorithm:'HS256',issuer:'brisoft-shop',audience:'shop-local'});
    const company=(await service.context(user)).company;
    return {token,user,company:user.role==='Administrador'||!company?company:{id:company.id,name:company.name,slug:company.slug}};
  }
  function resolve(token){
    const claims=jwt.verify(token,secret,{algorithms:['HS256'],issuer:'brisoft-shop',audience:'shop-local'});
    if(claims.kind!=='shop-local'||typeof claims.sid!=='string')throw new ShopError(401,'Sessão inválida.');
    return {user:service.sessionUser(claims.sid,bootstrap,marker),sid:claims.sid};
  }
  function requireAuth(req,res,next){
    try{const match=String(req.headers.authorization||'').match(/^Bearer ([^\s]+)$/);if(!match)throw new Error('missing');const session=resolve(match[1]);req.user=session.user;req.shopSessionId=session.sid;next();}
    catch(error){res.status(401).json({success:false,error:'Sessão inválida ou expirada. Entre novamente.'});}
  }
  function requireAdmin(req,res,next){if(req.user?.role!=='Administrador')return res.status(403).json({success:false,error:'Acesso restrito ao administrador da loja.'});next();}
  return {login,resolve,requireAuth,requireAdmin,logout:sid=>service.endSession(sid)};
}
module.exports={createShopAuth,shopAuth:createShopAuth()};
