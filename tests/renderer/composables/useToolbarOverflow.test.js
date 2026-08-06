import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { useToolbarOverflow } from '../../../src/renderer/src/composables/useToolbarOverflow'

// The composable only runs inside a component; mount a render-less one, the way
// useCaptureRegion.test.js does.
function mountWith(setup) {
  const app = createApp({
    setup() {
      const out = setup()
      return () => h('div', out.marker ?? '')
    }
  })
  const el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  return () => {
    app.unmount()
    el.remove()
  }
}

// jsdom lays nothing out and resolves no custom property, so every measurement is
// stated explicitly — both the boxes and the two style values the composable
// reads off the size scale. That is the point: these tests fix the arithmetic's
// INPUTS, not a browser's opinion.
const STYLES = new WeakMap()
beforeAll(() => {
  const real = window.getComputedStyle.bind(window)
  vi.stubGlobal('getComputedStyle', (el, ...rest) => STYLES.get(el) ?? real(el, ...rest))
})

const styled = (el, { columnGap = 0, controlH = null }) => {
  STYLES.set(el, {
    columnGap: `${columnGap}px`,
    getPropertyValue: (p) => (p === '--control-h' && controlH !== null ? `${controlH}px` : '')
  })
  return el
}

const sized = (width) => {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ width })
  return el
}

const GAP = 6
const CONTROL_H = 30
export const COMPACT_UNIT = CONTROL_H + GAP // 36 — what any control costs as an icon

function bar({ available, other = 0, actions }) {
  const group = styled(sized(0), { columnGap: GAP, controlH: CONTROL_H })
  for (const [id, width] of Object.entries(actions)) {
    const child = sized(width)
    child.dataset.action = id
    group.append(child)
  }
  // The group measures the sum of whatever is still shown.
  const shown = () =>
    [...group.querySelectorAll('[data-action]')].reduce(
      (sum, c) => sum + c.getBoundingClientRect().width,
      0
    )
  group.getBoundingClientRect = () => ({ width: shown() })

  // columnGap 0 so `other` is exactly the whole non-action cost of the row.
  const host = styled(sized(0), { columnGap: 0 })
  Object.defineProperty(host, 'clientWidth', { get: () => available })
  Object.defineProperty(host, 'scrollWidth', { get: () => other + shown() })
  // A real sibling, not a subtraction: `other` is summed from the elements that
  // share the row (the View button, the divider), because scrollWidth never
  // reports less than clientWidth and so cannot be used to back it out.
  if (other) host.append(sized(other))
  host.append(group)
  document.body.append(host)

  return { host: ref(host), group: ref(group) }
}

// v-if removes a folded control; the DOM the next measurement sees has it gone.
const applyFold = (refs, folded) => {
  for (const id of folded) refs.group.value.querySelector(`[data-action="${id}"]`)?.remove()
}

const ROWS = [
  { id: 'toggle-paste', pinned: false },
  { id: 'save', pinned: true },
  { id: 'share-current', pinned: true },
  { id: 'copy-diff', pinned: false },
  { id: 'export-image', pinned: false },
  { id: 'clear', pinned: false }
]
const ORDER = ['clear', 'export-image', 'copy-diff', 'toggle-paste']
// Measured labelled widths. Each is charged the group's 6px gap as well, so the
// labelled row costs 340 and the same six controls cost 216 as icons.
const WIDTHS = {
  'toggle-paste': 90,
  save: 60,
  'share-current': 64,
  'copy-diff': 30,
  'export-image': 30,
  clear: 30
}
const LABELLED_TOTAL = 340
const COMPACT_TOTAL = 6 * COMPACT_UNIT // 216

let unmount = () => {}
afterEach(() => {
  unmount()
  document.body.innerHTML = ''
})

const start = (refs, sig = ref('a')) => {
  let api
  unmount = mountWith(() => {
    api = useToolbarOverflow(refs, {
      rows: () => ROWS,
      order: () => ORDER,
      signature: sig
    })
    return {}
  })
  return api
}

describe('useToolbarOverflow', () => {
  it('leaves the row labelled when it already fits', async () => {
    const refs = bar({ available: LABELLED_TOTAL + 20, actions: WIDTHS })
    const api = start(refs)
    await nextTick()
    expect(api.compact.value).toBe(false)
    expect(api.folded.value).toEqual([])
  })

  // The rung that keeps every control one press away: too narrow to spell them
  // out, wide enough to keep them all.
  it('drops to icons before it folds anything away', async () => {
    const refs = bar({ available: LABELLED_TOTAL - 40, actions: WIDTHS })
    const api = start(refs)
    await nextTick()
    expect(api.compact.value).toBe(true)
    expect(api.folded.value).toEqual([])
  })

  it('folds from the end of the order only once icons do not fit either', async () => {
    // 216 of icons into 150. Three folds leave 108, and the trigger costs 36
    // once anything has folded: 144 fits, 180 (two folds) does not.
    const refs = bar({ available: 150, actions: WIDTHS })
    const api = start(refs)
    await nextTick()
    expect(api.compact.value).toBe(true)
    expect(api.folded.value).toEqual(['clear', 'export-image', 'copy-diff'])
  })

  it('charges the row for what is NOT an action', async () => {
    // Wide enough for the labels on its own; not once the View button and the
    // divider are paid for.
    const roomy = bar({ available: LABELLED_TOTAL + 20, actions: WIDTHS })
    const roomyApi = start(roomy)
    await nextTick()
    expect(roomyApi.compact.value).toBe(false)
    unmount()

    const refs = bar({ available: LABELLED_TOTAL + 20, other: 120, actions: WIDTHS })
    const api = start(refs)
    await nextTick()
    expect(api.compact.value).toBe(true)
    expect(api.folded.value).toEqual([])
  })

  it('never folds a pinned action, whatever the width', async () => {
    const refs = bar({ available: 40, actions: WIDTHS })
    const api = start(refs)
    await nextTick()
    expect(api.folded.value).not.toContain('save')
    expect(api.folded.value).not.toContain('share-current')
  })

  // The cascade this composable exists to prevent: a folded control is removed
  // from the DOM and measures nothing, so a second pass that re-read the DOM
  // would see it as free, believe there is room, and keep folding — or lose the
  // width and never unfold. The cache is the fix.
  it('does not cascade when it measures again after folding', async () => {
    const refs = bar({ available: 150, actions: WIDTHS })
    const api = start(refs)
    await nextTick()
    const first = [...api.folded.value]
    applyFold(refs, first)

    api.measure()
    expect(api.folded.value).toEqual(first)
    api.measure()
    expect(api.folded.value).toEqual(first)
  })

  // The other half of the same invariant: a compact control MEASURES --control-h,
  // so a pass that re-read the DOM while compact would overwrite the labelled
  // widths and the row could never earn its words back.
  it('keeps the labelled widths while compact, so the row can grow back', async () => {
    let available = COMPACT_TOTAL + 10
    const group = styled(sized(0), { columnGap: GAP, controlH: CONTROL_H })
    for (const [id, width] of Object.entries(WIDTHS)) {
      const child = sized(width)
      child.dataset.action = id
      // Compact is what the DOM reports once the labels are gone.
      Object.defineProperty(child, 'compactNow', { writable: true, value: false })
      child.getBoundingClientRect = () => ({ width: child.compactNow ? CONTROL_H : width })
      group.append(child)
    }
    const host = styled(sized(0), { columnGap: 0 })
    Object.defineProperty(host, 'clientWidth', { get: () => available })
    host.append(group)
    document.body.append(host)

    const refs = { host: ref(host), group: ref(group) }
    const api = start(refs)
    await nextTick()
    expect(api.compact.value).toBe(true)
    for (const c of group.children) c.compactNow = true

    api.measure() // a resize while compact must not relearn the widths
    // Between the two totals: only a composable that still knows the row costs
    // 340 with its labels on stays compact here. One that has relearned 216 off
    // the icons believes it fits and spells out labels that do not.
    available = (COMPACT_TOTAL + LABELLED_TOTAL) / 2
    api.measure()
    expect(api.compact.value).toBe(true)

    available = LABELLED_TOTAL + 20
    api.measure()
    expect(api.compact.value).toBe(false) // and it can still grow back
  })

  // A language switch changes what every control MEASURES without changing the
  // size of the row it sits in, so no resize fires and only the signature watch
  // can notice. The first version of this test asserted the same fold answer
  // before and after, which a watcher that never runs also satisfies — it passed
  // with `watch(signature, remeasure)` deleted. It now widens the controls the
  // way a longer locale does, so the answer MUST move.
  it('re-measures on a signature change, at an unchanged row width', async () => {
    const sig = ref('en')
    const grow = new Map()
    const group = styled(sized(0), { columnGap: GAP, controlH: CONTROL_H })
    for (const [id, width] of Object.entries(WIDTHS)) {
      const child = sized(width)
      child.dataset.action = id
      child.getBoundingClientRect = () => ({ width: grow.get(id) ?? width })
      group.append(child)
    }
    let available = 250
    const host = styled(sized(0), { columnGap: 0 })
    Object.defineProperty(host, 'clientWidth', { get: () => available })
    host.append(group)
    document.body.append(host)

    const api = start({ host: ref(host), group: ref(group) }, sig)
    await nextTick()
    // 340 of labels into 250: compact, but every control still fits as an icon.
    expect(api.compact.value).toBe(true)
    expect(api.folded.value).toEqual([])

    // en-XA is ~40% longer. The ROW does not change size — only its contents do.
    for (const [id, w] of Object.entries(WIDTHS)) grow.set(id, Math.round(w * 1.4))
    sig.value = 'en-XA'
    await nextTick()
    await nextTick()

    // Compact already fitted, so the fold answer cannot move — what must move is
    // the LABELLED total the composable now knows, which is what lets the row
    // grow back correctly later. Prove it by giving it the room for English.
    available = LABELLED_TOTAL + 20
    api.measure()
    // Still compact: it re-measured, and the longer labels do NOT fit that width.
    expect(api.compact.value).toBe(true)
  })

  // jsdom has no ResizeObserver at all, so `delete globalThis.ResizeObserver`
  // was a no-op and the old test was a byte-for-byte duplicate of the fold case
  // — which also left the observer path unexercised. Stubbed here the way
  // useVirtualRows.test.js already does it.
  it('observes the row AND its non-action siblings, and disconnects on unmount', async () => {
    const observed = []
    let disconnected = 0
    globalThis.ResizeObserver = class {
      observe(el) {
        observed.push(el)
      }
      disconnect() {
        disconnected++
      }
    }
    try {
      const refs = bar({ available: 400, other: 120, actions: WIDTHS })
      start(refs)
      // onMounted awaits remeasure() before it attaches, so the observer lands
      // a microtask after the first paint.
      await nextTick()
      await nextTick()

      // The row itself, and the View button beside it — whose count chip changes
      // width on its own while `.options` (flex: 1) never moves.
      expect(observed).toContain(refs.host.value)
      expect(observed).toContain(refs.host.value.children[0])
      // NOT the action group: folding changes its width, and watching that loops.
      expect(observed).not.toContain(refs.group.value)

      unmount()
      unmount = () => {}
      expect(disconnected).toBe(1)
    } finally {
      delete globalThis.ResizeObserver
    }
  })

  it('still fits the row where there is no ResizeObserver at all', async () => {
    expect(globalThis.ResizeObserver).toBeUndefined() // jsdom ships none
    const refs = bar({ available: 150, actions: WIDTHS })
    const api = start(refs)
    await nextTick()
    expect(api.folded.value).toEqual(['clear', 'export-image', 'copy-diff'])
  })
})
