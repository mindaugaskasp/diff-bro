import { defineStore } from 'pinia'
import { useDiffStore } from './diffStore'
import { useVaultStore } from './vaultStore'
import { useSettingsStore } from './settingsStore'
import { loadPersisted, savePersisted } from '../persist'
import {
  MAX_TABS,
  blankSnapshot,
  canAddTab,
  createTab,
  cleanTabName,
  isBlank,
  nextActiveId,
  recyclableTab,
  tabTitle
} from '../utils/tabs'
import {
  EMPTY_ENVELOPE,
  SESSION_VERSION,
  packSession,
  readEnvelope,
  readSession
} from '../utils/session'

// Several comparisons open at once. The diffStore stays exactly what it was —
// THE ACTIVE DOCUMENT — and a tab is the snapshot it round-trips through
// snapshot()/restore(). Switching therefore costs one re-diff, and only the tab
// you are looking at owns Monaco models; the rest are inert text. That is the
// memory bound, by construction rather than by bookkeeping.
// Defaults as an object rather than destructuring defaults: open() sits right
// on the complexity limit and every `=` in a signature counts against it.
const OPEN_DEFAULTS = {
  diffSaved: false,
  entryId: null,
  reuseBlank: true,
  name: '',
  transient: false
}

// The session file is sealed with the vault key, like a saved diff — it holds
// the same thing (whole file contents), so it is stored the same way. The AAD
// binds it to this store and shape, so a box lifted from anywhere else fails.
const SESSION_AAD = 'session|v1'

export const useTabsStore = defineStore('tabs', {
  state: () => ({
    /** @type {import('../utils/tabs').DiffTab[]} */
    tabs: [],
    activeId: null,
    // The stored session has been read (or found absent) and may now be written
    // over. False while the vault key is unavailable — see saveSession.
    sessionReady: false
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
        ignoreTrimWhitespace: snapshot.ignoreTrimWhitespace ?? diff.ignoreTrimWhitespace,
        semanticView: snapshot.semanticView === true
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
      if (!this.canAdd) {
        useDiffStore().showNotice(
          `That is the most comparisons at once (${MAX_TABS}). Close one first.`
        )
        return null
      }
      const tab = createTab(full, { diffSaved, transient })
      this.tabs.push(tab)
      return this._fill(tab, full, { diffSaved, entryId, name })
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
      const tab = this.tabs.find((t) => t.id === id)
      if (!tab) return
      if (this.unsaved(tab)) useDiffStore().pendingTabClose = tab.id
      else this.close(tab.id)
    },
    // Its saved diff is gone, so the tab must stop claiming to be in the vault:
    // "saved" is what silences the discard prompts.
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
    /**
     * Write the open comparisons out, so closing the app is not a loss. Sealed
     * with the vault key (never plaintext: this is the file contents you were
     * reading). Called on a debounce — see useSessionPersistence.
     */
    async saveSession() {
      if (!useSettingsStore().restoreSession) return
      if (typeof window.api?.vaultEncrypt !== 'function') return
      const diff = useDiffStore()
      const packed = packSession(this.tabs, this.activeId, {
        snapshot: diff.snapshot(),
        diffSaved: diff.diffSaved
      })
      if (!packed) {
        // Only clear a session we were able to READ. A locked keychain is
        // temporary; the comparisons behind it are not ours to throw away.
        if (this.sessionReady) savePersisted('session', EMPTY_ENVELOPE)
        return
      }
      const box = await window.api.vaultEncrypt(JSON.stringify(packed), SESSION_AAD)
      if (box?.error) return
      savePersisted(
        'session',
        JSON.stringify({ version: SESSION_VERSION, iv: box.iv, data: box.data })
      )
      this.sessionReady = true
    },
    /**
     * Reopen last session's comparisons, replacing the blank tab init() made.
     * Runs before the window accepts anything else, so nothing it restores can
     * land on top of a diff the user already asked for.
     * @returns {Promise<number>} how many tabs came back
     */
    async restoreSession() {
      if (!useSettingsStore().restoreSession) return 0
      const box = readEnvelope(loadPersisted('session'))
      if (!box || typeof window.api?.vaultDecrypt !== 'function') {
        this.sessionReady = true
        return 0
      }
      const plaintext = await window.api.vaultDecrypt(box, SESSION_AAD)
      // An { error } is the KEY, not the file: keep the session for a launch
      // where the keychain is open rather than overwriting it with nothing.
      if (plaintext && typeof plaintext === 'object') return 0
      this.sessionReady = true
      const session = readSession(plaintext)
      if (!session) return 0
      this._restoreTabs(session)
      return session.tabs.length
    },
    /**
     * Settings → Storage. Turning it off forgets what is already stored:
     * leaving the last comparisons on disk after "don't reopen them" would be a
     * promise only half kept.
     * @param {boolean} on
     */
    setRestoreSession(on) {
      useSettingsStore().setRestoreSession(on)
      if (!on) savePersisted('session', EMPTY_ENVELOPE)
    },
    _restoreTabs(session) {
      this.tabs = session.tabs.map((stored) => {
        const tab = createTab(stored.snapshot, { diffSaved: stored.diffSaved })
        tab.entryId = stored.entryId
        tab.customTitle = cleanTabName(stored.customTitle)
        return tab
      })
      this._show(this.tabs[session.tabs.findIndex((t) => t.active)] ?? this.tabs[0])
    }
  }
})
