import { rowColorId } from '../utils/rowColor'

// A snippet's row colour (see utils/rowColor). Its own module because the store
// is at its size cap. The field is absent by default and absent again once
// cleared — never the string 'none' — so a library nobody has coloured carries
// no trace of the feature.

export const colorActions = {
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
  }
}
