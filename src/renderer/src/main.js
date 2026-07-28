import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installErrorHandlers } from './errorHandlers'
import { installUpdateRecovery } from './updateRecovery'
import './monaco-setup'
import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'
import './styles/ui.css'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
// Catch uncaught errors before the UI mounts, so even a startup failure logs.
installErrorHandlers(app, pinia)
app.mount('#app')
// Relaunch a stale instance whose chunks no longer match disk after an in-place
// reinstall/upgrade — see updateRecovery.js.
installUpdateRecovery()
