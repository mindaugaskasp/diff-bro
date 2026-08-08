// The sidebar's manual order. Pure: an entry's `order` is an integer, ascending
// and unique within its group, and a drop reindexes the whole group rather than
// squeezing a value between two neighbours — the lists are short, and an
// integer sequence stays readable in the store file where a fractional rank
// drifts into float precision.

// Below every placed entry, so anything the user has not arranged themselves
// leads its group — the newest-first feel the lists had before ordering existed.
export const NEW_ENTRY_ORDER = -1

/**
 * Every entry with an `order`, filling only what is missing. The migration is
 * invisible: an unordered list keeps the order it was displayed in.
 * @template {{ order?: number }} T
 * @param {T[]} entries in the order they are shown today
 * @returns {T[]}
 */
export const assignOrder = (entries) =>
  entries.map((entry, i) => (Number.isFinite(entry.order) ? entry : { ...entry, order: i }))

/**
 * `order` reset to 0…n-1 in the order given, closing any gap a deletion left.
 * @template {{ order?: number }} T
 * @param {T[]} entries
 * @returns {T[]}
 */
export const reindex = (entries) => entries.map((entry, order) => ({ ...entry, order }))

/**
 * One entry moved to the slot the pointer is over, renumbered.
 *
 * `to` is an index in the list BEFORE the move, so dragging down needs the
 * removal accounted for — without it the item lands one place short of where
 * it was dropped.
 * @template {{ order?: number }} T
 * @param {T[]} entries
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveWithin(entries, from, to) {
  if (from < 0 || from >= entries.length) return reindex(entries)
  const rest = entries.filter((_, i) => i !== from)
  const at = Math.max(0, Math.min(rest.length, to > from ? to - 1 : to))
  rest.splice(at, 0, entries[from])
  return reindex(rest)
}

const byOrder = (a, b) => a.order - b.order

/**
 * A group in the reader's order, numbering anything that predates ordering by
 * the order it was shown in — so the migration is invisible.
 * @template {{ order?: number }} T
 * @param {T[]} entries
 * @param {(a: T, b: T) => number} shownOrder the sort the list used before
 * @returns {T[]}
 */
export const orderedBy = (entries, shownOrder) =>
  assignOrder([...entries].sort(shownOrder)).sort(byOrder)

/**
 * A Pinia action that moves one row within its group. Both sidebar stores get
 * the same one: the arithmetic is identical and a second copy would drift.
 * @param {(state: object, group: string) => object[]|null} groupOf
 */
export const reorderAction = (groupOf) =>
  function reorder(group, from, to) {
    const list = groupOf(this, group)
    if (!list) return
    const moved = list[from]?.id ?? null
    const orders = new Map(moveWithin(list, from, to).map((e) => [e.id, e.order]))
    for (const entry of this.entries) {
      if (orders.has(entry.id)) entry.order = orders.get(entry.id)
    }
    this.persist()
    return moved
  }
