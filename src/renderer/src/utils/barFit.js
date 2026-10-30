/**
 * Which items a horizontal bar has to fold away, given what each one measures.
 *
 * Pure arithmetic so the fold order is testable without a browser — the same
 * split railFit/useFittingCount already use. The caller measures; this decides.
 *
 * Items fold from the FRONT of `order`, which is written least-important first.
 * A pinned id is never folded: at the widths this runs at there is always room
 * for the pinned set, and a bar whose primary action can disappear into a menu
 * is the bug, not the fix.
 */

/**
 * @param {object} opts
 * @param {Record<string, number>} opts.widths measured width per id, gap included
 * @param {number} opts.available width the row has to fill
 * @param {string[]} opts.order fold order, least-important first
 * @param {string[]} [opts.pinned] ids that never fold
 * @param {number} [opts.trigger] width of the overflow control, counted only
 *   once something has folded — an empty menu takes no space because it is not
 *   drawn
 * @returns {string[]} ids to fold, in `order`
 */
export function foldedIds({ widths, available, order, pinned = [], trigger = 0 }) {
  const total = (ids) => ids.reduce((sum, id) => sum + (widths[id] ?? 0), 0)
  const all = Object.keys(widths)
  if (!(available > 0) || total(all) <= available) return []

  const foldable = order.filter((id) => !pinned.includes(id) && id in widths)
  const folded = []
  let shown = total(all)
  for (const id of foldable) {
    // The trigger appears with the first fold and stays, so it is part of the
    // budget from that moment on — omit it and the last fold lands one control
    // short and the bar overflows by exactly the trigger's width.
    if (shown + trigger <= available) break
    folded.push(id)
    shown -= widths[id]
  }
  return folded
}

/**
 * What each action costs in the bar. Every action is an icon, a `.btn-square`
 * exactly one `unit` wide, so it is never measured; only a labelled primary is.
 * An unmeasured primary costs a unit until its first measurement.
 *
 * @param {object} opts
 * @param {string[]} opts.ids actions in the row
 * @param {number} opts.unit one icon control plus its gap
 * @param {Record<string, number>} opts.labelled measured width of labelled ids
 * @returns {Record<string, number>}
 */
export function iconBarWidths({ ids, unit, labelled }) {
  return Object.fromEntries(ids.map((id) => [id, labelled[id] ?? unit]))
}
