/**
 * How many leading chips fit a row that ends in a fixed tail (the add pill),
 * keeping room for a "+N" chip when any are folded.
 * @param {{ widths: number[], room: number, gap: number, tail: number, more: number }} m
 */
export function fittingCount({ widths, room, gap, tail, more }) {
  const span = (n) => widths.slice(0, n).reduce((sum, w) => sum + w + gap, 0)
  if (span(widths.length) + tail <= room) return widths.length
  let n = widths.length - 1
  while (n > 0 && span(n) + more + gap + tail > room) n--
  return n
}
