import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installErrorHandlers } from './errorHandlers'
import { installUpdateRecovery } from './updateRecovery'
import { i18n } from './i18n'
import './monaco-setup'
import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/monaco.css'

// Name the window after the installed version, so it's identifiable at a glance
// (and lines up with the tag a future Help → Update would open).
document.title = `Diff Bro v${window.api.appVersion}`

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(i18n)
// Catch uncaught errors before the UI mounts, so even a startup failure logs.
installErrorHandlers(app, pinia)
app.mount('#app')
// Relaunch a stale instance whose chunks no longer match disk after an in-place
// reinstall/upgrade — see updateRecovery.js.
installUpdateRecovery()
