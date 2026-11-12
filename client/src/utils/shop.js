export const availability={AVAILABLE:'Disponível',OUT_OF_STOCK:'Sem estoque',DISCONTINUED:'Não trabalha mais'}
export const actions={COMPANY_CREATED:'Estabelecimento criado',COMPANY_UPDATED:'Dados da loja atualizados',PRODUCT_CREATED:'Produto cadastrado',PRODUCT_UPDATED:'Produto atualizado',NFE_PRODUCT_CREATED:'Produto cadastrado por NF-e',NFE_CONFIRMED:'NF-e importada',DEPARTMENT_CREATED:'Departamento criado',DEPARTMENT_UPDATED:'Departamento atualizado',CHAT_TRANSFERRED:'Conversa transferida',CHAT_CLOSED:'Conversa encerrada',USER_CREATED:'Usuário cadastrado',USER_UPDATED:'Acesso de usuário atualizado'}
export const money=value=>value==null?'Preço pendente':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100)
export const date=value=>new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})
export const apiError=error=>error.response?.data?.error||'Não foi possível concluir. Verifique o servidor local e tente novamente.'
export const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export function priceCents(value){const text=String(value).trim();if(!/^\d{1,7}([,.]\d{1,2})?$/.test(text))throw new Error('Informe um preço válido, como 24,90.');const cents=Math.round(Number(text.replace(',','.'))*100);if(cents>100000000)throw new Error('O preço máximo é R$ 1.000.000,00.');return cents}
