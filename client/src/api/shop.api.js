import http from './http'
export const shopApi = {
  workspace: () => http.get('/shop/workspace'),
  context: () => http.get('/shop/context'),
  createCompany: (data) => http.post('/shop/company',data),
  updateCompany:(data)=>http.put('/shop/company',data),
  previewInvoice:(xml)=>http.post('/shop/imports/read',{xml}),
  previewPdfInvoice:(pdf)=>http.post('/shop/imports/read',{pdf}),
  registerInvoice:(id)=>http.post(`/shop/imports/${id}/register`),
  confirmInvoice:(id,items)=>http.post(`/shop/imports/${id}/confirm`,{items}),
  chat:(data)=>http.post('/shop/chat',data),
  saveDepartment:(data,id)=>id?http.put(`/shop/departments/${id}`,data):http.post('/shop/departments',data),
  conversation:(id)=>http.get(`/shop/conversations/${id}`),
  transfer:(id,data)=>http.post(`/shop/conversations/${id}/transfer`,data),
  reply:(id,message,version)=>http.post(`/shop/conversations/${id}/messages`,{message,version}),
  closeConversation:(id,version)=>http.post(`/shop/conversations/${id}/close`,{version}),
  list: () => http.get('/shop/products'),
  history: () => http.get('/shop/history'),
  save: (product,id) => id ? http.put(`/shop/products/${id}`,product) : http.post('/shop/products',product)
}
