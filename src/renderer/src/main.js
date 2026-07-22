import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './monaco-setup'
import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'
import './styles/ui.css'

createApp(App).use(createPinia()).mount('#app')
