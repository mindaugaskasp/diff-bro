import { defineStore } from 'pinia'
import { useDiffStore } from './diffStore'
import { useVaultStore } from './vaultStore'
import {
  MAX_TABS,
  blankSnapshot,
  canAddTab,
  createTab,
  cleanTabName,
  isBlank,
  nextActiveId,
  tabTitle
} from '../utils/tabs'

// Several comparisons open at once. The diffStore stays exactly what it was —
// THE ACTIVE DOCUMENT — and a tab is the snapshot it round-trips through
// snapshot()/restore(). Switching therefore costs one re-diff, and only the tab
// you are looking at owns Monaco models; the rest are inert text. That is the
// memory bound, by construction rather than by bookkeeping.
// Defaults as an object rather than destructuring defaults: open() sits right
// on the complexity limit and every `=` in a signature counts against it.
const OPEN_DEFAULTS = { diffSaved: false, entryId: null, reuseBlank: true, name: '' }

export const useTabsStore = defineStore('tabs', {
  state: () => ({
    /** @type {import('../utils/tabs').DiffTab[]} */
    tabs: [],
    activeId: null
  }),
  getters: {
    active: (s) => s.tabs.find((t) => t.id === s.activeId) ?? null,
    canAdd: (s) => canAddTab(s.tabs),
    // Always shown once there is a document. Hiding it at one tab looked tidier
    // but left no way to reach the "+" that makes the second one — the bar has
    // to be present for tabs to be discoverable at all.
    visible: (s) => s.tabs.length > 0
  },
  actions: {
    // The window opens on whatever the diff store already holds, so the first
    // tab is the current comparison rather than a blank one pushed in front.
    init() {
      if (this.tabs.length) return
      const diff = useDiffStore()
      const tab = createTab(diff.snapshot(), { diffSaved: diff.diffSaved })
      this.tabs = [tab]
      this.activeId = tab.id
    },
    // Fold the live document back into its tab. Called before anything that
    // looks away from it, so no edit is left only in the editor.
    _capture() {
      const tab = this.active
      if (!tab) return
      const diff = useDiffStore()
      tab.snapshot = diff.snapshot()
      tab.diffSaved = diff.diffSaved
      tab.title = tabTitle(tab.snapshot)
    },
    _show(tab) {
      const diff = useDiffStore()
      this.activeId = tab.id
      diff.restore(tab.snapshot)
      // restore() is the saved-diff path and asserts "already in the vault";
      // a tab carries its own answer, which for a scratch comparison is no.
      diff.diffSaved = tab.diffSaved
    },
    activate(id) {
      if (id === this.activeId) return
      const next = this.tabs.find((t) => t.id === id)
      if (!next) return
      this._capture()
      this._show(next)
    },
    // A snapshot that says nothing about the view keeps the one in use: only a
    // saved diff, which recorded its own, should change how the panes are set.
    _withCurrentView(snapshot) {
      const diff = useDiffStore()
      return {
        ...snapshot,
        renderSideBySide: snapshot.renderSideBySide ?? diff.renderSideBySide,
        ignoreTrimWhitespace: snapshot.ignoreTrimWhitespace ?? diff.ignoreTrimWhitespace
      }
    },
    _fill(tab, snapshot, { diffSaved, entryId, name }) {
      tab.entryId = entryId
      tab.snapshot = snapshot
      tab.diffSaved = diffSaved
      tab.title = tabTitle(snapshot)
      // A saved diff arrives already named; the tab and the entry are the same
      // comparison, so they carry the same name.
      tab.customTitle = cleanTabName(name)
      this._show(tab)
      return tab.id
    },
    /**
     * Open a comparison in its own tab. A blank active tab is reused rather
     * than left behind, and a saved diff already open is focused instead of
     * duplicated.
     *
     * `reuseBlank` is off for the + button: reusing there refilled the tab you
     * were already looking at, so pressing + on a fresh window did nothing.
     * @param {object} [snapshot]
     * @param {{ diffSaved?: boolean, entryId?: string, reuseBlank?: boolean }} [opts]
     */
    open(snapshot, opts) {
      const { diffSaved, entryId, reuseBlank, name } = { ...OPEN_DEFAULTS, ...opts }
      const wanted = snapshot ?? blankSnapshot()
      const existing = entryId ? this.tabs.find((t) => t.entryId === entryId) : null
      if (existing) {
        this.activate(existing.id)
        return existing.id
      }
      // Fold the live document into its tab BEFORE deciding anything about it:
      // a tab's snapshot goes stale the moment work happens, and asking a stale
      // one whether it is blank reuses a tab that is not.
      this._capture()
      const full = this._withCurrentView(wanted)
      const spare = reuseBlank && isBlank(this.active) ? this.active : null
      if (spare) return this._fill(spare, full, { diffSaved, entryId, name })
      if (!this.canAdd) {
        useDiffStore().showNotice(`That's the most tabs at once (${MAX_TABS}). Close one first.`)
        return null
      }
      const tab = createTab(full, { diffSaved })
      this.tabs.push(tab)
      return this._fill(tab, full, { diffSaved, entryId, name })
    },
    newTab({ paste = false } = {}) {
      const diff = useDiffStore()
      const id = this.open(blankSnapshot(diff), { reuseBlank: false })
      if (id && paste) diff.mode = 'paste'
      return id
    },
    close(id) {
      const target = this.tabs.find((t) => t.id === id)
      if (!target) return
      // Closing the last tab leaves an empty comparison, not an empty window.
      if (this.tabs.length === 1) {
        const fresh = blankSnapshot(useDiffStore())
        target.entryId = null
        target.snapshot = fresh
        target.diffSaved = false
        target.title = tabTitle(fresh)
        // The name went with the comparison — leaving it behind labelled an
        // empty tab after the diff it used to hold.
        target.customTitle = ''
        this._show(target)
        return
      }
      const goingTo = nextActiveId(this.tabs, id, this.activeId)
      // Capture first ONLY when the live document survives — a closing tab's
      // state is what is being thrown away.
      if (this.activeId !== id) this._capture()
      this.tabs = this.tabs.filter((t) => t.id !== id)
      const next = this.tabs.find((t) => t.id === goingTo)
      if (next && next.id !== this.activeId) this._show(next)
      else this.activeId = next?.id ?? null
    },
    // Menu/keyboard cycling; wraps at both ends.
    step(delta) {
      if (this.tabs.length < 2) return
      const i = this.tabs.findIndex((t) => t.id === this.activeId)
      const next = this.tabs[(i + delta + this.tabs.length) % this.tabs.length]
      this.activate(next.id)
    },
    /**
     * Name a tab by hand. The derived title keeps tracking the snapshot
     * underneath, so clearing the name returns the tab to naming itself.
     * @param {string} id
     * @param {string} name  '' to go back to the derived title
     */
    rename(id, name) {
      const tab = this.tabs.find((t) => t.id === id)
      if (!tab) return
      tab.customTitle = cleanTabName(name)
      // A tab holding a saved diff IS that diff, so the sidebar follows the
      // name rather than drifting from it.
      if (tab.entryId && tab.customTitle) useVaultStore().rename(tab.entryId, tab.customTitle)
    },
    // The live document changed under us (a file was picked, text pasted), so
    // the tab's label should follow without waiting for a switch.
    syncActiveTitle() {
      const tab = this.active
      if (!tab) return
      tab.title = tabTitle(useDiffStore().snapshot())
    }
  }
})
