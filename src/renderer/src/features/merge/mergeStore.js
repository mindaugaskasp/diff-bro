import { defineStore } from 'pinia'
import { parseConflicts } from '../../utils/mergeConflicts'
import { sidesFromConflicts } from './threeWay'

// With no markers left in the result there is nothing for a parser to count, so
// resolution is state rather than something re-derived from the text.

// Defaulted so a single-file merge needs no special case.
const walkOf = (payload) => ({
  fileName: payload.fileName ?? '',
  position: payload.position ?? 1,
  total: payload.total ?? 1,
  oursName: payload.oursName ?? '',
  theirsName: payload.theirsName ?? ''
})

export const useMergeStore = defineStore('merge', {
  state: () => ({
    open: false,
    fileName: '',
    position: 1,
    total: 1,
    /** The branches the two sides come from, empty when git cannot name them. */
    oursName: '',
    theirsName: '',
    /** The editable middle pane, marker-free from the moment it opens. */
    result: '',
    /** What git left, kept only to seed the regions' first positions. */
    rawContent: '',
    ours: '',
    theirs: '',
    base: null,
    /** @type {Array<{ours: string[], theirs: string[], resolved: boolean}>} */
    regions: [],
    error: '',
    saved: false,
    at: 0
  }),
  getters: {
    remaining: (s) => s.regions.filter((r) => !r.resolved).length,
    canSave: (s) => !s.error && s.regions.every((r) => r.resolved),
    // Worth showing only when there is a walk to be part of.
    showsWalk: (s) => s.total > 1
  },
  actions: {
    /** @param {object} payload from main: the conflicted text and both sides */
    begin(payload) {
      const parsed = parseConflicts(payload.content)
      this.error = parsed ? '' : 'unreadable'
      this.regions = (parsed?.segments ?? [])
        .filter((seg) => seg.type === 'conflict')
        .map((seg) => ({ ours: seg.ours, theirs: seg.theirs, resolved: false }))
      // Our side stands in each conflicted place so the file is valid from the
      // start; the region is tinted unresolved until the reader confirms it.
      this.result = parsed ? sidesFromConflicts(parsed).ours : payload.content
      this.rawContent = payload.content
      const fallback = sidesFromConflicts(parsed)
      this.ours = payload.ours ?? fallback.ours
      this.theirs = payload.theirs ?? fallback.theirs
      this.base = payload.base ?? null
      Object.assign(this, walkOf(payload))
      this.saved = false
      this.at = 0
      this.open = true
    },
    markResolved(index) {
      if (this.regions[index]) this.regions[index].resolved = true
    },
    step(delta) {
      const total = this.regions.length
      if (total) this.at = (this.at + delta + total) % total
    },
    async save() {
      if (!this.canSave) return false
      const res = await window.api.writeMerged(this.result)
      if (!res?.ok) {
        this.error = 'write-failed'
        return false
      }
      this.saved = true
      this.open = false
      return true
    },
    // Declining tells main, or the launcher waits on a decision that is not
    // coming and the write stays armed for the life of the process.
    async close() {
      this.open = false
      if (!this.saved) await window.api.cancelMerge()
    }
  }
})
