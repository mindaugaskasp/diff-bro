// An in-place reinstall/upgrade (macOS/Windows installer, or `brew upgrade`)
// swaps the app bundle on disk while this instance keeps running. The loaded
// renderer still references the old build's chunk hashes, so the first lazily
// loaded chunk (Monaco, Mermaid, a tool) no longer matches disk and fails —
// surfacing as a cryptic SyntaxError from a "half working" stale process. Vite
// fires vite:preloadError for exactly that; relaunch once (app.relaunch execs
// process.execPath, which the installer just replaced) to pick up the new build.
//
// The guard is set before relaunch and cleared only after a clean run, so a
// genuinely broken chunk surfaces its real error on the next boot instead of
// looping. Dev only fires this on transient HMR churn, so it's PROD-gated.
const RELAUNCH_GUARD = 'diffbro.staleChunkRelaunch'
const CLEAR_AFTER_MS = 15000

export function installUpdateRecovery() {
  if (!import.meta.env.PROD) return
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    if (localStorage.getItem(RELAUNCH_GUARD)) return
    localStorage.setItem(RELAUNCH_GUARD, '1')
    window.api.relaunch()
  })
  setTimeout(() => localStorage.removeItem(RELAUNCH_GUARD), CLEAR_AFTER_MS)
}
