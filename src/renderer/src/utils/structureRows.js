// What the structure viewer SHOWS, as opposed to what the comparison found.
// Separate from structuralDiff.js because it is a view question — the diff does
// not care which rows are on screen — and because that file is at its size cap.

/**
 * The rows worth showing: everything, or just what changed plus the ancestors
 * that give it context. Ancestors are followed through `parent` rather than by
 * splitting the path, so a key containing the separator cannot pull an unrelated
 * row into view.
 * @param {import('./structuralDiff').TreeRow[]} rows
 * @param {boolean} showAll
 * @returns {import('./structuralDiff').TreeRow[]}
 */
export function visibleStructureRows(rows, showAll) {
  if (showAll) return rows
  const parentOf = new Map(rows.map((r) => [r.path, r.parent]))
  const keep = new Set()
  for (const row of rows) {
    if (row.status === 'same') continue
    keep.add(row.path)
    let path = row.parent
    while (path != null && !keep.has(path)) {
      keep.add(path)
      path = parentOf.get(path) ?? null
    }
  }
  return rows.filter((r) => keep.has(r.path))
}
