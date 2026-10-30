import { ref } from 'vue'
import { ROW_COLORS, rowColorId } from '../utils/rowColor'

// The colour popover's keyboard: which target the cursor is on, and what each
// key does to it. Out of the .vue file because that is where interaction bugs
// hide — a menu whose arrow keys are written inline is a menu nothing exercises.
//
// Targets, in order: the six colours, None, then Secret.

const CLEAR_INDEX = ROW_COLORS.length
const SECRET_INDEX = CLEAR_INDEX + 1
const TARGETS = SECRET_INDEX + 1

// Index of the applied colour, or the clear target when there is none — so
// opening the menu puts the cursor on what the row already is.
const indexOf = (color) => {
  const id = rowColorId(color)
  const at = ROW_COLORS.findIndex((c) => c.id === id)
  return at === -1 ? CLEAR_INDEX : at
}

/**
 * @param {object} o
 * @param {() => string|null} o.current  the row's colour when the menu opened
 * @param {(color: string|null) => void} o.onPick  applies and closes
 * @param {() => void} o.onSecret  toggles Secret and closes
 * @param {() => void} o.onClose
 */
export function useRowColorMenu({ current, onPick, onSecret, onClose }) {
  const cursor = ref(indexOf(current()))
  const colorAt = (i) => (i === CLEAR_INDEX ? null : ROW_COLORS[i].id)

  const apply = () => (cursor.value === SECRET_INDEX ? onSecret() : onPick(colorAt(cursor.value)))

  const move = (by) => {
    cursor.value = (cursor.value + by + TARGETS) % TARGETS
  }

  const KEYS = new Map([
    ['ArrowRight', () => move(1)],
    ['ArrowLeft', () => move(-1)],
    ['ArrowDown', () => move(1)],
    ['ArrowUp', () => move(-1)],
    ['Home', () => (cursor.value = 0)],
    ['End', () => (cursor.value = SECRET_INDEX)],
    ['Enter', apply],
    [' ', apply],
    ['Escape', () => onClose()]
  ])

  function onKeydown(e) {
    const run = KEYS.get(e.key)
    if (!run) return
    // Escape would otherwise reach the dialog behind the sidebar, and the arrows
    // would step the row list underneath.
    e.preventDefault()
    e.stopPropagation()
    run()
  }

  return {
    cursor,
    clearIndex: CLEAR_INDEX,
    secretIndex: SECRET_INDEX,
    colors: ROW_COLORS,
    onKeydown,
    point: (i) => (cursor.value = i)
  }
}
