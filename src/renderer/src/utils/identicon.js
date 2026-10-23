// Recognition, never verification: the fingerprint itself is what gets checked.

const HEX = /[0-9a-f]/g
const HALF_COLUMNS = 3

/**
 * @param {string|null} fingerprint
 * @returns {boolean[]} 25 cells, row by row
 */
export function identiconCells(fingerprint) {
  const digits =
    String(fingerprint ?? '')
      .toLowerCase()
      .match(HEX) ?? []
  const bits = digits.flatMap((d) => [...parseInt(d, 16).toString(2).padStart(4, '0')])
  const bit = (i) => bits.length > 0 && bits[i % bits.length] === '1'
  const cells = []
  for (let row = 0; row < 5; row++) {
    const half = Array.from({ length: HALF_COLUMNS }, (_, col) => bit(row * HALF_COLUMNS + col))
    cells.push(...half, half[1], half[0])
  }
  const on = cells.filter(Boolean).length
  if (on === 0 || on === cells.length) cells[12] = !cells[12]
  return cells
}
