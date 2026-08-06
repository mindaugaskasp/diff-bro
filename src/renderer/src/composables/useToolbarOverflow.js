import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { barLayout } from '../utils/barFit'

// Measures the toolbar's action row for the rungs utils/barFit decides between.
//
// Widths are cached per id and read ONLY while the row is labelled: a folded
// control measures 0 and a compact one measures --control-h, and either would
// overwrite the labelled width the row needs in order to grow back. The cache is
// dropped when the row set or its words change, and that pass re-measures from a
// fully-shown labelled row.

const ELEMENT_WIDTH = (el) => Math.ceil(el.getBoundingClientRect().width)
const columnGap = (el) => parseFloat(getComputedStyle(el).columnGap) || 0

// Every width here INCLUDES the gap that follows it, so the row's controls and
// its overflow trigger are all counted in the same units.
function measureLabelled(el, widths) {
  const gap = columnGap(el)
  for (const child of el.querySelectorAll('[data-action]')) {
    const w = ELEMENT_WIDTH(child)
    // 0 means folded away, not "fits in nothing" — keep what we knew.
    if (w > 0) widths.set(child.dataset.action, w + gap)
  }
}

// A .btn-square is exactly --control-h wide, so the compact row and the overflow
// trigger cost the size scale rather than a measurement of something not drawn.
// A hidden-but-measurable ghost trigger was tried: it extended past the right
// edge and scrolled the document sideways by its own width, at every size.
function compactUnit(el) {
  const h = parseFloat(getComputedStyle(el).getPropertyValue('--control-h')) || 0
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
 * @param {() => {id: string, pinned: boolean}[]} opts.rows current actions
 * @param {() => string[]} opts.order fold order, least important first
 * @param {() => string} opts.signature changes when a re-measure is required
 */
export function useToolbarOverflow({ host, group }, { rows, order, signature }) {
  const folded = ref([])
  const compact = ref(false)
  const widths = new Map()

  function apply() {
    const options = host.value
    const el = group.value
    if (!options || !el) return
    const current = rows()
    const labelled = Object.fromEntries(
      current.map((r) => [r.id, widths.get(r.id) ?? 0]).filter(([, w]) => w > 0)
    )
    const unit = compactUnit(el)
    const next = barLayout({
      labelled,
      compactWidth: unit,
      available: options.clientWidth - otherWidth(options, el),
      order: order(),
      pinned: current.filter((r) => r.pinned).map((r) => r.id),
      trigger: unit
    })
    compact.value = next.compact
    folded.value = next.folded
  }

  function measure() {
    if (group.value && !compact.value) measureLabelled(group.value, widths)
    apply()
  }

  // A changed row set invalidates every cached width: unfold, spell the labels
  // back out, let it paint, then measure the truth.
  async function remeasure() {
    widths.clear()
    folded.value = []
    compact.value = false
    await nextTick()
    measure()
  }

  let observer = null
  onMounted(async () => {
    await remeasure()
    if (typeof ResizeObserver !== 'function') return
    observer = new ResizeObserver(measure)
    if (host.value) observer.observe(host.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  watch(signature, remeasure)

  return { folded, compact, measure, remeasure }
}
