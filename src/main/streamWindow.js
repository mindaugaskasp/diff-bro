// Range policy for the streamed comparison's windowed reads. Pure, so the
// hostile-input cases are unit-testable without an Electron runtime.

// Rows one request may ask for. A viewport plus overscan is under a hundred;
// this leaves headroom without letting a buggy or hostile renderer ask main to
// allocate and decode an unbounded slab.
export const MAX_WINDOW_ROWS = 400

const isWholeNumber = (value) => Number.isInteger(value) && value >= 0

/**
 * Validate a request for lines [from, to) of one side.
 *
 * Out-of-range is REFUSED, not clamped: a clamp turns a renderer bug into a
 * silently wrong window, and this is the one call that decides which bytes of a
 * user's file get read.
 *
 * @param {unknown} payload            straight off the IPC boundary
 * @param {{ left: number, right: number }} counts  indexed lines per side
 * @returns {{ side: 'left'|'right', from: number, to: number } | { error: string }}
 */
export function validateWindow(payload, counts) {
  if (!payload || typeof payload !== 'object') return { error: 'bad-args' }
  const { side, from, to } = payload
  if (side !== 'left' && side !== 'right') return { error: 'bad-args' }
  if (!isWholeNumber(from) || !isWholeNumber(to)) return { error: 'bad-args' }
  if (to <= from) return { error: 'bad-range' }
  if (to - from > MAX_WINDOW_ROWS) return { error: 'bad-range' }
  if (to > counts[side]) return { error: 'bad-range' }
  return { side, from, to }
}
