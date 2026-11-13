const { randomUUID } = require('node:crypto');
const { supabase } = require('../config/supabase');
const fs = require('node:fs');
const path = require('node:path');
const { parseInvoice, answerCatalog, renderProducts } = require('./shop-invoice');
const bcrypt = require('bcryptjs');
const {parsePdfInvoice}=require('./shop-pdf');
const {createAssistant}=require('./shop-assistant');

class ShopError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const statuses = ['AVAILABLE', 'OUT_OF_STOCK', 'DISCONTINUED'];
function fieldsOnly(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new ShopError(400, 'Dados inválidos ou campos não permitidos.');
  }
}
function text(value, label, max, min = 0) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new ShopError(400, `${label} inválido.`);
  return value.trim();
}
function companyInput(value) {
  fieldsOnly(value, ['name', 'slug']);
  const name = text(value.name, 'Nome da loja', 120, 2);
  const slug = text(value.slug, 'Identificador', 60, 3);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ShopError(400, 'Use letras minúsculas, números e hífens no identificador.');
  return { name, slug };
}
function productInput(value, editing = false) {
  fieldsOnly(value, ['name', 'sku', 'category', 'unit', 'barcode', 'price_cents', 'availability', ...(editing ? ['version'] : [])]);
  if (value.price_cents !== null && (!Number.isSafeInteger(value.price_cents) || value.price_cents < 0 || value.price_cents > 100000000)) throw new ShopError(400, 'Informe um preço entre R$ 0,00 e R$ 1.000.000,00.');
  if (!statuses.includes(value.availability)) throw new ShopError(400, 'Disponibilidade inválida.');
  if (editing && (!Number.isSafeInteger(value.version) || value.version < 1)) throw new ShopError(400, 'Versão inválida. Atualize o catálogo.');
  return {
    name: text(value.name, 'Nome do produto', 180, 2), sku: text(value.sku, 'Código', 80, 1),
    category: text(value.category ?? '', 'Categoria', 80), unit: text(value.unit ?? 'UN', 'Unidade', 12, 1),
    barcode: value.barcode == null || value.barcode === '' ? null : text(value.barcode, 'Código de barras', 60, 1),
    price_cents: value.price_cents, availability: value.availability,
    ...(editing ? { version: value.version } : {})
  };
}
function databaseError(error) {
  if (!error) return;
  if (error.code === '23505') throw new ShopError(409, 'Código ou identificador já cadastrado.');
  if (error.message?.includes('SHOP_CONFLICT')) throw new ShopError(409, 'Outra sessão alterou este produto. Atualize o catálogo antes de editar novamente.');
  if (error.message?.includes('SHOP_NOT_FOUND')) throw new ShopError(404, 'Produto não encontrado nesta loja.');
  if (error.message?.includes('SHOP_MEMBERSHIP')) throw new ShopError(403, 'Você não tem acesso a esta loja.');
  if (error.message?.includes('SHOP_ALREADY_LINKED')) throw new ShopError(409, 'Este administrador já possui uma loja vinculada.');
  console.warn('[Shop] Falha no banco:', error.code || 'sem código');
  throw new ShopError(503, 'O catálogo está indisponível. Confira a configuração do módulo Shop no servidor.');
}
function createShopService({ database = null, allowMemory = false, persistencePath = null, assistant = null } = {}) {
  const companies = new Map(), memberships = new Map(), products = new Map(), audit = [], imports = new Map(), departments = new Map(), conversations = new Map(), users = new Map(), sessions = new Map(), integrationJobs = new Map();
  function snapshot(){return {version:1,companies:[...companies],memberships:[...memberships],products:[...products],audit,imports:[...imports],departments:[...departments],conversations:[...conversations],users:[...users],sessions:[...sessions],integrationJobs:[...integrationJobs]};}
  function restore(data){
    if(data.version!==1 || !Array.isArray(data.audit))throw new Error('Formato dos dados locais não reconhecido.');
    for(const [map,values] of [[companies,data.companies],[memberships,data.memberships],[products,data.products],[imports,data.imports || []],[departments,data.departments||[]],[conversations,data.conversations||[]],[users,data.users||[]],[sessions,data.sessions||[]],[integrationJobs,data.integrationJobs||[]]]){map.clear();for(const [key,value] of values)map.set(key,value);}
    audit.splice(0,audit.length,...data.audit);
  }
  if(!database && allowMemory && persistencePath && fs.existsSync(persistencePath))restore(JSON.parse(fs.readFileSync(persistencePath,'utf8')));
  for(const job of integrationJobs.values())if(job.status==='sending'){job.status='unknown';const message=conversations.get(job.conversation_id)?.messages.find(m=>m.id===job.message_id);if(message)message.delivery_status='unknown';}
  function commit(change){
    const before=structuredClone(snapshot());
    try{
      const result=change();
      if(persistencePath){fs.mkdirSync(path.dirname(persistencePath),{recursive:true});fs.writeFileSync(`${persistencePath}.tmp`,JSON.stringify(snapshot(),null,2));fs.renameSync(`${persistencePath}.tmp`,persistencePath);}
      return structuredClone(result);
    }catch(error){restore(before);throw error;}
  }
  function actor(user) {
    if (!user?.id) throw new ShopError(401, 'Faça login para continuar.');
    if(Number.isInteger(user.version)&&user.company_id&&!users.has(user.id))throw new ShopError(401,'Este acesso não está mais disponível.');
    if (!database && !allowMemory) throw new ShopError(503, 'Configure o banco do Shop ou habilite a demonstração local.');
    if(users.has(user.id)&&!users.get(user.id).is_active)throw new ShopError(401,'Este acesso está desativado.');
    return user.id;
  }
  function effective(user){actor(user);return users.get(user.id)||user;}
  function admin(user){if(effective(user).role!=='Administrador')throw new ShopError(403,'Acesso restrito ao administrador da loja.');}
  function canRead(user,conversation){const current=effective(user);return current.role==='Administrador'||['Atendente','Analista','Supervisor'].includes(current.role)&&(current.department_ids||[]).includes(conversation.department_id);}
  async function adminCompanyFor(user){const company=await companyFor(user);admin(user);return company;}
  function publicUser(user){const {password_hash,...safe}=user;return structuredClone(safe);}
  function localOnly(){if(database)throw new ShopError(503,'A gestão de acessos desta etapa está disponível no piloto local.');}
  function userInput(input,companyId,editing=false){
    fieldsOnly(input,['name','email','role','department_ids','department_id','cargo','phone','avatar_url','is_active','password',...(editing?['version']:[])]);
    const name=text(input.name,'Nome',120,2),email=text(input.email,'E-mail',180,3).toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ShopError(400,'Informe um e-mail válido.');
    if(!['Administrador','Supervisor','Analista','Atendente'].includes(input.role)||typeof input.is_active!=='boolean')throw new ShopError(400,'Perfil ou situação inválidos.');
    if(!Array.isArray(input.department_ids)||input.department_ids.length>100||new Set(input.department_ids).size!==input.department_ids.length)throw new ShopError(400,'Selecione departamentos válidos.');
    if(input.role==='Administrador'&&input.department_ids.length)throw new ShopError(400,'Administradores têm acesso a todos os departamentos.');
    if(input.role!=='Administrador'&&!input.department_ids.length)throw new ShopError(400,'Selecione pelo menos um departamento para o atendente.');
    if(input.password!=null&&typeof input.password!=='string')throw new ShopError(400,'Informe uma senha válida.');
    for(const id of input.department_ids){const d=departments.get(id);if(!d||d.company_id!==companyId||!d.active)throw new ShopError(400,'Selecione departamentos ativos desta loja.');}
    if(!editing||input.password){if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)throw new ShopError(400,'A senha deve ter de 12 a 128 caracteres.');}
    const cargo=text(input.cargo??'','Cargo',120),phone=text(input.phone??'','Telefone',40);
    const avatar_url=text(input.avatar_url??'','Foto',700000);
    if(avatar_url&&!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar_url))throw new ShopError(400,'Selecione uma foto válida.');
    return {name,email,role:input.role,department_ids:[...input.department_ids],department_id:input.department_ids[0]||null,cargo,phone,avatar_url,is_active:input.is_active};
  }
  async function context(user) {
    const id = actor(user);
    if (!database) return { mode: persistencePath?'local':'memory', company: structuredClone(companies.get(memberships.get(id)) || null) };
    const result = await database.from('shop_memberships').select('company_id, shop_companies(id,name,slug)').eq('user_id', id).maybeSingle();
    databaseError(result.error);
    return { mode: 'database', company: result.data?.shop_companies || null };
  }
  async function companyFor(user) {
    const { company } = await context(user);
    if (!company) throw new ShopError(403, 'Vincule seu estabelecimento para acessar o catálogo.');
    return company;
  }
  function record(user, companyId, action, before, after) {
    audit.unshift({ id: randomUUID(), company_id: companyId, actor: user.email || user.name || user.id, action, before: before ? structuredClone(before) : null, after: structuredClone(after), created_at: new Date().toISOString() });
  }
  return {
    context,
    canReadConversation:canRead,
    async listUsers(user){admin(user);const company=await adminCompanyFor(user);localOnly();return [...users.values()].filter(u=>u.company_id===company.id).map(publicUser).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));},
    async saveUser(user,input,id=null){
      admin(user);const company=await adminCompanyFor(user);localOnly();userInput(input,company.id,!!id);
      const hash=input.password?await bcrypt.hash(input.password,12):null;
      // Recheck after password hashing: permissions may have changed meanwhile.
      admin(user);const value=userInput(input,company.id,!!id),before=id?users.get(id):null;
      if(id&&(!before||before.company_id!==company.id))throw new ShopError(404,'Usuário não encontrado nesta loja.');
      if(before&&input.version!==before.version)throw new ShopError(409,'Este usuário foi alterado. Atualize a lista antes de salvar.');
      if(id===user.id&&(!value.is_active||value.role!=='Administrador'))throw new ShopError(409,'Você não pode desativar ou remover seu próprio acesso administrativo.');
      if(before?.role==='Administrador'&&before.is_active&&(!value.is_active||value.role!=='Administrador')&&![...users.values()].some(u=>u.id!==id&&u.company_id===company.id&&u.role==='Administrador'&&u.is_active))throw new ShopError(409,'Não é possível remover o último administrador ativo.');
      if([...users.values()].some(u=>u.company_id===company.id&&u.id!==id&&u.email===value.email))throw new ShopError(409,'Este e-mail já está cadastrado nesta loja.');
      if(!before&&!hash)throw new ShopError(400,'Informe a senha inicial.');
      const next={...value,id:id||randomUUID(),company_id:company.id,password_hash:hash||before.password_hash,version:(before?.version||0)+1,created_at:before?.created_at||new Date().toISOString()};
      return commit(()=>{users.set(next.id,next);memberships.set(next.id,company.id);for(const [sid,session]of sessions)if(session.user_id===next.id)sessions.delete(sid);record(user,company.id,before?'USER_UPDATED':'USER_CREATED',before?publicUser(before):null,{...publicUser(next),...(hash?{password_changed:true}:{})});return publicUser(next);});
    },
    async removeUser(user,id,version){
      admin(user);const company=await adminCompanyFor(user);localOnly();
      const before=users.get(id);
      if(!before||before.company_id!==company.id)throw new ShopError(404,'Usuário não encontrado nesta loja.');
      if(id===user.id)throw new ShopError(409,'Você não pode excluir seu próprio acesso.');
      if(version!==before.version)throw new ShopError(409,'Este usuário foi alterado. Atualize a lista antes de excluir.');
      if(before.role==='Administrador'&&before.is_active&&![...users.values()].some(u=>u.id!==id&&u.company_id===company.id&&u.role==='Administrador'&&u.is_active))throw new ShopError(409,'Não é possível excluir o último administrador ativo.');
      return commit(()=>{users.delete(id);memberships.delete(id);for(const [sid,s]of sessions)if(s.user_id===id)sessions.delete(sid);record(user,company.id,'USER_DELETED',publicUser(before),{id,name:before.name});return true;});
    },
    async authenticateLocal(input){
      localOnly();fieldsOnly(input,['email','password','company']);
      if(typeof input.email!=='string'||typeof input.password!=='string'||input.password.length>256)throw new ShopError(400,'Informe e-mail e senha válidos.');
      const email=input.email.trim().toLowerCase(),slug=typeof input.company==='string'?input.company.trim():'';
      const candidates=[...users.values()].filter(u=>u.email===email&&(!slug||companies.get(u.company_id)?.slug===slug));
      const candidate=candidates.length===1?candidates[0]:null;
      const valid=await bcrypt.compare(input.password,candidate?.password_hash||'$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxxkhrXnbWk9i7vJWYsDxpfxCLm');
      // Use the latest record after async comparison, not a stale active flag/hash.
      const current=candidate?users.get(candidate.id):null;
      if(!valid||!current?.is_active||current.password_hash!==candidate.password_hash)throw new ShopError(401,'Empresa, e-mail ou senha incorretos.');
      return publicUser(current);
    },
    createSession(user,marker=null){
      localOnly();const current=users.get(user.id);
      if(!current&&!marker)throw new ShopError(401,'Usuário não encontrado.');
      if(current&&!current.is_active)throw new ShopError(401,'Este acesso está desativado.');
      return commit(()=>{for(const [key,s]of sessions)if(s.expires_at<Date.now())sessions.delete(key);const id=randomUUID();sessions.set(id,{user_id:user.id,version:current?.version||0,marker,expires_at:Date.now()+8*60*60*1000});return id;});
    },
    sessionUser(id,bootstrap,marker){
      const session=sessions.get(id);if(!session||session.expires_at<Date.now())throw new ShopError(401,'Sessão expirada. Entre novamente.');
      if(session.user_id==='__temp_admin__'&&bootstrap&&session.marker===marker)return structuredClone(bootstrap);
      const user=users.get(session.user_id);if(!user?.is_active||user.version!==session.version)throw new ShopError(401,'O acesso foi alterado. Entre novamente.');
      return publicUser(user);
    },
    endSession(id){if(sessions.has(id))commit(()=>{sessions.delete(id);return true;});},
    async createCompany(user, input) {
      admin(user);
      actor(user);
      const value = companyInput(input);
      if (database) {
        if (user.is_temporary || user.id === '__temp_admin__') throw new ShopError(403, 'Crie e acesse um administrador definitivo antes de vincular a loja ao banco.');
        const result = await database.rpc('shop_create_company', { p_user_id: user.id, p_name: value.name, p_slug: value.slug });
        databaseError(result.error); return result.data;
      }
      if (memberships.has(user.id)) throw new ShopError(409, 'Este administrador já possui uma loja vinculada.');
      if ([...companies.values()].some(c => c.slug === value.slug)) throw new ShopError(409, 'Identificador já cadastrado.');
      const company = { id: randomUUID(), ...value };
      return commit(()=>{companies.set(company.id, company); memberships.set(user.id, company.id);record(user, company.id, 'COMPANY_CREATED', null, company);return company;});
    },
    async list(user) {
      admin(user);
      const company = await adminCompanyFor(user);
      if (database) {
        // Fail explicitly instead of silently truncating the catalog at the
        // PostgREST default limit. Pagination is server-side and tenant-scoped.
        const result = []; const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
          const page = await database.from('shop_products').select('*').eq('company_id', company.id).order('name').order('id').range(offset, offset + pageSize - 1);
          databaseError(page.error); result.push(...page.data);
          if (page.data.length < pageSize) return result;
        }
      }
      return structuredClone([...products.values()].filter(p => p.company_id === company.id).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')));
    },
    async save(user, input, id = null) {
      admin(user);
      const company = await adminCompanyFor(user);
      const value = productInput(input, !!id);
      if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new ShopError(404, 'Produto não encontrado nesta loja.');
      if (database) {
        const result = await database.rpc('shop_save_product', { p_user_id: user.id, p_product_id: id, p_value: value });
        databaseError(result.error); return result.data;
      }
      const previous = id ? products.get(id) : null;
      if (id && (!previous || previous.company_id !== company.id)) throw new ShopError(404, 'Produto não encontrado nesta loja.');
      if (previous && previous.version !== value.version) throw new ShopError(409, 'Outra sessão alterou este produto. Atualize o catálogo antes de editar novamente.');
      if ([...products.values()].some(p => p.company_id === company.id && p.sku === value.sku && p.id !== id)) throw new ShopError(409, 'Código já cadastrado nesta loja.');
      const next = { ...value, id: id || randomUUID(), company_id: company.id, version: (previous?.version || 0) + 1, updated_at: new Date().toISOString() };
      return commit(()=>{products.set(next.id, next); record(user, company.id, id ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED', previous, next);return next;});
    },
    async updateCompany(user,input){
      admin(user);
      const company=await adminCompanyFor(user);
      if(database)throw new ShopError(503,'Esta configuração está disponível no piloto local. A integração do novo banco será feita em outra etapa.');
      fieldsOnly(input,['name','description','address','phone','opening_hours']);
      const next={...company,name:text(input.name,'Nome da loja',120,2),description:text(input.description??'','Descrição',1000),address:text(input.address??'','Endereço',300),phone:text(input.phone??'','Telefone',40),opening_hours:text(input.opening_hours??'','Horários',1000)};
      return commit(()=>{companies.set(company.id,next);record(user,company.id,'COMPANY_UPDATED',company,next);return next;});
    },
    async listImports(user){
      admin(user);
      const company=await adminCompanyFor(user);
      if(database)return [];
      return structuredClone([...imports.values()].filter(i=>i.company_id===company.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)));
    },
    async previewInvoice(user,input){
      admin(user);
      const company=await adminCompanyFor(user);
      if(database)throw new ShopError(503,'A importação está disponível no piloto local. A integração do novo banco será feita em outra etapa.');
      fieldsOnly(input,['xml','pdf']);
      if(Object.keys(input).length!==1||(typeof input.xml==='string')===(typeof input.pdf==='string'))throw new ShopError(400,'Envie apenas um XML ou PDF por vez.');
      let parsed;try{parsed=typeof input.pdf==='string'?await parsePdfInvoice(input.pdf):{...parseInvoice(input.xml),source:'xml'};}catch(error){throw new ShopError(error.status||400,error.message);}
      admin(user);
      const previous=[...imports.values()].find(i=>i.company_id===company.id&&i.key===parsed.key);
      if(previous?.confirmed_at)throw new ShopError(409,'Esta nota já foi importada nesta loja.');
      if(previous)return structuredClone(previous);
      const invoice={id:randomUUID(),company_id:company.id,...parsed,created_at:new Date().toISOString(),confirmed_at:null};
      return commit(()=>{imports.set(invoice.id,invoice);return invoice;});
    },
    async readInvoice(user,input){
      const invoice=await this.previewInvoice(user,input);
      return this.registerInvoice(user,invoice.id);
    },
    async registerInvoice(user,id){
      admin(user);const company=await adminCompanyFor(user);
      if(database)throw new ShopError(503,'A importação está disponível no piloto local.');
      const invoice=imports.get(id);
      if(!invoice||invoice.company_id!==company.id)throw new ShopError(404,'Nota não encontrada nesta loja.');
      if(invoice.confirmed_at)return {invoice:structuredClone(invoice),count:0,skipped_count:invoice.items.length};
      const known=[...products.values()].filter(p=>p.company_id===company.id),prepared=[];
      for(const row of invoice.items){
        if([...known,...prepared].some(p=>p.sku===row.sku||row.barcode&&p.barcode===row.barcode))continue;
        const value=productInput({name:row.name,sku:row.sku,category:'',unit:row.unit,barcode:row.barcode,price_cents:null,availability:'OUT_OF_STOCK'});
        prepared.push({...value,id:randomUUID(),company_id:company.id,version:1,updated_at:new Date().toISOString()});
      }
      return commit(()=>{
        for(const product of prepared){products.set(product.id,product);record(user,company.id,'NFE_PRODUCT_CREATED',null,product);}
        const saved={...invoice,confirmed_at:new Date().toISOString(),imported_count:prepared.length,skipped_count:invoice.items.length-prepared.length};
        imports.set(id,saved);record(user,company.id,'NFE_CONFIRMED',null,{key:invoice.key,count:prepared.length,supplier:invoice.supplier});
        return {invoice:saved,count:prepared.length,skipped_count:saved.skipped_count};
      });
    },
    async confirmInvoice(user,id,input){
      admin(user);
      const company=await adminCompanyFor(user);
      if(database)throw new ShopError(503,'A importação está disponível no piloto local.');
      fieldsOnly(input,['items']);
      const invoice=imports.get(id);
      if(!invoice||invoice.company_id!==company.id)throw new ShopError(404,'Nota não encontrada nesta loja.');
      if(invoice.confirmed_at)throw new ShopError(409,'Esta nota já foi importada nesta loja.');
      if(!Array.isArray(input.items)||input.items.length<1||input.items.length>500)throw new ShopError(400,'Selecione de 1 a 500 produtos.');
      const indexes=new Set();const codes=new Set([...products.values()].filter(p=>p.company_id===company.id).map(p=>p.sku));
      const prepared=input.items.map(item=>{
        fieldsOnly(item,['index','product']);
        if(!Number.isInteger(item.index)||indexes.has(item.index)||!invoice.items.some(i=>i.index===item.index))throw new ShopError(400,'Item inválido ou repetido na conferência.');
        indexes.add(item.index);const value=productInput(item.product);
        if(codes.has(value.sku))throw new ShopError(409,`O código ${value.sku} já está cadastrado ou foi repetido. Nenhum item foi importado.`);
        codes.add(value.sku);return {...value,id:randomUUID(),company_id:company.id,version:1,updated_at:new Date().toISOString()};
      });
      return commit(()=>{
        for(const product of prepared){products.set(product.id,product);record(user,company.id,'NFE_PRODUCT_CREATED',null,product);}
        const saved={...invoice,confirmed_at:new Date().toISOString(),imported_count:prepared.length};imports.set(id,saved);
        record(user,company.id,'NFE_CONFIRMED',null,{key:invoice.key,count:prepared.length,supplier:invoice.supplier});
        return {count:prepared.length,invoice:saved};
      });
    },
    async listDepartments(user){
      const company=await companyFor(user);
      if(database)return [];
      return structuredClone([...departments.values()].filter(d=>d.company_id===company.id&&(effective(user).role==='Administrador'||d.active)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));
    },
    async saveDepartment(user,input,id=null){
      admin(user);
      const company=await adminCompanyFor(user);
      if(database)throw new ShopError(503,'Departamentos disponíveis no piloto local.');
      fieldsOnly(input,['name','description','active']);
      const name=text(input.name,'Nome do departamento',80,2),description=text(input.description??'','Descrição',300);
      if(typeof input.active!=='boolean')throw new ShopError(400,'Informe se o departamento está ativo.');
      const before=id?departments.get(id):null;
      if(id&&(!before||before.company_id!==company.id))throw new ShopError(404,'Departamento não encontrado nesta loja.');
      if([...departments.values()].some(d=>d.company_id===company.id&&d.id!==id&&d.name.toLowerCase()===name.toLowerCase()))throw new ShopError(409,'Já existe um departamento com esse nome.');
      if(!input.active&&[...conversations.values()].some(c=>c.company_id===company.id&&c.department_id===id&&c.status!=='closed'))throw new ShopError(409,'Transfira as conversas deste departamento antes de desativá-lo.');
      if(!input.active&&[...users.values()].some(u=>u.company_id===company.id&&u.is_active&&u.department_ids.includes(id)))throw new ShopError(409,'Remova este departamento dos acessos ativos da equipe antes de desativá-lo.');
      const next={id:id||randomUUID(),company_id:company.id,name,description,active:input.active};
      return commit(()=>{departments.set(next.id,next);record(user,company.id,id?'DEPARTMENT_UPDATED':'DEPARTMENT_CREATED',before,next);return next;});
    },
    async listConversations(user){
      const company=await companyFor(user);if(database)return [];
      return structuredClone([...conversations.values()].filter(c=>c.company_id===company.id&&canRead(user,c)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(({messages,...c})=>({...c,last_message:messages.at(-1)?.text||'',message_count:messages.length})));
    },
    async conversation(user,id){
      const company=await companyFor(user),current=conversations.get(id);
      if(!current||current.company_id!==company.id||!canRead(user,current))throw new ShopError(404,'Conversa não encontrada nesta loja.');
      return structuredClone(current);
    },
    async chat(user,input){
      admin(user);
      fieldsOnly(input,['message','conversation_id']);const message=text(input.message,'Mensagem',1000,1);
      const company=await adminCompanyFor(user);if(database)throw new ShopError(503,'Simulador disponível no piloto local.');
      const catalog=await this.list(user);
      const existing=input.conversation_id?conversations.get(input.conversation_id):null;
      if(input.conversation_id&&(!existing||existing.company_id!==company.id))throw new ShopError(404,'Conversa não encontrada nesta loja.');
      if(existing?.channel==='whatsapp')throw new ShopError(400,'Use a aba Conversas para atender contatos do WhatsApp.');
      if(existing?.status==='closed')throw new ShopError(409,'Esta conversa foi encerrada. Inicie uma nova simulação.');
      if(existing&&existing.messages.length>=500)throw new ShopError(409,'Esta simulação atingiu 500 mensagens. Inicie uma nova conversa.');
      const current=existing?structuredClone(existing):{id:randomUUID(),company_id:company.id,customer_name:'Cliente de teste',channel:'simulation',department_id:null,department_name:null,status:'bot',version:0,messages:[],transfers:[],created_at:new Date().toISOString()};
      const answer=current.status==='bot'?(assistant?await assistant.answer({company,catalog,message,history:current.messages,departments:[...departments.values()].filter(d=>d.company_id===company.id)}):answerCatalog(message,catalog)):{reply:null,matches:[]};
      admin(user);if(existing&&conversations.get(existing.id)?.version!==existing.version)throw new ShopError(409,'A conversa mudou. Atualize e tente novamente.');
      if(answer.kind==='products'&&answer.matches.length)answer.reply=renderProducts(answer.matches.map(m=>products.get(m.id)).filter(p=>p&&p.company_id===company.id));
      if(answer.handoff){const sector=departments.get(answer.handoff);current.status='waiting';current.department_id=sector?.id||null;current.department_name=sector?.name||null;}
      current.messages.push({id:randomUUID(),role:'customer',text:message,created_at:new Date().toISOString()});
      current.provider=answer.provider||'local-catalog';
      if(answer.reply)current.messages.push({id:randomUUID(),role:'assistant',text:answer.reply,created_at:new Date().toISOString()});
      current.version++;current.updated_at=new Date().toISOString();
      return commit(()=>{conversations.set(current.id,current);return {...answer,conversation:current,provider:answer.provider||'local-catalog',disclaimer:answer.provider==='gemini'?'Interpretação pelo Gemini; preços e disponibilidade do catálogo.':'Consulta direta ao catálogo, sem chamada à LLM.'};});
    },
    integrationStatus(companyId){return {assistant:assistant?.status(companyId)||{provider:'local-catalog',configured:false},pending:[...integrationJobs.values()].filter(j=>j.company_id===companyId&&j.status==='pending').length,failed:[...integrationJobs.values()].filter(j=>j.company_id===companyId&&['failed','unknown'].includes(j.status)).length,last_error:[...integrationJobs.values()].filter(j=>j.company_id===companyId&&j.type==='outgoing').at(-1)?.error_code||null};},
    ingestWhatsApp(companyId,event){
      if(database||!companies.has(companyId))throw new ShopError(503,'Loja não configurada para WhatsApp.');
      if(integrationJobs.has(event.id))return false;
      if([...integrationJobs.values()].filter(j=>j.status==='pending').length>=1000)throw new ShopError(503,'Fila de mensagens cheia.');
      const existing=[...conversations.values()].find(c=>c.company_id===companyId&&c.channel==='whatsapp'&&c.whatsapp_to===event.from&&c.phone_id===event.phone_id&&c.status!=='closed');
      const at=new Date().toISOString(),current=existing?structuredClone(existing):{id:randomUUID(),company_id:companyId,customer_name:'Contato WhatsApp '+event.from.slice(-4),channel:'whatsapp',whatsapp_to:event.from,phone_id:event.phone_id,department_id:null,department_name:null,status:'bot',version:0,messages:[],transfers:[],created_at:at};
      if(current.messages.length>=500)throw new ShopError(409,'Limite de mensagens desta conversa.');
      current.last_customer_at=event.timestamp;current.version++;current.updated_at=at;
      current.messages.push({id:event.id,role:'customer',text:event.text,created_at:at});
      return commit(()=>{conversations.set(current.id,current);integrationJobs.set(event.id,{id:event.id,type:'incoming',company_id:companyId,conversation_id:current.id,message:event.text,status:'pending',created_at:at});return true;});
    },
    pendingWhatsAppJobs(){return structuredClone([...integrationJobs.values()].filter(j=>j.status==='pending').slice(0,20));},
    async prepareWhatsAppReply(id){
      const job=integrationJobs.get(id);if(!job||job.status!=='pending'||job.type!=='incoming')return;
      const current=conversations.get(job.conversation_id);if(!current)return;
      if(current.status!=='bot')return commit(()=>{job.status='done';return true;});
      const before=current.version,company=companies.get(current.company_id),catalog=[...products.values()].filter(p=>p.company_id===company.id);
      const answer=assistant?await assistant.answer({company,catalog,message:job.message,history:current.messages.slice(0,-1),departments:[...departments.values()].filter(d=>d.company_id===company.id)}):answerCatalog(job.message,catalog);
      const latest=conversations.get(current.id);
      if(latest.version!==before||latest.status!=='bot')return commit(()=>{job.status='done';return true;});
      if(answer.kind==='products'&&answer.matches.length)answer.reply=renderProducts(answer.matches.map(m=>products.get(m.id)).filter(p=>p&&p.company_id===company.id));
      return commit(()=>{
        const at=new Date().toISOString(),message={id:randomUUID(),role:'assistant',text:answer.reply,created_at:at,delivery_status:'pending',handoff:!!answer.handoff};
        const next={...latest,provider:answer.provider||'local-catalog',messages:[...latest.messages,message],version:latest.version+1,updated_at:at};
        if(answer.handoff){const sector=departments.get(answer.handoff);next.status='waiting';next.department_id=sector?.id||null;next.department_name=sector?.name||null;}
        conversations.set(next.id,next);job.status='done';
        integrationJobs.set(message.id,{id:message.id,type:'outgoing',company_id:company.id,conversation_id:next.id,message_id:message.id,status:'pending',created_at:at});return true;
      });
    },
    claimWhatsAppSend(id){
      const job=integrationJobs.get(id);if(!job||job.type!=='outgoing'||job.status!=='pending')return null;
      const current=conversations.get(job.conversation_id),message=current?.messages.find(m=>m.id===job.message_id);
      if(!current||!message)return null;
      if(message.role==='assistant'&&current.status!=='bot'&&!message.handoff){commit(()=>{job.status='cancelled';message.delivery_status='cancelled';current.version++;return true;});return null;}
      return commit(()=>{job.status='sending';message.delivery_status='sending';current.version++;return {id,company_id:job.company_id,to:current.whatsapp_to,phone_id:current.phone_id,text:message.text,last_customer_at:current.last_customer_at};});
    },
    applyWhatsAppStatus(companyId,event){
      const job=[...integrationJobs.values()].find(j=>j.company_id===companyId&&j.external_id===event.id);
      if(!job)return false;
      const ranks={accepted:1,sent:2,delivered:3,read:4};
      if(!['failed','sent','delivered','read'].includes(event.status))return false;
      if(event.status==='failed'&&['delivered','read'].includes(job.status))return false;
      if(job.status==='failed'&&event.status!=='failed')return false;
      if(event.status!=='failed'&&(ranks[event.status]||0)<=(ranks[job.status]||0))return false;
      return commit(()=>{job.status=event.status;job.error_code=event.error_code||null;const current=conversations.get(job.conversation_id),message=current?.messages.find(m=>m.id===job.message_id);if(message){message.delivery_status=event.status;message.error_code=event.error_code||null;current.version++;}return true;});
    },
    async retryWhatsAppSend(user,id,input){
      admin(user);const company=await adminCompanyFor(user);fieldsOnly(input,['message_id','version']);
      const current=conversations.get(id),job=integrationJobs.get(input.message_id);
      if(!current||current.company_id!==company.id||!job||job.company_id!==company.id||job.conversation_id!==id)throw new ShopError(404,'Envio não encontrado nesta loja.');
      if(input.version!==current.version)throw new ShopError(409,'A conversa mudou. Atualize antes de reenviar.');
      if(job.status!=='failed')throw new ShopError(409,'Somente envios com falha confirmada podem ser tentados novamente.');
      if(Date.now()-current.last_customer_at>=86400000)throw new ShopError(409,'A janela de resposta terminou. Aguarde uma nova mensagem do cliente.');
      return commit(()=>{job.status='pending';job.error_code=null;const message=current.messages.find(m=>m.id===job.message_id);message.delivery_status='pending';message.error_code=null;current.version++;return current;});
    },
    completeWhatsAppSend(id,{status,external_id=null,error_code=null,error_subcode=null}){
      const job=integrationJobs.get(id);if(!job)return;
      return commit(()=>{job.status=status;job.external_id=external_id;job.error_code=error_code;job.error_subcode=error_subcode;const current=conversations.get(job.conversation_id),message=current?.messages.find(m=>m.id===job.message_id);if(message){message.delivery_status=status;message.external_id=external_id;message.error_code=error_code;current.version++;}return true;});
    },
    async transfer(user,id,input){
      const company=await companyFor(user);if(database)throw new ShopError(503,'Transferências disponíveis no piloto local.');
      fieldsOnly(input,['department_id','reason','version']);
      const current=conversations.get(id),department=departments.get(input.department_id);
      if(!current||current.company_id!==company.id||!canRead(user,current))throw new ShopError(404,'Conversa não encontrada nesta loja.');
      if(!department||department.company_id!==company.id||!department.active)throw new ShopError(400,'Selecione um departamento ativo desta loja.');
      if(current.status==='closed')throw new ShopError(409,'Esta conversa foi encerrada.');
      if(!Number.isInteger(input.version)||input.version!==current.version)throw new ShopError(409,'A conversa mudou. Atualize antes de transferir.');
      if(current.department_id===department.id)throw new ShopError(409,'A conversa já está neste departamento.');
      const reason=text(input.reason??'','Motivo',300),at=new Date().toISOString();
      const event={id:randomUUID(),from:current.department_name,to:department.name,reason,actor:user.email||user.name||user.id,created_at:at};
      const next={...current,department_id:department.id,department_name:department.name,status:'waiting',version:current.version+1,updated_at:at,transfers:[...current.transfers,event]};
      return commit(()=>{conversations.set(id,next);record(user,company.id,'CHAT_TRANSFERRED',null,{conversation_id:id,department_name:department.name,reason,previous_department:current.department_name});return next;});
    },
    async reply(user,id,input){
      const company=await companyFor(user);if(database)throw new ShopError(503,'Conversas disponíveis no piloto local.');
      fieldsOnly(input,['message','version']);const message=text(input.message,'Mensagem',1000,1),current=conversations.get(id);
      if(!current||current.company_id!==company.id||!canRead(user,current))throw new ShopError(404,'Conversa não encontrada nesta loja.');
      if(current.status==='closed')throw new ShopError(409,'Esta conversa foi encerrada.');
      if(current.status==='bot')throw new ShopError(409,'Encaminhe a conversa a um departamento antes de responder como equipe.');
      if(input.version!==current.version)throw new ShopError(409,'A conversa mudou. Atualize antes de responder.');
      if(current.messages.length>=500)throw new ShopError(409,'Esta simulação atingiu 500 mensagens.');
      const at=new Date().toISOString(),next={...current,status:'human',version:current.version+1,updated_at:at,messages:[...current.messages,{id:randomUUID(),role:'staff',text:message,actor:user.email||user.name||user.id,department_name:current.department_name,created_at:at}]};
      return commit(()=>{conversations.set(id,next);if(next.channel==='whatsapp'){const out=next.messages.at(-1);out.delivery_status='pending';integrationJobs.set(out.id,{id:out.id,type:'outgoing',company_id:company.id,conversation_id:id,message_id:out.id,status:'pending',created_at:at});}return next;});
    },
    async closeConversation(user,id,input){
      const company=await companyFor(user);fieldsOnly(input,['version']);
      const current=conversations.get(id);
      if(!current||current.company_id!==company.id||!canRead(user,current))throw new ShopError(404,'Conversa não encontrada nesta loja.');
      if(input.version!==current.version)throw new ShopError(409,'A conversa mudou. Atualize antes de encerrar.');
      if(current.status==='closed')return structuredClone(current);
      const next={...current,status:'closed',version:current.version+1,updated_at:new Date().toISOString()};
      return commit(()=>{conversations.set(id,next);record(user,company.id,'CHAT_CLOSED',null,{conversation_id:id,department_name:current.department_name||'Assistente'});return next;});
    },
    async history(user) {
      admin(user);
      const company = await adminCompanyFor(user);
      if (database) {
        const result = await database.from('shop_audit').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).order('id').limit(100);
        databaseError(result.error); return result.data;
      }
      return structuredClone(audit.filter(a => a.company_id === company.id).slice(0,100));
    }
  };
}
module.exports = {
  createShopService, ShopError, productInput,
  shopService: createShopService({ assistant:createAssistant(), database: supabase, allowMemory: process.env.SHOP_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production', persistencePath:!supabase && process.env.SHOP_DEMO_MODE==='true' && process.env.NODE_ENV!=='production'?path.join(__dirname,'../../data/shop-local.json'):null })
};
