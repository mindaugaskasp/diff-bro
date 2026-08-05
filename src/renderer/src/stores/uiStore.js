// App chrome: which dialog, tool panel or palette is open. Shell state that many
// features raise and none owns, so it is core rather than a slice.

import { defineStore } from 'pinia'

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
    // The sidebar's two filters. Core rather than local to the sidebar because
    // the tour drives both — it types into the search, and it clears a tag
    // filter that would hide the very snippet a step points at — and the core
    // may not import a slice.
    sidebarQuery: '',
    /** @type {string[]} */
    sidebarTags: []
  }),
  actions: {
    // Open the Mermaid viewer for a diagram's decrypted source. `theme` carries
    // a per-viewing ground over from the editor preview; the viewer falls back
    // to the stored default without one.
    openMermaid(name, code, theme = '') {
      this.mermaidView = { name, code, theme }
    },
    closeMermaid() {
      this.mermaidView = null
    },
    // The command palette, scoped to tools (the shelf's "Browse all tools").
    openToolsPalette() {
      this.paletteScope = 'tools'
      this.showCommandPalette = true
    }
  }
})
