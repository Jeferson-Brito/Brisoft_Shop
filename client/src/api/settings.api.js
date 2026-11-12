import http from './http'

export const settingsApi = {
  get:  ()         => http.get('/settings'),
  save: (key, val) => http.post('/settings', { key, value: val })
}
