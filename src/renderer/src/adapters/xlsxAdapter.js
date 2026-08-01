// Spreadsheet adapter. The heavy lifting (unzip + parse + security caps) already
// happened in the main process (src/main/xlsx/) because .xlsx is hostile binary
// input and the renderer never touches Node — so by the time a file reaches
// here it already carries { kind:'spreadsheet', sheets }. This adapter just
// hands that grid to the viewer as a comparable.

export const xlsxAdapter = {
  id: 'xlsx',
  matches: (file) => file?.kind === 'spreadsheet',
  /** @returns {import('../types').SpreadsheetComparable} */
  toComparable(file) {
    return { kind: 'spreadsheet', sheets: file.sheets ?? [] }
  },
  // A grid, never a `content` string: comparing that put undefined against
  // undefined and no workbook ever looked changed.
  sameContent: (a, b) => JSON.stringify(a?.sheets ?? null) === JSON.stringify(b?.sheets ?? null)
}
