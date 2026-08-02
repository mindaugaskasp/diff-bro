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
  window.addEventListener('unhandledrejection', (e) => {
    // A rejection the store classifies as noise is handled — by deciding it does
    // not matter — so it is stopped here rather than left to be reported as
    // unhandled on top of that.
    if (store.capture(e.reason, 'unhandledrejection') === false) e.preventDefault()
  })
}
