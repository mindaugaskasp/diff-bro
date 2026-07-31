import { describe, expect, it } from 'vitest'
import {
  nowEpoch,
  relativeTime,
  epochRows,
  pickToEpoch,
  nowLocalInput
} from '../../../src/renderer/src/utils/epoch'

describe('nowEpoch', () => {
  it('reads the clock in the chosen unit', () => {
    expect(nowEpoch('seconds', 1_700_000_000_000)).toBe('1700000000')
    expect(nowEpoch('millis', 1_700_000_000_000)).toBe('1700000000000')
  })
})

describe('relativeTime', () => {
  it('phrases future and past deltas, and collapses tiny ones', () => {
    expect(relativeTime(3 * 3_600_000)).toBe('in 3 hours')
    expect(relativeTime(-1 * 3_600_000)).toBe('1 hour ago')
    expect(relativeTime(-2 * 86_400_000)).toBe('2 days ago')
    expect(relativeTime(500)).toBe('just now')
  })
})

describe('epochRows', () => {
  const NOW = 1_700_003_600_000 // one hour after the value below

  it('returns ISO, Relative and Local rows for a seconds timestamp', () => {
    const rows = epochRows('1700000000', { unit: 'seconds' }, NOW)
    expect(rows.map((r) => r.key)).toEqual(['ISO 8601', 'Relative', 'Local'])
    expect(rows[0].value).toBe(new Date(1_700_000_000_000).toISOString())
    expect(rows[1].value).toBe('1 hour ago')
    expect(rows[2].value).not.toBe('')
  })

  it('reads a millis timestamp when the unit says so', () => {
    const rows = epochRows('1700000000000', { unit: 'millis' }, NOW)
    expect(rows[0].value).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('is empty for non-numeric input', () => {
    expect(epochRows('not a date', { unit: 'seconds' })).toEqual([])
    expect(epochRows('', { unit: 'seconds' })).toEqual([])
  })
})

describe('pickToEpoch', () => {
  it('reads the picked wall-clock as UTC (space or T separator)', () => {
    const expected = String(Math.floor(Date.parse('2025-07-30T13:00Z') / 1000))
    expect(pickToEpoch('2025-07-30T13:00', { unit: 'seconds', tz: 'UTC' })).toBe(expected)
    expect(pickToEpoch('2025-07-30 13:00', { unit: 'seconds', tz: 'UTC' })).toBe(expected)
  })

  it('returns millis when asked, and a UTC value that round-trips', () => {
    const ms = pickToEpoch('2025-07-30T13:00', { unit: 'millis', tz: 'UTC' })
    expect(Number(ms)).toBe(Date.parse('2025-07-30T13:00Z'))
  })

  it('is empty for no input or an unparseable value', () => {
    expect(pickToEpoch('', { tz: 'UTC' })).toBe('')
    expect(pickToEpoch('nonsense', { tz: 'UTC' })).toBe('')
  })
})

describe('nowLocalInput', () => {
  it('formats a datetime-local string from UTC parts that round-trips through pickToEpoch', () => {
    const at = new Date('2025-07-30T13:05:00Z')
    const s = nowLocalInput('UTC', at)
    expect(s).toBe('2025-07-30T13:05')
    expect(pickToEpoch(s, { unit: 'seconds', tz: 'UTC' })).toBe(
      String(Math.floor(at.getTime() / 1000))
    )
  })
})
