import { describe, expect, it } from 'vitest'
import { ago } from '../../../src/renderer/src/utils/relativeTime'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('ago', () => {
  const since = (ms) => ago(Date.now() - ms)

  it('collapses anything under a minute to "now"', () => {
    expect(since(0)).toBe('now')
    expect(since(59 * SECOND)).toBe('now')
  })

  it('steps up through the units at their boundaries', () => {
    expect(since(MINUTE)).toBe('1m')
    expect(since(59 * MINUTE)).toBe('59m')
    expect(since(HOUR)).toBe('1h')
    expect(since(23 * HOUR)).toBe('23h')
    expect(since(DAY)).toBe('1d')
    expect(since(6 * DAY)).toBe('6d')
    expect(since(7 * DAY)).toBe('1w')
    // Weeks run to 4; months take over at 35 days (5 weeks).
    expect(since(30 * DAY)).toBe('4w')
    expect(since(35 * DAY)).toBe('1mo')
    expect(since(365 * DAY)).toBe('1y')
  })

  it('never shows a future timestamp as negative', () => {
    expect(ago(Date.now() + 10 * MINUTE)).toBe('now')
  })
})
