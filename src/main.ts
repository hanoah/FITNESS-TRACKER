import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Roughness from 'roughness'
import 'roughness/dist/style.css'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(Roughness)
app.mount('#app')
