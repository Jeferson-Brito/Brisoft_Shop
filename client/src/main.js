import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import 'remixicon/fonts/remixicon.css'
import './assets/main.css'
import './assets/css/shop-features.css'


import { registerServiceWorker } from './utils/native-notifications'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

registerServiceWorker()
