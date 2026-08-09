import { defineStore } from 'pinia'
import { useDiffStore } from './diffStore'
import { useVaultStore } from './vaultStore'
import { tabsClosedBy } from '../utils/tabMenu'
import {
  blankSnapshot,
  canAddTab,
  createTab,
  cleanTabName,
  isBlank,
  OPEN_DEFAULTS,
  nextActiveId,
  nextActiveIdAfterClosing,
  recyclableTab,
  tabTitle
} from '../utils/tabs'
import {} from '../utils/session'
import { evictionActions } from './tabEviction'
import { sessionActions } from './tabSession'

// Several comparisons open at once. diffStore stays THE ACTIVE DOCUMENT and a
// tab is the snapshot it round-trips through snapshot()/restore(), so only the
// tab on screen owns Monaco models — the memory bound by construction.
export const useTabsStore = defineStore('tabs', {
  state: () => ({
    // Tab ids awaiting a discard confirmation — closing is the one way paste
    // text is lost. `pendingEvict` is { id, snapshot, opts }: an open waiting
    // on permission to evict a tab.
    pendingClose: null,
    pendingEvict: null,
    /** @type {import('../utils/tabs').DiffTab[]} */
    tabs: [],
    activeId: null,
    // The stored session has been read (or found absent) and may now be written
    // over. False while the vault key is unavailable — see saveSession.
    sessionReady: false,
    // How many comparisons the last write could not fit, so the warning is
    // raised when that number changes rather than on every debounced save.
    sessionDropped: 0
  }),
  getters: {
    active: (s) => s.tabs.find((t) => t.id === s.activeId) ?? null,
    canAdd: (s) => canAddTab(s.tabs),
    // Whether a comparison can be hosted at all — a free tab, or, for one git
    // handed over, a throwaway git tab to recycle.
    /** @returns {(transient: boolean) => boolean} */
    canHost: (s) => (transient) =>
      canAddTab(s.tabs) || (!!transient && !!recyclableTab(s.tabs, s.activeId)),
    // Always shown once there is a document. Hiding it at one tab looked tidier
    // but left no way to reach the "+" that makes the second one — the bar has
    // to be present for tabs to be discoverable at all.
    visible: (s) => s.tabs.length > 0,
    // A tab's own snapshot is only refreshed when tabs switch, so for the one on
    // screen it is stale by definition — that one is asked of the live document.
    /** @returns {(tab: import('../utils/tabs').DiffTab) => boolean} */
    unsaved: (s) => (tab) => {
      if (!tab) return false
      if (tab.id !== s.activeId) return !tab.diffSaved && !isBlank(tab)
      const diff = useDiffStore()
      return !diff.diffSaved && diff.hasActive
    }
  },
  actions: {
    requestActiveClose() {
      if (this.activeId) this.requestClose(this.activeId)
    },
    confirmClose() {
      const ids = this.pendingClose
      this.pendingClose = null
      if (ids?.length) this.closeMany(ids)
    },
    cancelClose() {
      this.pendingClose = null
    },
    // The window opens on whatever the diff store already holds, so the first
    // tab is the current comparison rather than a blank one pushed in front.
    init() {
      if (this.tabs.length) return
      const diff = useDiffStore()
      // Subscribed rather than called: a cleared comparison must drop its tab's
      // entry link on EVERY path, and there are three (the Clear command, a
      // replacement dropped in, a replacement after saving). Requiring each
      // caller to remember is what orphaned the link the first two times — and
      // the core cannot call back into this store without re-forming the cycle.
      diff.$onAction(({ name, after }) => {
        if (name === 'clear') after(() => this.unlinkActiveEntry())
      })
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
    // A snapshot that says nothing about the PANES keeps the ones in use. NOT
    // semanticView: it belongs to the comparison, not to the last tab, so an
    // unrecorded one is left for restore() to take from the files.
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
      const { diffSaved, entryId, reuseBlank, name, transient } = { ...OPEN_DEFAULTS, ...opts }
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
      const spare = this._reusable({ reuseBlank, transient })
      if (spare) {
        spare.transient = transient
        return this._fill(spare, full, { diffSaved, entryId, name })
      }
      if (!this.canAdd && !this._makeRoom(full, opts)) return null
      const tab = createTab(full, { diffSaved, transient })
      this.tabs.push(tab)
      return this._fill(tab, full, { diffSaved, entryId, name })
    },
    ...evictionActions,
    // The seam: reaching diffStore from tabEviction or tabSession would close a
    // new import cycle back through here.
    _notice(text) {
      useDiffStore().showNotice(text)
    },
    _liveDoc() {
      const diff = useDiffStore()
      return { snapshot: diff.snapshot(), diffSaved: diff.diffSaved }
    },
    // A tab this comparison may take over. Blank first; failing that, and only
    // for one git handed us, the OLDEST other tab that also came from git —
    // those hold copies in a temp directory git has already deleted, so they are
    // throwaway by construction. `git mergetool` walks a whole conflict list
    // without waiting for anyone, and refusing the seventh conflict to protect
    // the first is backwards.
    _reusable({ reuseBlank, transient }) {
      if (reuseBlank && isBlank(this.active)) return this.active
      if (!transient || this.canAdd) return null
      return recyclableTab(this.tabs, this.activeId)
    },
    // What git handed over is the COMPARISON, not the tab: one that lands in a
    // tab that already existed is just as throwaway as one that made its own.
    /** @param {boolean} transient */
    markActiveTransient(transient) {
      if (this.active) this.active.transient = !!transient
    },
    newTab({ paste = false, transient = false } = {}) {
      const diff = useDiffStore()
      const id = this.open(blankSnapshot(diff), { reuseBlank: false, transient })
      if (id && paste) diff.mode = 'paste'
      return id
    },
    // The single close guard — menu, ×, and middle-click all arrive here.
    /** @param {string} id */
    requestClose(id) {
      this.requestCloseMany([id])
    },
    /**
     * Close a whole set, asking ONCE about whatever unsaved work it holds. One
     * prompt per tab would mean four dialogs for one "close to the right".
     * @param {string[]} ids
     */
    requestCloseMany(ids) {
      const open = (ids ?? []).filter((id) => this.tabs.some((t) => t.id === id))
      if (!open.length) return
      const risky = open.filter((id) => this.unsaved(this.tabs.find((t) => t.id === id)))
      if (risky.length) this.pendingClose = open
      else this.closeMany(open)
    },
    /**
     * @param {string} anchorId  the tab the menu was opened on
     * @param {import('../utils/tabMenu').TabMenuAction} action
     */
    requestMenuAction(anchorId, action) {
      this.requestCloseMany(tabsClosedBy(this.tabs, anchorId, action).map((t) => t.id))
    },
    /**
     * Remove a set in one pass. close() in a loop would capture and re-show —
     * and so re-diff — once per tab for a single click.
     * @param {string[]} ids
     */
    closeMany(ids) {
      const closing = new Set(ids ?? [])
      const survivors = this.tabs.filter((t) => !closing.has(t.id))
      // Nothing survives: fall through to close()'s last-tab path, which blanks
      // the comparison rather than leaving an empty window.
      if (!survivors.length) {
        const keep = this.active ?? this.tabs[this.tabs.length - 1]
        this.tabs = [keep]
        this.activeId = keep.id
        this.close(keep.id)
        return
      }
      const goingTo = nextActiveIdAfterClosing(this.tabs, [...closing], this.activeId)
      if (!closing.has(this.activeId)) this._capture()
      this.tabs = survivors
      const next = this.tabs.find((t) => t.id === goingTo)
      if (next && next.id !== this.activeId) this._show(next)
      else this.activeId = next?.id ?? null
    },
    // Its saved diff is gone, so the tab must stop claiming to be in the vault:
    // "saved" is what silences the discard prompts.
    // The active tab no longer shows the saved diff it was opened from.
    unlinkActiveEntry() {
      if (this.active) this.active.entryId = null
    },
    /** @param {string} entryId */
    forgetEntry(entryId) {
      for (const tab of this.tabs) {
        if (tab.entryId !== entryId) continue
        tab.entryId = null
        tab.diffSaved = false
        if (tab.id === this.activeId) useDiffStore().diffSaved = false
      }
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
    },
    ...sessionActions
  }
})
