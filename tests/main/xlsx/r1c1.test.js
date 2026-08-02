import { describe, expect, it } from 'vitest'
import { toR1C1, shiftFormula } from '../../../src/main/xlsx/r1c1'

describe('toR1C1', () => {
  it('writes relative references as offsets from the owning cell', () => {
    // C3 (row 2, col 2) referring to A1 and C2.
    expect(toR1C1('A1+C2', 2, 2)).toBe('R[-2]C[-2]+R[-1]C')
  })

  it('normalises the same meaning at different positions to one string', () => {
    expect(toR1C1('SUM(A1:A5)', 5, 1)).toBe(toR1C1('SUM(A11:A15)', 15, 1))
  })

  it('keeps $-pinned parts absolute', () => {
    expect(toR1C1('$A$1+$A2+A$1', 4, 3)).toBe('R1C1+R[-3]C1+R1C[-3]')
  })

  it('leaves function names and scientific notation alone', () => {
    expect(toR1C1('LOG10(A1)+1.5E10', 0, 0)).toBe('LOG10(RC)+1.5E10')
  })

  it('does not touch references inside quoted text', () => {
    expect(toR1C1('IF(A1="B2","C3",D4)', 0, 0)).toBe('IF(RC="B2","C3",R[3]C[3])')
  })

  it("translates a reference behind a 'sheet name' prefix", () => {
    expect(toR1C1("'My Sheet'!B2+Sheet1!A1", 1, 1)).toBe("'My Sheet'!RC+Sheet1!R[-1]C[-1]")
  })

  it('leaves an out-of-range reference as written', () => {
    expect(toR1C1('ZZZZ1', 0, 0)).toBe('ZZZZ1')
  })
})

describe('shiftFormula', () => {
  it('moves relative references and pins absolute ones', () => {
    expect(shiftFormula('A1+$B$2+C$3', 2, 1)).toBe('B3+$B$2+D$3')
  })

  it('returns the text untouched for a zero delta', () => {
    expect(shiftFormula('SUM(A1:B2)', 0, 0)).toBe('SUM(A1:B2)')
  })

  it('crosses the 26-column boundary correctly', () => {
    expect(shiftFormula('Z1', 0, 1)).toBe('AA1')
    expect(shiftFormula('AA1', 0, -1)).toBe('Z1')
  })

  it('reports a reference pushed off the sheet as #REF!', () => {
    expect(shiftFormula('A1', -5, 0)).toBe('#REF!')
    expect(shiftFormula('A1', 0, -1)).toBe('#REF!')
  })

  it('leaves quoted text untouched', () => {
    expect(shiftFormula('CONCAT("A1",A1)', 1, 0)).toBe('CONCAT("A1",A2)')
  })
})
