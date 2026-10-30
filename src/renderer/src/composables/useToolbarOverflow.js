import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { foldedIds, iconBarWidths } from '../utils/barFit'

// Measures the toolbar's action row for utils/barFit. Every action is an icon
// one unit wide; only a labelled primary is measured, and it never folds, so it
// is always drawn when it is read.

const ELEMENT_WIDTH = (el) => Math.ceil(el.getBoundingClientRect().width)
const columnGap = (el) => parseFloat(getComputedStyle(el).columnGap) || 0

function measureLabelled(el, ids) {
  const gap = columnGap(el)
  const out = {}
  for (const id of ids) {
    const child = el.querySelector(`[data-action="${id}"]`)
    const w = child ? ELEMENT_WIDTH(child) : 0
    if (w > 0) out[id] = w + gap
  }
  return out
}

// A .btn-sm.btn-square is exactly --control-h-sm wide, so an icon and the overflow
// trigger cost the size scale rather than a measurement of something not drawn.
// A hidden-but-measurable ghost trigger was tried: it extended past the right
// edge and scrolled the document sideways by its own width, at every size.
function iconUnit(el) {
  const h = parseFloat(getComputedStyle(el).getPropertyValue('--control-h-sm')) || 0
  return h + columnGap(el)
}

// What the row spends on everything that is NOT an action — the View button,
// the divider, and the gaps between all of them.
//
// Summed from the siblings, NOT from `scrollWidth - group`: scrollWidth never
// reports less than clientWidth, so on a row with space to spare that
// subtraction returns the group's own width and the budget becomes "whatever
// is currently shown". Everything then folds at any width, because folding
// one control is what makes the next one not fit.
// Watches the row AND its non-action siblings. `available` is clientWidth minus
// what those siblings cost, and one of them — the View button — changes width on
// its own: its count chip appears the moment an option leaves its default, which
// is the state a grid or diagram comparison OPENS in. `.options` is `flex: 1`, so
// its own box never moves when a sibling grows, and the row would go on believing
// it had ~28px it no longer has. The action group is deliberately NOT observed:
// folding changes its width, and watching that is a feedback loop.
function observeRow(options, el, onResize) {
  if (typeof ResizeObserver !== 'function' || !options) return null
  const observer = new ResizeObserver(onResize)
  observer.observe(options)
  for (const kid of options.children) if (kid !== el) observer.observe(kid)
  const tabs = options.closest('.topbar')?.querySelector('.diff-tabs')
  if (tabs) observer.observe(tabs)
  return observer
}

// What the tab strip beside the bar can still give back before it hits its floor.
function reclaimable(options) {
  const tabs = options.closest('.topbar')?.querySelector('.diff-tabs')
  if (!tabs) return 0
  const floor = parseFloat(getComputedStyle(tabs).minWidth) || 0
  return Math.max(0, ELEMENT_WIDTH(tabs) - floor)
}

function otherWidth(options, el) {
  const kids = [...options.children]
  const gap = columnGap(options)
  const sum = kids.filter((k) => k !== el).reduce((t, k) => t + ELEMENT_WIDTH(k), 0)
  return sum + gap * Math.max(0, kids.length - 1)
}

/**
 * @param {object} refs
 * @param {import('vue').Ref<HTMLElement|null>} refs.host the scrolling row
 *   (`.options`) — its clientWidth is the budget
 * @param {import('vue').Ref<HTMLElement|null>} refs.group the action group
 *   inside it, whose children carry `data-action`
 * @param {object} opts
 * @param {() => {id: string, pinned: boolean, labelled?: boolean}[]} opts.rows current actions
 * @param {() => string[]} opts.order fold order, least important first
 * @param {() => string} opts.signature changes when a re-measure is required
 */
export function useToolbarOverflow({ host, group }, { rows, order, signature }) {
  const folded = ref([])

  function measure() {
    const options = host.value
    const el = group.value
    if (!options || !el) return
    const current = rows()
    const unit = iconUnit(el)
    const labelled = measureLabelled(
      el,
      current.filter((r) => r.labelled).map((r) => r.id)
    )
    folded.value = foldedIds({
      widths: iconBarWidths({ ids: current.map((r) => r.id), unit, labelled }),
      available: options.clientWidth - otherWidth(options, el) + reclaimable(options),
      order: order(),
      pinned: current.filter((r) => r.pinned).map((r) => r.id),
      trigger: unit
    })
  }

  async function remeasure() {
    folded.value = []
    await nextTick()
    measure()
  }

  let observer = null
  let gone = false
  onMounted(async () => {
    await remeasure()
    // remeasure() awaits a tick, so the component can be gone by the time it
    // returns — an observer attached after that would never be disconnected.
    if (!gone) observer = observeRow(host.value, group.value, measure)
  })
  onBeforeUnmount(() => {
    gone = true
    observer?.disconnect()
  })
  watch(signature, remeasure)

  return { folded, measure, remeasure }
}
