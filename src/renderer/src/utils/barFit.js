/**
 * Which items a horizontal bar has to fold away, given what each one measures.
 *
 * Pure arithmetic so the fold order is testable without a browser — the same
 * split railFit/useFittingCount already use. The caller measures; this decides.
 *
 * Items fold from the END of `order` backwards, so `order` is written
 * least-important first. A pinned id is never folded: at the widths this runs
 * at there is always room for the pinned set, and a bar whose primary action can
 * disappear into a menu is the bug, not the fix.
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
/**
 * The bar sheds in three rungs, never two: a labelled row first drops to icons
 * (every control still one press away), and only a row that does not fit even
 * as icons starts folding into the overflow menu.
 *
 * The compact width is not measured, it is `--control-h` — a `.btn-square` is
 * exactly that wide by definition. Measuring it would mean rendering the
 * compact row to find out whether to render it, and a control that is not drawn
 * measures 0.
 *
 * @param {object} opts
 * @param {Record<string, number>} opts.labelled measured width per id, labelled
 * @param {number} opts.compactWidth what any one control costs as an icon
 * @param {number} opts.available width the row has to fill
 * @param {string[]} opts.order fold order, least-important first
 * @param {string[]} [opts.pinned] ids that never fold
 * @param {number} [opts.trigger] width of the overflow control
 * @returns {{compact: boolean, folded: string[]}}
 */
export function barLayout({ labelled, compactWidth, available, order, pinned, trigger }) {
  const ids = Object.keys(labelled)
  const labelledTotal = ids.reduce((sum, id) => sum + labelled[id], 0)
  if (!(available > 0) || labelledTotal <= available) return { compact: false, folded: [] }

  const widths = Object.fromEntries(ids.map((id) => [id, compactWidth]))
  return { compact: true, folded: foldedIds({ widths, available, order, pinned, trigger }) }
}

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
