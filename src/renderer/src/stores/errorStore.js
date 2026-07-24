import { defineStore } from 'pinia'

// Surfaces uncaught renderer errors: forwards each to the main process for the
// LOCAL log (window.api.logError — nothing leaves the machine) and raises a
// dialog suggesting the user report it. Identical errors are throttled so a
// render loop can't spam the log or respawn the dialog.
const THROTTLE_MS = 3000

function messageOf(reason) {
  if (reason?.message) return reason.message
  return String(reason ?? 'Unknown error')
}

// Benign framework noise that is NOT a crash and must never log or raise the
// dialog: Monaco cancels in-flight work by rejecting with a Canceled /
// CancellationError on normal model switches/disposal; ResizeObserver emits a
// harmless loop notice; a cross-origin script error arrives as an opaque
// "Script error." with no detail worth reporting. Matched on name+message so a
// cancellation is caught however Monaco labels it.
const IGNORED = [/cancell?ed/i, /CancellationError/i, /ResizeObserver loop/i, /^Script error\.?$/i]

function isIgnorable(err) {
  const reason = err?.reason ?? err?.error ?? err
  const text = `${reason?.name ?? ''} ${reason?.message ?? reason ?? ''}`.trim()
  return IGNORED.some((re) => re.test(text))
}

// Normalise the many shapes an error arrives as (Error, string, ErrorEvent,
// PromiseRejectionEvent) into { message, stack, context }.
function toRecord(err, context) {
  if (err instanceof Error)
    return { message: err.message || String(err), stack: err.stack, context }
  if (typeof err === 'string') return { message: err, context }
  const reason = err?.reason ?? err?.error ?? err
  return { message: messageOf(reason), stack: reason?.stack, context }
}

export const useErrorStore = defineStore('error', {
  state: () => ({
    visible: false,
    lastError: null, // { message, when }
    lastSignature: '',
    lastAt: 0
  }),
  actions: {
    capture(err, context = '') {
      if (isIgnorable(err)) return
      const record = toRecord(err, context)
      const sig = `${record.context}|${record.message}`
      const now = Date.now()
      // Drop an identical repeat inside the window — no log, no re-raise.
      if (sig === this.lastSignature && now - this.lastAt < THROTTLE_MS) return
      this.lastSignature = sig
      this.lastAt = now
      try {
        window.api?.logError?.(record)
      } catch {
        // logging must never itself throw back into the error path
      }
      this.lastError = { message: record.message, when: now }
      // Don't stack dialogs — if one is already up, keep it.
      if (!this.visible) this.visible = true
    },
    dismiss() {
      this.visible = false
    }
  }
})
