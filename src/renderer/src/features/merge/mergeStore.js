import { defineStore } from 'pinia'
import { parseConflicts } from '../../utils/mergeConflicts'
import { sidesFromConflicts } from './threeWay'

/**
 * A `git mergetool` run.
 *
 * The result pane NEVER shows conflict markers. `<<<<<<<` is a file format, not
 * a user interface — a merge tool that shows it is showing its storage. The
 * result opens as a valid file with our side in each conflicted place, every
 * such place marked unresolved until the reader says what it should be.
 *
 * Because there are no markers to count, resolution is explicit state rather
 * than something re-derived from the text: a hand-edited region has nothing in
 * it for a parser to find.
 */
// Where this file sits in `git mergetool`'s walk, defaulted so a single-file
// merge needs no special case.
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
