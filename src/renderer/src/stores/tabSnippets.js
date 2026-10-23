// Spread into tabsStore, which is at its cap.
import {
  blankSnapshot,
  createSnippetTab,
  isBlank,
  isSnippetTab,
  tabForSnippet
} from '../utils/tabs'
import { tabsFullNotice } from '../utils/tabNotices'

// With a snippet tab in front, these belong to a comparison tab instead.
export const LOADS_CONTENT = new Set([
  'pick',
  'drop',
  'dropFiles',
  'dropSnippets',
  'receive',
  'receivePasteFile',
  'pastePickFile',
  'togglePasteMode'
])

export const snippetTabActions = {
  /**
   * @param {{ id: string|null, initialName?: string, initialContent?: string,
   *   initialTags?: string[], initialLanguage?: string }} editing
   * @param {string} [name]  the saved snippet's name, for the tab title
   * @returns {string|null} the tab id, or null when no tab could be had
   */
  openSnippet(editing, name = '') {
    const existing = tabForSnippet(this.tabs, editing.id)
    if (existing) {
      this.activate(existing.id)
      return existing.id
    }
    // Stale until captured: a comparison built on the start surface reads as blank.
    this._capture()
    const tab = createSnippetTab({ snippetId: editing.id, title: name, initial: editing })
    const blank = isBlank(this.active) ? this.active : null
    if (!blank && !this.canAdd) {
      this._notice(`${tabsFullNotice(this.tabs)}. Close one first.`)
      return null
    }
    if (blank) this.tabs.splice(this.tabs.indexOf(blank), 1, tab)
    else this.tabs.push(tab)
    this._show(tab)
    return tab.id
  },
  // The strip hides blank comparisons, so reuse one rather than pile them up unseen.
  newTab({ paste = false, transient = false } = {}) {
    // The active tab's copy is stale until captured, and stale reads as blank.
    this._capture()
    const blank = this.tabs.find((t) => isBlank(t))
    let id = blank?.id ?? null
    if (blank) {
      this.activate(blank.id)
      blank.transient = transient
    } else {
      id = this.open(blankSnapshot(this._liveDoc().snapshot), { reuseBlank: false, transient })
    }
    if (id && paste) this._setPasteMode()
    return id
  },
  showStart() {
    this.newTab()
  },
  /**
   * @param {string} id
   * @param {{ title?: string, dirty?: boolean, snippetId?: string }} meta
   */
  setSnippetMeta(id, meta) {
    const tab = this.tabs.find((t) => t.id === id)
    if (!isSnippetTab(tab)) return
    if (meta.title !== undefined) tab.title = meta.title
    if (meta.dirty !== undefined) tab.dirty = meta.dirty
    if (meta.snippetId) tab.snippet.id = meta.snippetId
  }
}
