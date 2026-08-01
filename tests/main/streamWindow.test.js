import { describe, it, expect } from 'vitest'
import { MAX_WINDOW_ROWS, validateWindow } from '../../src/main/streamWindow'

const counts = { left: 1000, right: 500 }
const ask = (payload) => validateWindow(payload, counts)

describe('validateWindow', () => {
  it('accepts an ordinary window', () => {
    expect(ask({ side: 'left', from: 10, to: 90 })).toEqual({ side: 'left', from: 10, to: 90 })
  })

  it('bounds each side by its OWN line count', () => {
    expect(ask({ side: 'left', from: 900, to: 1000 })).toMatchObject({ to: 1000 })
    expect(ask({ side: 'right', from: 400, to: 501 })).toEqual({ error: 'bad-range' })
  })

  it.each([null, undefined, 'string', 42, []])('refuses a non-object payload (%s)', (payload) => {
    expect(ask(payload).error).toBeTruthy()
  })

  it('refuses an unknown side rather than defaulting to one', () => {
    expect(ask({ side: 'middle', from: 0, to: 5 })).toEqual({ error: 'bad-args' })
    expect(ask({ side: '__proto__', from: 0, to: 5 })).toEqual({ error: 'bad-args' })
    expect(ask({ from: 0, to: 5 })).toEqual({ error: 'bad-args' })
  })

  it.each([
    ['negative start', { side: 'left', from: -1, to: 5 }],
    ['fractional bound', { side: 'left', from: 0.5, to: 5 }],
    ['NaN', { side: 'left', from: NaN, to: 5 }],
    ['Infinity', { side: 'left', from: 0, to: Infinity }],
    ['numeric string', { side: 'left', from: '0', to: '5' }],
    ['missing bounds', { side: 'left' }]
  ])('refuses %s', (_label, payload) => {
    expect(ask(payload)).toEqual({ error: 'bad-args' })
  })

  it('refuses an empty or inverted range', () => {
    expect(ask({ side: 'left', from: 5, to: 5 })).toEqual({ error: 'bad-range' })
    expect(ask({ side: 'left', from: 9, to: 4 })).toEqual({ error: 'bad-range' })
  })

  // The ceiling is the point: a renderer must not be able to ask main to
  // allocate and decode an unbounded slab.
  it('refuses a window wider than the ceiling', () => {
    expect(ask({ side: 'left', from: 0, to: MAX_WINDOW_ROWS })).toMatchObject({ from: 0 })
    expect(ask({ side: 'left', from: 0, to: MAX_WINDOW_ROWS + 1 })).toEqual({ error: 'bad-range' })
  })

  it('refuses a window past the end rather than clamping it', () => {
    expect(ask({ side: 'left', from: 995, to: 1005 })).toEqual({ error: 'bad-range' })
  })

  it('refuses every side of a zero-line index', () => {
    expect(validateWindow({ side: 'left', from: 0, to: 1 }, { left: 0, right: 0 })).toEqual({
      error: 'bad-range'
    })
  })
})
