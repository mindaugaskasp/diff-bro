import { describe, expect, it } from 'vitest'
import { xlsxAdapter } from '../../../src/renderer/src/adapters/xlsxAdapter'
import { textAdapter } from '../../../src/renderer/src/adapters/textAdapter'
import { resolveAdapter } from '../../../src/renderer/src/adapters'

const sheetFile = (sheets) => ({ name: 'book.xlsx', kind: 'spreadsheet', sheets })

describe('xlsxAdapter', () => {
  it('is resolved for a parsed spreadsheet file', () => {
    expect(resolveAdapter(sheetFile([]))).toBe(xlsxAdapter)
  })

  it('does not claim text files, even ones named .xlsx without a parsed grid', () => {
    // Only main sets kind:'spreadsheet'. A plain object named .xlsx with no
    // kind is not a parsed spreadsheet and must fall through to text.
    expect(resolveAdapter({ name: 'a.xlsx', content: 'hi' })).toBe(textAdapter)
    expect(resolveAdapter({ name: 'a.txt', content: 'hi' })).toBe(textAdapter)
  })

  it('turns the loaded sheets into a spreadsheet comparable', () => {
    const sheets = [{ name: 'S1', rows: [['a', 1]] }]
    expect(xlsxAdapter.toComparable(sheetFile(sheets))).toEqual({ kind: 'spreadsheet', sheets })
  })

  it('tolerates a missing sheets array', () => {
    expect(xlsxAdapter.toComparable({ name: 'x.xlsx', kind: 'spreadsheet' })).toEqual({
      kind: 'spreadsheet',
      sheets: []
    })
  })
})
