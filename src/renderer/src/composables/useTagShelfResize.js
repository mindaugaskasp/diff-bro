import { onBeforeUnmount, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import {
  DEFAULT_TAG_SHELF_PX,
  MAX_TAG_SHELF_PX,
  MIN_TAG_SHELF_PX,
  TAG_ROW_PX,
  nearestRows,
  shelfHeight
} from '../utils/tagShelf'
import { clampNumber } from '../utils/settingsDefaults'

const CHIP_GAP_PX = 4

// The seam is a role="separator" and carried no keyboard at all, so the depth
// was reachable by pointer only. A Map, not an object: the key comes off an
// event, and `KEYS['constructor']` on a literal is a hit.
const shelfKeys = ({ deepen, shallow, rest, open }) => {
  const bound = new Map([
    ['ArrowDown', deepen],
    ['ArrowUp', shallow],
    ['Home', rest],
    ['End', open]
  ])
  return (e) => {
    const run = bound.get(e.key)
    if (!run) return
    e.preventDefault()
    run()
  }
}

/**
 * Everything that WRITES the depth, over one measured row step. Every route
 * lands on whole rows: the shelf fills the height with whatever fits, so a
 * part-row is a strip of dead space rather than half a chip.
 * @param {import('vue').Ref<HTMLElement|null>} shelf
 * @param {import('vue').Ref<number>} fullHeight  what holds every tag
 */
function depthWriter(shelf, fullHeight) {
  const settings = useSettingsStore()
  let step = TAG_ROW_PX

  function measureStep() {
    const chip = shelf?.value?.querySelector('.usb-tag')
    const height = chip?.getBoundingClientRect?.().height ?? 0
    step = height > 0 ? height + CHIP_GAP_PX : TAG_ROW_PX
  }
  // Two different anchors, and mixing them up is what broke the arrow keys.
  //
  // renderedHeight is where the seam IS. The box hugs its chips, so with wide
  // names it can be SHORTER than the stored depth — chips that do not fill the
  // rows the height pays for. A DRAG starts here, because the drag starts under
  // the hand.
  //
  // storedHeight is the number being written. Every discrete step — the keys,
  // the snap — counts from here, or a step lands on whatever the chips happened
  // to fill: ↓ wrote a shallower depth than it started from and moved nothing,
  // and the ↑ after it fell two rows.
  const renderedHeight = () =>
    Math.round(shelf?.value?.getBoundingClientRect?.().height) || settings.tagShelfHeight
  const storedHeight = () => settings.tagShelfHeight

  // Past the height that shows every tag, more depth buys nothing and is exactly
  // how the stored value ran away from what is rendered.
  const store = (px) => {
    const full = fullHeight.value ? snapped(fullHeight.value) : MAX_TAG_SHELF_PX
    settings.setLimit(
      'tagShelfHeight',
      clampNumber(Math.min(px, full), DEFAULT_TAG_SHELF_PX, MIN_TAG_SHELF_PX, MAX_TAG_SHELF_PX)
    )
  }
  const snapped = (px) => shelfHeight(nearestRows(px, step, CHIP_GAP_PX), step, CHIP_GAP_PX)
  const rows = (n) => shelfHeight(Math.max(1, n), step, CHIP_GAP_PX)

  function byRows(by) {
    measureStep()
    store(rows(nearestRows(storedHeight(), step, CHIP_GAP_PX) + by))
  }

  const rest = () => store(DEFAULT_TAG_SHELF_PX)

  // Out to whatever holds every tag. measureStep FIRST, like every other route:
  // snapping against the fallback step lands the shelf two rows off.
  function open() {
    measureStep()
    store(fullHeight.value ? snapped(fullHeight.value) : MAX_TAG_SHELF_PX)
  }

  // Double-click: out to everything, back to resting once it already is.
  function toggle() {
    measureStep()
    const full = fullHeight.value
    if (!full || storedHeight() >= snapped(full) - CHIP_GAP_PX) return rest()
    store(snapped(full))
  }

  return { measureStep, renderedHeight, store, snapped, byRows, toggle, open, rest }
}

/**
 * The tag shelf's depth: one stored height, written by a drag, a double-click
 * and the arrow keys. The seam follows the pointer 1:1 and lands on whole rows.
 * Listeners go on the WINDOW, the way useSidebarResize's do: the grip is 5px
 * tall and the drag moves it out from under the pointer.
 * @param {import('vue').Ref<HTMLElement|null>} shelf  the chip box, measured
 * @param {{ fullHeight?: import('vue').Ref<number> }} [o]  what holds every tag
 */
export function useTagShelfResize(shelf, { fullHeight = ref(0) } = {}) {
  const depth = depthWriter(shelf, fullHeight)
  const resizing = ref(false)
  let from = 0
  let startY = 0

  const drag = (e) => depth.store(depth.snapped(from + (e.clientY - startY)))

  function end() {
    if (!resizing.value) return
    resizing.value = false
    window.removeEventListener('pointermove', drag)
    window.removeEventListener('pointerup', end)
  }

  function start(e) {
    e.preventDefault?.()
    resizing.value = true
    depth.measureStep()
    from = depth.renderedHeight()
    startY = e.clientY
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', end)
  }

  onBeforeUnmount(end)
  return {
    resizing,
    start,
    toggle: depth.toggle,
    onKeydown: shelfKeys({
      deepen: () => depth.byRows(1),
      shallow: () => depth.byRows(-1),
      rest: depth.rest,
      open: depth.open
    })
  }
}
