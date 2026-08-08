import { computed, inject, provide, ref } from 'vue'

// Dragging a sidebar row onto another to rearrange it. Pulled out of the SFCs
// because the interesting part is the state BETWEEN events — which group the
// drag started in, and which half of the row the pointer is in — and four
// lists share it.
//
// Its own MIME type: a row is already a drag source for "drop into the pane to
// compare", and without a second type a reorder released over the pane would
// open the comparison instead.
export const REORDER_DRAG_TYPE = 'application/x-diffbro-reorder'

// The drop line, and the row being carried — the rest of the list dims against
// it so the one in flight reads against its next position.
const rowClasses = (half, dragging) =>
  [half && `drop-${half}`, dragging && 'is-dragging'].filter(Boolean).join(' ')

const halfUnder = (e) => {
  const rect = e.currentTarget?.getBoundingClientRect?.()
  if (!rect) return 'above'
  return e.clientY - rect.top < rect.height / 2 ? 'above' : 'below'
}

/**
 * @param {{ commit: (group: string, from: number, to: number) => void }} o
 * @returns {object}
 */
export function useRowReorder({ commit }) {
  const source = ref(null)
  const target = ref(null)
  const isReordering = computed(() => !!source.value)

  const clear = () => {
    source.value = null
    target.value = null
  }

  function onDragStart(e, row) {
    source.value = row
    // effectAllowed belongs to the row (setRowDragPayload) — this drag is two
    // gestures, and a second writer here is what set it to 'copy' alone.
    e.dataTransfer?.setData(REORDER_DRAG_TYPE, `${row.group}:${row.index}`)
  }

  // Only inside the group the drag started in: each group renders as its own
  // list, so confining the drag to it IS the "never above a favourite" rule.
  const isOwnGroup = (row) => !!source.value && source.value.group === row.group

  function onDragOver(e, row) {
    if (!isOwnGroup(row)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    target.value = { ...row, half: halfUnder(e) }
  }

  function onDrop(e, row) {
    if (!isOwnGroup(row)) return clear()
    e.preventDefault()
    const { group, index: from } = source.value
    const to = row.index + (halfUnder(e) === 'below' ? 1 : 0)
    // A row dropped onto itself, or into the gap directly below it, has not
    // moved — reindexing anyway would rewrite the store for nothing.
    if (to !== from && to !== from + 1) commit(group, from, to)
    clear()
  }

  const markerFor = (group, index) =>
    target.value?.group === group && target.value.index === index && source.value?.index !== index
      ? target.value.half
      : ''

  const isSource = (group, index) => source.value?.group === group && source.value.index === index
  const api = { onDragStart, onDragOver, onDrop, onDragEnd: clear, markerFor, isReordering }
  // One bundle per row: three separate attributes on four call sites is three
  // chances to wire two of them.
  return {
    ...api,
    handlersFor: (group, index) => ({
      dragover: (e) => onDragOver(e, { group, index }),
      drop: (e) => onDrop(e, { group, index }),
      dragend: clear
    }),
    classFor: (group, index) => rowClasses(markerFor(group, index), isSource(group, index))
  }
}

const KEY = Symbol('rowReorder')

// A list that can be rearranged provides; its rows inject. Passing four
// handlers plus an index down through props would double the row's public
// surface for a gesture the row does not own.
export function provideRowReorder(commit) {
  const reorder = useRowReorder({ commit })
  provide(KEY, reorder)
  return reorder
}

// A row rendered outside a reorderable list (a test mount, the launcher) gets
// handlers that do nothing rather than having to know whether it is in one.
const INERT = {
  onDragStart: () => {},
  handlersFor: () => ({}),
  classFor: () => '',
  markerFor: () => ''
}

export const injectRowReorder = () => inject(KEY, INERT)
