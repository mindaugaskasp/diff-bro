import { describe, expect, it } from 'vitest'
import { changeRegister, toCsv } from '../../../src/renderer/src/utils/changeRegister'
import { diffWorkbooks } from '../../../src/renderer/src/utils/spreadsheetDiff'

const sheet = (name, rows, cells = []) => ({ name, rows, cells })
const register = (l, r) => changeRegister(diffWorkbooks(l, r))
const bodyOf = (rows) => rows.slice(1) // drop the header

describe('changeRegister', () => {
  it('leads with a header row and nothing else when the sheets match', () => {
    const s = [
      sheet('S', [
        ['A', 'B'],
        [1, 2]
      ])
    ]
    expect(changeRegister(diffWorkbooks(s, s))).toEqual([
      ['Sheet', 'Cell', 'Column', 'Change', 'Before', 'After']
    ])
  })

  it('reports a changed cell at its A1 reference on both sides', () => {
    const rows = bodyOf(
      register(
        [
          sheet('Budget', [
            ['Metric', 'Q1'],
            ['Revenue', 100]
          ])
        ],
        [
          sheet('Budget', [
            ['Metric', 'Q1'],
            ['Revenue', 140]
          ])
        ]
      )
    )
    expect(rows).toEqual([['Budget', 'B2', 'Q1', 'Value', '100', '140']])
  })

  it('separates a formula change from a value change', () => {
    const rows = bodyOf(
      register(
        [
          sheet(
            'S',
            [
              ['A', 'Total'],
              ['x', 3]
            ],
            [[1, 1, { f: 'A2+1', n: 'RC[-1]+1' }]]
          )
        ],
        [
          sheet('S', [
            ['A', 'Total'],
            ['x', 3]
          ])
        ]
      )
    )
    expect(rows[0][3]).toBe('Formula')
    expect(rows[0][1]).toBe('B2')
  })

  it('reports added and removed rows with their contents', () => {
    const rows = bodyOf(
      register(
        [
          sheet('S', [
            ['Name', 'N'],
            ['keep', 1],
            ['gone', 2]
          ])
        ],
        [
          sheet('S', [
            ['Name', 'N'],
            ['keep', 1],
            ['new', 3]
          ])
        ]
      )
    )
    const kinds = rows.map((r) => r[3])
    expect(kinds).toContain('Row removed')
    expect(kinds).toContain('Row added')
    expect(rows.find((r) => r[3] === 'Row removed')[4]).toBe('gone | 2')
    expect(rows.find((r) => r[3] === 'Row added')[5]).toBe('new | 3')
  })

  it('reports a whole column once, not once per row', () => {
    const rows = bodyOf(
      register(
        [
          sheet('S', [
            ['A', 'B'],
            [1, 2],
            [3, 4]
          ])
        ],
        [
          sheet('S', [
            ['A', 'New', 'B'],
            [1, 9, 2],
            [3, 9, 4]
          ])
        ]
      )
    )
    expect(rows).toEqual([['S', '', 'New', 'Column added', '', '']])
  })

  it('names the sheet each change came from', () => {
    // The key column (A) has to hold still, or the row reads as removed+added
    // rather than changed — which is the row pairing working as designed.
    const before = (name) =>
      sheet(name, [
        ['Name', 'N'],
        ['x', 1]
      ])
    const after = (name, n) =>
      sheet(name, [
        ['Name', 'N'],
        ['x', n]
      ])
    const rows = bodyOf(
      register([before('One'), before('Two')], [after('One', 2), after('Two', 3)])
    )
    expect(rows.map((r) => r[0])).toEqual(['One', 'Two'])
  })
})

describe('toCsv', () => {
  it('quotes fields holding a comma, a quote or a newline', () => {
    expect(toCsv([['plain', 'a,b', 'say "hi"', 'two\nlines']])).toBe(
      'plain,"a,b","say ""hi""","two\nlines"'
    )
  })

  it('separates rows with CRLF, as RFC 4180 asks', () => {
    expect(toCsv([['a'], ['b']])).toBe('a\r\nb')
  })

  // A cell value the user did not write becomes a live formula the moment the
  // export is opened in Excel. The leading apostrophe is what stops that.
  it('defuses a field that a spreadsheet would run as a formula', () => {
    expect(toCsv([['=1+1', '+A1', '-A1', '@SUM(A1)']])).toBe("'=1+1,'+A1,'-A1,'@SUM(A1)")
    expect(toCsv([['=HYPERLINK("http://x","go")']])).toBe('"\'=HYPERLINK(""http://x"",""go"")"')
  })

  // The cost of the guard: a CSV field cannot say "this is a number", so a
  // negative one is quoted too. Reading -5 as text beats running it as a
  // formula, and the register is a report, not an input.
  it('guards a leading minus even on an ordinary negative number', () => {
    expect(toCsv([[-5]])).toBe("'-5")
  })
})
