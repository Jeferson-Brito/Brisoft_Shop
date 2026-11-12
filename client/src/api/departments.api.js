import http from './http'

export const departmentsApi = {
  list:   ()       => http.get('/departments'),
  save:   (data)   => http.post('/departments', data),
  reorder:(departmentIds) => http.put('/departments/order', { departmentIds }),
  remove: (id)     => http.delete(`/departments/${id}`)
}
