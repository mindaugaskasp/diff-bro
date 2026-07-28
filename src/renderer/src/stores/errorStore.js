import { defineStore } from 'pinia'

// Uncaught renderer errors → the LOCAL log + a report dialog. Identical errors
// are throttled so a render loop can't spam either.
const THROTTLE_MS = 3000

function messageOf(reason) {
  if (reason?.message) return reason.message
  return String(reason ?? 'Unknown error')
}

// Benign framework noise (Monaco cancellations, ResizeObserver loop, opaque
// cross-origin "Script error.") — never a crash, never logged.
const IGNORED = [/cancell?ed/i, /CancellationError/i, /ResizeObserver loop/i, /^Script error\.?$/i]

function isIgnorable(err) {
  const reason = err?.reason ?? err?.error ?? err
  const text = `${reason?.name ?? ''} ${reason?.message ?? reason ?? ''}`.trim()
  return IGNORED.some((re) => re.test(text))
}

// Normalise the many error shapes (Error, string, ErrorEvent, rejection) into a
// record.
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
