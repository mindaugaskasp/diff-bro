import { describe, expect, it } from 'vitest'
import {
  HISTORY_MIN,
  HISTORY_W,
  clampHistoryWidth,
  readHistoryWidth
} from '../../../src/renderer/src/utils/historyWidth'

describe('clampHistoryWidth', () => {
  it('keeps a width inside the floor and 60% of the space', () => {
    expect(clampHistoryWidth(200, 1000)).toBe(HISTORY_MIN)
    expect(clampHistoryWidth(500, 1000)).toBe(500)
    expect(clampHistoryWidth(900, 1000)).toBe(600)
  })

  it('never goes under the floor, even when 60% of a narrow window is less', () => {
    expect(clampHistoryWidth(400, 400)).toBe(HISTORY_MIN)
  })

  it('falls back to the default for garbage', () => {
    expect(clampHistoryWidth('wide', 1000)).toBe(HISTORY_W)
  })
})

describe('readHistoryWidth', () => {
  it('reads a stored width', () => expect(readHistoryWidth('{"width":500}')).toBe(500))
  it('defaults with nothing stored', () => expect(readHistoryWidth(null)).toBe(HISTORY_W))
  it('defaults on a corrupt file', () => expect(readHistoryWidth('{ nope')).toBe(HISTORY_W))
  it('floors a hand-edited sliver', () => expect(readHistoryWidth('{"width":5}')).toBe(HISTORY_MIN))
})
