import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { TAG_ROW_PX, chipsThatFit, orderedTags, rowsThatFit } from '../utils/tagShelf'

// What the tag shelf shows at the depth it was dragged to. Chips are as wide as
// their names, so the number that fits is MEASURED, never assumed — which is
// what makes "+N more" exact and the drag land where the pointer left it.
//
// Widths are only knowable from a rendered chip, so a changed tag set renders
// every one of them for a single frame (useToolbarOverflow does the same). The
// shelf is clipped to its height, so that frame neither jumps nor scrolls.

const CHIP_GAP_PX = 4
// Stands in for a chip whose width is not known yet, and for the "+N more" chip
// before one has ever been drawn. Generous on purpose: guessing high shows one
// chip fewer for a frame, guessing low overflows the shelf.
const UNMEASURED_PX = 88

/**
 * Everything the packing needs off a shelf showing every one of its chips.
 * @param {HTMLElement} box
 */
function measureShelf(box) {
  const widths = new Map()
  const chips = box.querySelectorAll('.usb-tag')
  for (const chip of chips) {
    const width = Math.ceil(chip.getBoundingClientRect().width)
    if (width > 0 && chip.dataset.tag) widths.set(chip.dataset.tag, width)
  }
  // The RECT, not offsetHeight: a chip is 16.5px tall on a fractional scale, and
  // the rounded 17 is enough to claim a row the height cannot pay for.
  const chipHeight = chips[0]?.getBoundingClientRect().height ?? 0
  const more = box.querySelector('.usb-more')
  return {
    widths,
    rowStep: chipHeight > 0 ? chipHeight + CHIP_GAP_PX : TAG_ROW_PX,
    trigger: more ? Math.ceil(more.getBoundingClientRect().width) : UNMEASURED_PX,
    // Reads the whole content even though the box is clipped to a few rows.
    full: box.scrollHeight,
    width: box.clientWidth
  }
}

// Only a WIDTH change re-packs: the height moves because we moved it, and
// reacting to that is a loop.
function observeWidth(box, widthNow, onChange) {
  if (!box || typeof ResizeObserver !== 'function') return null
  let last = widthNow()
  const observer = new ResizeObserver(() => {
    const width = widthNow()
    if (width === last) return
    last = width
    onChange()
  })
  observer.observe(box)
  return observer
}

/**
 * @param {import('vue').Ref<HTMLElement|null>} el  the clipped chip box
 * @param {object} o
 * @param {import('vue').Ref<{name: string}[]>} o.all     every known tag
 * @param {import('vue').Ref<string[]>} o.active          the ones filtering
 * @param {import('vue').Ref<number>} o.height            the dragged depth, px
 */
// Selected tags lead the order, so they are the first to survive the cut — but
// the cut is still the cut. Overriding it put chips OUTSIDE a box that clips,
// where they were invisible and, being counted as shown, absent from the picker
// too: a filter you could neither see nor switch off.
function split(ordered, capacity) {
  const bar = computed(() => ordered.value.slice(0, capacity.value))
  const hidden = computed(() => ordered.value.slice(bar.value.length))
  return { bar, hidden, overflow: computed(() => hidden.value.length) }
}

export function useTagShelf(el, { all, active, height }) {
  const ordered = computed(() => orderedTags(all.value, active.value))
  // Infinity is the measuring pass: show everything, then cut to what fits.
  const capacity = ref(Infinity)
  // What the shelf would need to show every tag — the target of a double-click.
  const fullHeight = ref(0)
  let seen = { widths: new Map(), rowStep: TAG_ROW_PX, trigger: UNMEASURED_PX }
  // Published for the grip's aria-valuenow: the seam is a focusable separator,
  // so what it is set to has to be readable, not just visible.
  const rows = ref(1)

  function apply() {
    const box = el.value
    if (!box) return
    rows.value = rowsThatFit(height.value, seen.rowStep, CHIP_GAP_PX)
    capacity.value = chipsThatFit(
      ordered.value.map((t) => seen.widths.get(t.name) ?? UNMEASURED_PX),
      {
        available: box.clientWidth,
        gap: CHIP_GAP_PX,
        rows: rows.value,
        trigger: seen.trigger
      }
    )
  }

  async function remeasure() {
    capacity.value = Infinity
    await nextTick()
    if (!el.value) return
    seen = measureShelf(el.value)
    fullHeight.value = seen.full
    apply()
  }

  let observer = null
  watch(
    el,
    (box) => {
      observer?.disconnect()
      observer = observeWidth(box, () => el.value?.clientWidth, apply)
      if (box) remeasure()
    },
    { immediate: true, flush: 'post' }
  )
  watch(() => ordered.value.map((t) => t.name).join(' '), remeasure)
  watch(height, apply)
  onBeforeUnmount(() => observer?.disconnect())

  return { ...split(ordered, capacity), fullHeight, rows, remeasure }
}
