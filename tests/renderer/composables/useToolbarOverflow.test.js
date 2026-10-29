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
    getPropertyValue: (p) => (p === '--control-h-sm' && controlH !== null ? `${controlH}px` : '')
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
const ICON_UNIT = CONTROL_H + GAP // 36 — what any unlabelled action costs

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
  { id: 'save', pinned: true, labelled: true },
  { id: 'share-current', pinned: true },
  { id: 'copy-diff', pinned: false },
  { id: 'export-image', pinned: false },
  { id: 'clear', pinned: false }
]
const ORDER = ['clear', 'export-image', 'copy-diff', 'toggle-paste']
// Drawn widths. Only Save's is read (60 + the 6px gap); every other action costs
// one icon unit whatever it measures, so the row costs 66 + 5 × 36 = 246.
const WIDTHS = {
  'toggle-paste': 30,
  save: 60,
  'share-current': 30,
  'copy-diff': 30,
  'export-image': 30,
  clear: 30
}
const ROW_TOTAL = 66 + 5 * ICON_UNIT

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
  it('folds nothing while the icons and the labelled primary fit', async () => {
    const api = start(bar({ available: ROW_TOTAL, actions: WIDTHS }))
    await nextTick()
    expect(api.folded.value).toEqual([])
  })

  it('charges an icon one unit whatever it measures, and the primary its width', async () => {
    // Labelled widths would cost 216; icons and Save cost 246, so 230 folds.
    const api = start(bar({ available: 230, actions: { ...WIDTHS, 'toggle-paste': 90 } }))
    await nextTick()
    // One fold leaves 210, plus the 36 trigger = 246 > 230; two leave 174 + 36.
    expect(api.folded.value).toEqual(['clear', 'export-image'])
  })

  it('charges the row for what is NOT an action', async () => {
    const roomy = start(bar({ available: ROW_TOTAL + 100, other: 100, actions: WIDTHS }))
    await nextTick()
    expect(roomy.folded.value).toEqual([])
    unmount()
    const api = start(bar({ available: ROW_TOTAL + 99, other: 100, actions: WIDTHS }))
    await nextTick()
    expect(api.folded.value).toEqual(['clear', 'export-image'])
  })

  it('never folds a pinned action, whatever the width', async () => {
    const api = start(bar({ available: 10, actions: WIDTHS }))
    await nextTick()
    expect(api.folded.value).toEqual(ORDER)
  })

  it('does not cascade when it measures again after folding', async () => {
    const refs = bar({ available: 230, actions: WIDTHS })
    const api = start(refs)
    await nextTick()
    const first = [...api.folded.value]
    applyFold(refs, first)
    api.measure()
    expect(api.folded.value).toEqual(first)
  })

  // The tabs scroll, so they give ground before an action folds into the menu.
  it('counts what the tab strip beside it can still give back', async () => {
    const refs = bar({ available: 200, actions: WIDTHS })
    const topbar = document.createElement('div')
    topbar.className = 'topbar'
    const tabs = sized(300)
    tabs.className = 'diff-tabs'
    STYLES.set(tabs, { minWidth: '90px', columnGap: '0px', getPropertyValue: () => '' })
    topbar.append(tabs, refs.host.value)
    document.body.append(topbar)

    const api = start(refs)
    await nextTick()
    // 246 into 200 folds on its own; the strip's 210 above its floor covers it.
    expect(api.folded.value).toEqual([])
  })

  it('re-measures the primary on a signature change, at an unchanged row width', async () => {
    const sig = ref('en')
    const refs = bar({ available: ROW_TOTAL, actions: WIDTHS })
    const api = start(refs, sig)
    await nextTick()
    expect(api.folded.value).toEqual([])

    // en-XA's "Save" is longer; the ROW does not change size, only its word.
    const save = refs.group.value.querySelector('[data-action="save"]')
    save.getBoundingClientRect = () => ({ width: 90 })
    sig.value = 'en-XA'
    await nextTick()
    await nextTick()
    expect(api.folded.value).toEqual(['clear', 'export-image'])
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
    const refs = bar({ available: 180, actions: WIDTHS })
    const api = start(refs)
    await nextTick()
    expect(api.folded.value).toEqual(['clear', 'export-image', 'copy-diff'])
  })
})
