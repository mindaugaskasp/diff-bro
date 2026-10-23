// The confirmation guard every close route funnels through, spread into
// tabsStore, which is at its cap.
import { tabsClosedBy } from '../utils/tabMenu'
import {
  blankSnapshot,
  createTab,
  isSnippetTab,
  nextActiveId,
  nextActiveIdAfterClosing,
  tabTitle
} from '../utils/tabs'

export const closingActions = {
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

  close(id) {
    const target = this.tabs.find((t) => t.id === id)
    if (!target) return
    // Closing the last tab leaves an empty comparison, not an empty window.
    if (this.tabs.length === 1) {
      const fresh = blankSnapshot(this._liveDoc().snapshot)
      // A snippet has no comparison to empty: the start surface takes its place.
      if (isSnippetTab(target)) {
        const blank = createTab(fresh)
        this.tabs = [blank]
        this._show(blank)
        return
      }
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
  }
}
