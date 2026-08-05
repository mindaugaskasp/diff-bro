import { defineStore } from 'pinia'
import { t } from '../i18n'

// Uncaught renderer errors → the LOCAL log + a report dialog. Identical errors
// are throttled so a render loop can't spam either.
const THROTTLE_MS = 3000

function messageOf(reason) {
  if (reason?.message) return reason.message
  return String(reason ?? t('errorNotices.unknownError'))
}

// Benign framework noise (Monaco cancellations, ResizeObserver loop, opaque
// cross-origin "Script error.") — never a crash, never logged.
// Framework noise the reader did not cause and cannot act on. The last one is
// Monaco's: its diff worker throws when it returns no result because the models
// were replaced under it — what a re-diff after a file changes on disk does. It
// guards the cancelled case and not this one, and the next re-diff yields the
// real result, so a dialog here is a scrim over a race that already resolved.
const IGNORED = [
  /cancell?ed/i,
  /CancellationError/i,
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /no diff result available/i
]

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
    /**
     * @returns {boolean} whether it was recorded — false means the store
     * decided this one does not matter, which the caller uses to keep it out of
     * the console as well.
     */
    capture(err, context = '') {
      if (isIgnorable(err)) return false
      const record = toRecord(err, context)
      const sig = `${record.context}|${record.message}`
      const now = Date.now()
      // Drop an identical repeat inside the window — no log, no re-raise.
      if (sig === this.lastSignature && now - this.lastAt < THROTTLE_MS) return true
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
      return true
    },
    dismiss() {
      this.visible = false
    }
  }
})
