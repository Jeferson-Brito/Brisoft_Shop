const test=require('node:test');const assert=require('node:assert/strict');
const {createShopService}=require('../src/services/shop.service');
const {createShopAuth}=require('../src/services/shop-auth.service');
const jwt=require('jsonwebtoken');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const admin={id:'owner-a',role:'Administrador',email:'owner-a@example.test'},other={id:'owner-b',role:'Administrador',email:'owner-b@example.test'};
const secret='local-test-secret-with-more-than-thirty-two-characters';
async function setup(){const service=createShopService({allowMemory:true});await service.createCompany(admin,{name:'Mercado A',slug:'mercado-a'});await service.createCompany(other,{name:'Mercado B',slug:'mercado-b'});const a=await service.saveDepartment(admin,{name:'Balcão',description:'',active:true});const b=await service.saveDepartment(admin,{name:'Açougue',description:'',active:true});const c=await service.saveDepartment(other,{name:'Caixa',description:'',active:true});return {service,a,b,c,auth:createShopAuth({service,secret,bootstrapPassword:''})};}
const employee=(email,departments)=>({name:'Atendente teste',email,role:'Atendente',department_ids:departments,is_active:true,password:'Senha longa de teste 2026!'});
test('Equipe: login, catálogo restrito, conversas por setor e transferência revoga visibilidade',async()=>{
 const {service,a,b,auth}=await setup();const counter=await service.saveUser(admin,employee('balcao@example.test',[a.id]));const butcher=await service.saveUser(admin,employee('acougue@example.test',[b.id]));
 const login=await auth.login({email:counter.email,password:'Senha longa de teste 2026!',company:'mercado-a'});assert.equal(auth.resolve(login.token).user.id,counter.id);assert.equal('password_hash' in login.user,false);
 await assert.rejects(service.list(counter),e=>e.status===403);await assert.rejects(service.history(counter),e=>e.status===403);await assert.rejects(service.listUsers(counter),e=>e.status===403);await assert.rejects(service.saveUser(counter,employee('intruso@example.test',[a.id])),e=>e.status===403);
 const chat=await service.chat(admin,{message:'Arroz'});assert.deepEqual(await service.listConversations(counter),[]);
 const assigned=await service.transfer(admin,chat.conversation.id,{department_id:a.id,version:chat.conversation.version});assert.equal((await service.listConversations(counter)).length,1);
 await assert.rejects(service.conversation(butcher,assigned.id),e=>e.status===404);
 const reply=await service.reply(counter,assigned.id,{message:'Olá do balcão',version:assigned.version});assert.equal(reply.messages.at(-1).department_name,'Balcão');
 const transferred=await service.transfer(counter,assigned.id,{department_id:b.id,version:reply.version,reason:'Consulta ao açougue'});assert.equal(service.canReadConversation(counter,transferred),false);
 assert.deepEqual(await service.listConversations(counter),[]);assert.equal((await service.listConversations(butcher)).length,1);
 await assert.rejects(service.reply(counter,assigned.id,{message:'Mensagem indevida',version:transferred.version}),e=>e.status===404);
 await assert.rejects(service.closeConversation(counter,assigned.id,{version:transferred.version}),e=>e.status===404);
 auth.logout(auth.resolve(login.token).sid);assert.throws(()=>auth.resolve(login.token),e=>e.status===401);
});
test('Equipe: alteração de acesso e senha revogam sessões imediatamente, sem confiar em papéis antigos',async()=>{
 const {service,a,b,auth}=await setup();let user=await service.saveUser(admin,employee('staff@example.test',[a.id]));
 let session=await auth.login({email:user.email,password:'Senha longa de teste 2026!'});
 user=await service.saveUser(admin,{...employee(user.email,[b.id]),password:'',version:user.version},user.id);assert.throws(()=>auth.resolve(session.token),e=>e.status===401);
 await assert.rejects(service.list({...user,role:'Administrador'}),e=>e.status===403);
 session=await auth.login({email:user.email,password:'Senha longa de teste 2026!'});user=await service.saveUser(admin,{...employee(user.email,[b.id]),is_active:false,password:'',version:user.version},user.id);assert.throws(()=>auth.resolve(session.token),e=>e.status===401);
 await assert.rejects(auth.login({email:user.email,password:'Senha longa de teste 2026!'}),e=>e.status===401);
 user=await service.saveUser(admin,{...employee(user.email,[b.id]),password:'Nova senha longa de teste!',version:user.version},user.id);
 await assert.rejects(auth.login({email:user.email,password:'Senha longa de teste 2026!'}),e=>e.status===401);
 assert.equal((await auth.login({email:user.email,password:'Nova senha longa de teste!'})).user.id,user.id);
 assert.equal(JSON.stringify(await service.history(admin)).includes('Nova senha'),false);assert.equal(JSON.stringify(await service.listUsers(admin)).includes('password_hash'),false);
});
test('Equipe: vínculo com a empresa, departamentos e e-mail duplicado são validados',async()=>{
 const {service,a,c,auth}=await setup();
 await assert.rejects(service.saveUser(admin,employee('staff@example.test',[c.id])),e=>e.status===400);
 await service.saveUser(admin,employee('staff@example.test',[a.id]));await assert.rejects(service.saveUser(admin,employee('STAFF@example.test',[a.id])),e=>e.status===409);
 await service.saveUser(other,employee('staff@example.test',[c.id]));
 await assert.rejects(auth.login({email:'staff@example.test',password:'Senha longa de teste 2026!'}),e=>e.status===401);
 const scoped=await auth.login({email:'staff@example.test',password:'Senha longa de teste 2026!',company:'mercado-b'});assert.equal(scoped.user.department_ids[0],c.id);
 await assert.rejects(service.saveUser(admin,{...employee('staff@example.test',[a.id]),version:1},scoped.user.id),e=>e.status===404);
 await assert.rejects(service.saveDepartment(admin,{name:'Balcão',description:'',active:false},a.id),e=>e.status===409);
 const forged=jwt.sign({sid:'fake',kind:'shop-local',role:'Administrador'},secret,{issuer:'brisoft-shop',audience:'shop-local'});assert.throws(()=>auth.resolve(forged));
});
test('Equipe: acessos e sessões persistem após reinício, sem gravar senha em texto ou expor o hash',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shop-access-')),file=path.join(dir,'data.json');
 try{
  let service=createShopService({allowMemory:true,persistencePath:file});await service.createCompany(admin,{name:'Mercado local',slug:'mercado-local'});const d=await service.saveDepartment(admin,{name:'Caixa',description:'',active:true});
  const user=await service.saveUser(admin,employee('caixa@example.test',[d.id]));let auth=createShopAuth({service,secret,bootstrapPassword:''});const login=await auth.login({email:user.email,password:'Senha longa de teste 2026!',company:'mercado-local'});
  assert.equal(fs.readFileSync(file,'utf8').includes('Senha longa de teste 2026!'),false);assert.equal(JSON.stringify(await service.history(admin)).includes('password_hash'),false);
  service=createShopService({allowMemory:true,persistencePath:file});auth=createShopAuth({service,secret,bootstrapPassword:''});assert.equal(auth.resolve(login.token).user.id,user.id);
  await service.saveUser(admin,{...employee(user.email,[d.id]),password:'',is_active:false,version:user.version},user.id);assert.throws(()=>auth.resolve(login.token),e=>e.status===401);
 }finally{for(const entry of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,entry));fs.rmdirSync(dir);}
});
