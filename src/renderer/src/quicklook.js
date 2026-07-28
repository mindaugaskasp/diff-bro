import { createApp } from 'vue'
import { createPinia } from 'pinia'
import QuickLook from './components/QuickLook.vue'
import { installErrorHandlers } from './errorHandlers'
import { normalizeTheme, themeForDay } from './utils/themes'
import { loadPersisted } from './persist'
import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'
import './styles/ui.css'

// Match the main window's theme (and honour the daily-rotation Fun setting),
// re-applied on each summon in case the user changed it in the meantime.
function applyTheme() {
  let rotate
  try {
    rotate = JSON.parse(loadPersisted('settings') ?? '{}')?.rotateThemeDaily === true
  } catch {
    rotate = false
  }
  document.documentElement.dataset.theme = rotate
    ? themeForDay()
    : normalizeTheme(loadPersisted('theme'))
}
applyTheme()
window.api.onQuickLookShow(applyTheme)

const pinia = createPinia()
const app = createApp(QuickLook)
app.use(pinia)
// Catch uncaught errors before the UI mounts, so even a startup failure logs.
installErrorHandlers(app, pinia)
app.mount('#app')
