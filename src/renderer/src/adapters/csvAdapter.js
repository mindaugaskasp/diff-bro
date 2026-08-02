// The grid comparable for delimited text. Deliberately NOT in the auto-resolve
// registry, for the same reason as structureAdapter: a .csv is still a text
// file, and its line diff is often the one you want. Reached only when the
// reader turns Grid on (diffStore.semanticView).
import { parseDelimited } from '../utils/csv'

// Sheets pair by NAME, and the two sides of a comparison are two differently
// named files — so the one sheet a delimited file produces carries a fixed name
// on both sides. The slots above already say which file is which.
const SHEET_NAME = 'Data'

export const csvAdapter = {
  id: 'csv',
  matches: (file, delimiter) => !!delimiter && typeof file?.content === 'string',
  /**
   * @param {{ content: string }} file
   * @param {string} delimiter
   * @returns {import('../types').SpreadsheetComparable}
   */
  toComparable(file, delimiter) {
    const { rows, truncated } = parseDelimited(file.content, { delimiter })
    return {
      kind: 'spreadsheet',
      sheets: [{ name: SHEET_NAME, rows, cells: [], hiddenRows: [], truncated }]
    }
  }
}
