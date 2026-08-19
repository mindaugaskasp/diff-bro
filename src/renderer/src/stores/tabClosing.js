// The confirmation guard every close route funnels through, spread into
// tabsStore, which is at its cap.
import { tabsClosedBy } from '../utils/tabMenu'

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
  }
}
