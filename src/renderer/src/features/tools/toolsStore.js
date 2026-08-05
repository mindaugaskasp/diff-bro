import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../../persist'
import { TOOLS, toolById, toolRows } from '../../utils/tools'

// Its own persisted key rather than a corner of settingsStore: pins are this
// slice's state, and the core store is already at its size cap.
const KEY = 'tools'

// Stored pins outlive the registry — a hand-edited file, or a tool dropped in a
// later version — so they are filtered against it on the way in, not on render.
function readPinned() {
  let saved
  try {
    saved = JSON.parse(loadPersisted(KEY) ?? '{}') || {}
  } catch {
    saved = {}
  }
  if (!Array.isArray(saved.pinned)) return []
  return saved.pinned.filter((id, i) => toolById(id) && saved.pinned.indexOf(id) === i)
}

export const useToolsStore = defineStore('tools', {
  state: () => ({ pinned: readPinned() }),
  getters: {
    isPinned: (s) => (id) => s.pinned.includes(id),
    // What the sidebar section and the rail both draw: pinned first, everything
    // else in registry order. Using a tool never moves it.
    rows: (s) => toolRows(s.pinned),
    railRows: (s) => (limit) => toolRows(s.pinned, limit),
    pinnedCount: (s) => s.pinned.length,
    total: () => TOOLS.length
  },
  actions: {
    togglePin(id) {
      if (!toolById(id)) return
      this.pinned = this.pinned.includes(id)
        ? this.pinned.filter((x) => x !== id)
        : [...this.pinned, id]
      this.persist()
    },
    persist() {
      savePersisted(KEY, JSON.stringify({ pinned: this.pinned }))
    }
  }
})
