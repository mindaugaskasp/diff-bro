// App chrome: which dialog, tool panel or palette is open. Shell state that many
// features raise and none owns, so it is core rather than a slice.

import { defineStore } from 'pinia'
import { ZOOM_DEFAULT, steppedZoom } from '../utils/diffZoom'

// How long a moved row stays washed. Matches the created-row wash so the two
// read as one language.
export const MOVED_ROW_MS = 4000
let movedTimer = null

export const useUiStore = defineStore('ui', {
  state: () => ({
    // Which tool panel is open (a registry id), null when none.
    textTool: null,
    // Encrypt/Decrypt tool dialog visibility.
    showCryptDialog: false,
    // Settings dialog (data location) visibility.
    showSettingsDialog: false,
    // Help → Keyboard Shortcuts dialog visibility.
    showShortcutsDialog: false,
    // ⌘K-style command palette visibility.
    showCommandPalette: false,
    // What the palette lists: every menu command, or just the tools.
    paletteScope: 'all',
    // Mermaid diagram viewer: { name, code } while open, null when closed.
    mermaidView: null,
    // Snippet version history: { id } while open, null when closed.
    snippetHistory: null,
    // The sidebar's two filters. Core rather than local to the sidebar because
    // the tour drives both — it types into the search, and it clears a tag
    // filter that would hide the very snippet a step points at — and the core
    // may not import a slice.
    sidebarQuery: '',
    /** @type {string[]} */
    sidebarTags: [],
    // How closely the COMPARISON is read. Not the app's zoom — Chromium's own
    // scaled the toolbar and sidebar with it, which is what ran the bar out of
    // room. Transient by design, like the diagram viewer's own zoom: it is a
    // "let me look closer at this", not a setting.
    diffZoom: ZOOM_DEFAULT,
    // The row the new-row marker draws. ONE key, not one per collection: saving
    // a diff and then adding a snippet must leave one mark, not two. Never
    // persisted — a mark surviving a relaunch would be a second pinned-like
    // row state.
    lastCreatedRowId: null,
    // The row a reorder just moved. Its own key, not the one above: "created"
    // and "moved" carry different badges, and a move must not claim a row is
    // new. Self-clearing, because a move has no follow-up gesture to retire it
    // the way a create's does.
    lastMovedRowId: null,
    // Which pane Settings opens on. Null means "wherever it opens by default" —
    // a menu item that documents the CLI has to land on the CLI pane.
    settingsTab: null
  }),
  actions: {
    openSettings(tab = null) {
      this.settingsTab = tab
      this.showSettingsDialog = true
    },
    markMovedRow(id) {
      clearTimeout(movedTimer)
      this.lastMovedRowId = id
      movedTimer = setTimeout(() => {
        if (this.lastMovedRowId === id) this.lastMovedRowId = null
      }, MOVED_ROW_MS)
    },
    markNewRow(id) {
      this.lastCreatedRowId = id
    },
    clearNewRow(id) {
      if (this.lastCreatedRowId === id) this.lastCreatedRowId = null
    },
    zoomDiff(direction) {
      this.diffZoom = steppedZoom(this.diffZoom, direction)
    },
    // Open the Mermaid viewer for a diagram's decrypted source. `theme` carries
    // a per-viewing ground over from the editor preview; the viewer falls back
    // to the stored default without one.
    openMermaid(name, code, theme = '') {
      this.mermaidView = { name, code, theme }
    },
    closeMermaid() {
      this.mermaidView = null
    },
    openSnippetHistory(id) {
      this.snippetHistory = { id }
    },
    closeSnippetHistory() {
      this.snippetHistory = null
    },
    // The command palette, scoped to tools (the shelf's "Browse all tools").
    openToolsPalette() {
      this.paletteScope = 'tools'
      this.showCommandPalette = true
    }
  }
})
