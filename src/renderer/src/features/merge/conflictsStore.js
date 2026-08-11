import { defineStore } from 'pinia'

// The list of files git is still calling conflicted, and which of them this
// session has answered. Rows arrive from main and carry NO path — a row is
// acted on by its index, which main resolves back to a file.

const rowsOf = (payload) => (Array.isArray(payload?.conflicts) ? payload.conflicts : [])

export const useConflictsStore = defineStore('conflicts', {
  state: () => ({
    /** @type {Array<{name: string, dir: string, tally: number, state: string}>} */
    rows: [],
    /** Which row the reader is on — the one Resolve opens. */
    at: 0,
    /** The dialog itself. Closing it never ends the merge; see `live`. */
    open: false,
    /** A mergetool run is under way, so the way back in is offered. */
    live: false,
    /**
     * The reader closed the list. git launches once per file, so without this
     * a thirty-file walk put the same modal in front of them thirty times.
     */
    dismissed: false,
    busy: false,
    error: ''
  }),
  getters: {
    remaining: (s) => s.rows.filter((r) => r.state !== 'done').length,
    done: (s) => s.rows.filter((r) => r.state === 'done').length,
    // One file is not a list, and a dialog to choose from it is in the way.
    isWalk: (s) => s.rows.length > 1,
    current: (s) => s.rows[s.at] ?? null
  },
  actions: {
    /** @param {object} payload the mergetool command main delivered */
    begin(payload) {
      this.rows = rowsOf(payload)
      this.at = Math.max(0, Number(payload?.at) || 0)
      this.live = true
      this.error = ''
      this.reveal()
    },
    select(index) {
      if (index >= 0 && index < this.rows.length) this.at = index
    },
    /** Offer the list unless the reader has already put it away. */
    reveal() {
      if (this.isWalk && !this.dismissed) this.open = true
    },
    /** Asked for by name — a chip, a menu item — so it overrides the dismissal. */
    show() {
      this.dismissed = false
      this.reveal()
    },
    /** Close it to get at something behind it — stepping into a row. */
    hide() {
      this.open = false
    },
    /** The reader put it away, so the next launch does not push it back. */
    dismiss() {
      this.open = false
      this.dismissed = true
    },
    // The walk is over: git has stopped asking, so the way back in goes away
    // rather than offering to reconstruct a session that no longer exists. It
    // also drops main's list, which is what closes the write handlers.
    async end() {
      this.open = false
      this.live = false
      this.dismissed = false
      this.rows = []
      await window.api.endMergeWalk?.()
    },
    async refresh() {
      const rows = await window.api.conflictList()
      if (Array.isArray(rows)) this.rows = rows
    },
    /**
     * Answer a whole file from the index, without opening it.
     * @returns {Promise<boolean>} whether the row answered was the one the view
     * currently has open — which main has just released, so the view must go.
     */
    async take(index, side) {
      if (this.busy) return false
      this.busy = true
      const res = await window.api.takeConflictSide(index, side)
      this.busy = false
      this.error = res?.ok ? '' : res?.error === 'gone' ? 'gone' : 'take-failed'
      await this.refresh()
      return !!res?.wasCurrent
    },
    /**
     * The three-way payload for a row, so the view can open a file this launch
     * was not given. Null when the row cannot be read as text.
     */
    async payloadAt(index) {
      const res = await window.api.openConflict(index)
      if (!res?.ok) {
        this.error = 'blocked'
        return null
      }
      this.error = ''
      return res
    },
    markDone(index) {
      const row = this.rows[index]
      if (row) Object.assign(row, { state: 'done', tally: 0 })
    }
  }
})
