import { defineStore } from 'pinia'
import {
  composeMerge,
  conflictCount,
  parseConflicts,
  unresolvedCount
} from '../../utils/mergeConflicts'

/**
 * A `git mergetool` run, from the moment main hands over the conflicted text to
 * the moment the resolved file goes back. The renderer never learns the path it
 * is resolving — main has held that since the launch.
 */
export const useMergeStore = defineStore('merge', {
  state: () => ({
    open: false,
    parsed: null,
    /** @type {Array<'ours'|'theirs'|'both'|'neither'|null>} */
    choices: [],
    error: '',
    saved: false
  }),
  getters: {
    conflicts: (s) => (s.parsed?.segments ?? []).filter((seg) => seg.type === 'conflict'),
    total: (s) => conflictCount(s.parsed),
    remaining: (s) => unresolvedCount(s.parsed, s.choices),
    resolvedText: (s) => composeMerge(s.parsed, s.choices)
  },
  actions: {
    /** @param {string} content  the file as git left it, markers and all */
    begin(content) {
      this.parsed = parseConflicts(content)
      this.choices = new Array(conflictCount(this.parsed)).fill(null)
      this.error = this.parsed ? '' : 'unreadable'
      this.saved = false
      this.open = true
    },
    choose(index, choice) {
      if (index < 0 || index >= this.choices.length) return
      this.choices[index] = this.choices[index] === choice ? null : choice
    },
    takeAll(choice) {
      this.choices = this.choices.map(() => choice)
    },
    async save() {
      const text = this.resolvedText
      // composeMerge already refuses a half-resolved file; this is the guard
      // that keeps a UI mistake from reaching the write.
      if (text === null) return false
      const res = await window.api.writeMerged(text)
      if (!res?.ok) {
        this.error = 'write-failed'
        return false
      }
      this.saved = true
      this.open = false
      return true
    },
    close() {
      this.open = false
    }
  }
})
