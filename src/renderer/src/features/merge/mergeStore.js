import { defineStore } from 'pinia'
import { parseConflicts, withoutProseConflicts } from '../../utils/mergeConflicts'
import { initialRanges, sidesFromConflicts } from './threeWay'

// With no markers left in the result there is nothing for a parser to count, so
// resolution is state rather than something re-derived from the text.

// Monaco keeps ONE ending per model, so a file that mixes them comes back out of
// the editor normalised — including on lines the reader never touched. It cannot
// be prevented here, so it is said out loud before anything is written.
const hasMixedEndings = (text) => /\r\n/.test(text) && /(^|[^\r])\n/.test(text)

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
    /** Where each region opens, 1-based: the panes anchor their decorations here. */
    regionLines: [],
    ours: '',
    theirs: '',
    base: null,
    /** @type {Array<{ours: string[], theirs: string[], resolved: boolean}>} */
    regions: [],
    error: '',
    mixedEndings: false,
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
      const read = parseConflicts(payload.content)
      this.error = read ? '' : 'unreadable'
      // The index has the last word on which marker blocks git wrote: a document
      // ABOUT conflicts carries its own, and they are prose, not a decision.
      const parsed = withoutProseConflicts(read, payload.content, payload)
      this.regions = (parsed?.segments ?? [])
        .filter((seg) => seg.type === 'conflict')
        .map((seg) => ({ ours: seg.ours, theirs: seg.theirs, resolved: false }))
      // Our side stands in each conflicted place so the file is valid from the
      // start; the region is tinted unresolved until the reader confirms it.
      this.result = parsed ? sidesFromConflicts(parsed).ours : payload.content
      this.regionLines = initialRanges(parsed)
      this.mixedEndings = hasMixedEndings(payload.content)
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
