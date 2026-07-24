import { useErrorStore } from './stores/errorStore'

// Wire the browser + Vue global error channels into the error store so nothing
// fails silently: a crash lands in the local log and raises the report dialog.
// Installed once at startup (main.js) with the app's own pinia instance.
export function installErrorHandlers(app, pinia) {
  const store = useErrorStore(pinia)
  app.config.errorHandler = (err, _instance, info) => store.capture(err, `vue: ${info}`)
  // Only script errors reach a non-capture 'error' listener (resource-load
  // failures don't bubble here), so this is genuine uncaught-exception territory.
  window.addEventListener('error', (e) => {
    if (e.error) store.capture(e.error, 'window.error')
    else if (e.message) store.capture(e.message, 'window.error')
  })
  window.addEventListener('unhandledrejection', (e) =>
    store.capture(e.reason, 'unhandledrejection')
  )
}
