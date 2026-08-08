// Making room on a full tab strip, spread into tabsStore. Its own module
// because it is one opt-in behaviour with its own confirmation flow, and the
// store it lives in is at its cap.
import { useSettingsStore } from './settingsStore'
import { tabsFullNotice } from '../utils/tabNotices'

export const evictionActions = {
  /**
   * Room for one more, or the reason there is none. Three answers: the reader
   * has not opted in (today's notice), the oldest tab can just go, or it
   * holds unsaved work and the request waits on `pendingEvict`.
   * @returns {boolean} whether `open()` may carry on now
   */
  _makeRoom(snapshot, opts) {
    const oldest = this.tabs.find((t) => t.id !== this.activeId)
    // One tab over the character budget is a memory bound, not a queue — and
    // close()'s last-tab path blanks rather than removes.
    if (!useSettingsStore().autoCloseOldest || !oldest || this.tabs.length < 2) {
      this._notice(`${tabsFullNotice(this.tabs)}. Close one first.`)
      return false
    }
    if (this.unsaved(oldest)) {
      this.pendingEvict = { id: oldest.id, snapshot, opts }
      return false
    }
    this.closeMany([oldest.id])
    return true
  },
  // Resumes through open() rather than building the tab here: one code path
  // decides what opening means, and a second would drift from it.
  confirmEvict() {
    const pending = this.pendingEvict
    this.pendingEvict = null
    if (!pending) return
    this.closeMany([pending.id])
    this.open(pending.snapshot, pending.opts)
  },
  cancelEvict() {
    this.pendingEvict = null
    this._notice(`${tabsFullNotice(this.tabs)}. Close one first.`)
  }
}
