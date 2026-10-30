import { rowColorId } from '../utils/rowColor'

// Row-menu metadata, never re-encrypted; out of the store, which is at its size cap.
// A cleared colour is absent, never the string 'none'.

export const markActions = {
  /**
   * @param {string} id  snippet id
   * @param {string|null} color  a ROW_COLORS id, or null to clear it
   */
  setSnippetColor(id, color) {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return
    const next = color == null ? null : rowColorId(color)
    // Only an explicit null clears. A value that is not in the palette is
    // REFUSED — treating it as a clear would let a stale id wipe the colour a
    // reader had picked.
    if (color != null && next === null) return
    if ((entry.color ?? null) === next) return
    if (next) entry.color = next
    else delete entry.color
    this.persist()
  },
  /**
   * @param {string} id  snippet id
   * @param {boolean} on
   */
  setSnippetSecret(id, on) {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return
    entry.secret = on === true
    this.persist()
  }
}
