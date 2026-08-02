import { describe, expect, it } from 'vitest'
import {
  builtinFormat,
  displayText,
  formatKind,
  isTemporal,
  serialToDate
} from '../../../src/main/xlsx/numfmt'

describe('formatKind', () => {
  it('recognises dates, times and both together', () => {
    expect(formatKind('yyyy-mm-dd')).toBe('date')
    expect(formatKind('h:mm:ss')).toBe('time')
    expect(formatKind('[h]:mm:ss')).toBe('time')
    expect(formatKind('m/d/yy h:mm')).toBe('datetime')
  })

  it('recognises percentages and leaves plain numbers alone', () => {
    expect(formatKind('0.00%')).toBe('percent')
    expect(formatKind('#,##0.00')).toBe('other')
    expect(formatKind('General')).toBe('other')
    expect(formatKind('')).toBe('other')
  })

  // [Red] and "quoted" text carry letters that would otherwise read as tokens.
  it('ignores colour blocks and quoted literals', () => {
    expect(formatKind('#,##0;[Red]-#,##0')).toBe('other')
    expect(formatKind('0.0 "days"')).toBe('other')
    expect(formatKind('[$€-2]#,##0.00')).toBe('other')
  })
})

describe('serialToDate', () => {
  it('maps known serials to their calendar dates', () => {
    expect(serialToDate(1).toISOString().slice(0, 10)).toBe('1900-01-01')
    expect(serialToDate(25569).toISOString().slice(0, 10)).toBe('1970-01-01')
    expect(serialToDate(45870).toISOString().slice(0, 10)).toBe('2025-08-01')
  })

  // The 1900 system counts a 29th of February 1900 that never existed, so
  // everything below serial 61 sits a day off the naive epoch arithmetic.
  it('absorbs the 1900 leap-year bug either side of the boundary', () => {
    expect(serialToDate(59).toISOString().slice(0, 10)).toBe('1900-02-28')
    expect(serialToDate(61).toISOString().slice(0, 10)).toBe('1900-03-01')
  })

  it('counts from 1904 when the workbook says so', () => {
    expect(serialToDate(0, true).toISOString().slice(0, 10)).toBe('1904-01-01')
    expect(serialToDate(24107, true).toISOString().slice(0, 10)).toBe('1970-01-01')
  })
})

describe('displayText', () => {
  it('formats dates, times and datetimes', () => {
    expect(displayText(45870, 'yyyy-mm-dd')).toBe('2025-08-01')
    expect(displayText(45870.75, 'm/d/yy h:mm')).toBe('2025-08-01 18:00:00')
    expect(displayText(0.5, 'h:mm:ss')).toBe('12:00:00')
  })

  it('formats percentages to the decimals the code asks for', () => {
    expect(displayText(0.125, '0%')).toBe('13%')
    expect(displayText(0.125, '0.00%')).toBe('12.50%')
  })

  it('declines to override anything it has no better rendering for', () => {
    expect(displayText(1234.5, '#,##0.00')).toBeNull()
    expect(displayText('text', 'yyyy-mm-dd')).toBeNull()
    expect(displayText(Number.NaN, 'yyyy-mm-dd')).toBeNull()
    // Outside the representable serial range: better a number than a wrong date.
    expect(displayText(-5, 'yyyy-mm-dd')).toBeNull()
    expect(displayText(9e9, 'yyyy-mm-dd')).toBeNull()
  })
})

describe('isTemporal', () => {
  it('separates the formats whose number is a date serial from the rest', () => {
    expect(isTemporal('yyyy-mm-dd')).toBe(true)
    expect(isTemporal('h:mm:ss')).toBe(true)
    expect(isTemporal('m/d/yy h:mm')).toBe(true)
    expect(isTemporal('0.00%')).toBe(false)
    expect(isTemporal('#,##0.00')).toBe(false)
    expect(isTemporal('')).toBe(false)
  })
})

describe('builtinFormat', () => {
  it('knows the ids Excel never writes into styles.xml', () => {
    expect(builtinFormat(14)).toBe('mm-dd-yy')
    expect(builtinFormat(10)).toBe('0.00%')
    expect(builtinFormat(0)).toBe('')
    expect(builtinFormat(999)).toBe('')
  })
})
