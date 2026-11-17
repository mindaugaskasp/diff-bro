import { describe, expect, it } from 'vitest'
import { countdownText } from '../../../src/renderer/src/utils/countdown'

describe('countdownText', () => {
  it.each([
    [120_000, '2:00'],
    [102_000, '1:42'],
    [9_100, '0:10'],
    [500, '0:01'],
    [0, '0:00'],
    [-5_000, '0:00']
  ])('%i ms left → %s', (left, text) => expect(countdownText(1000 + left, 1000)).toBe(text))
})
