// A highlight on a row you cannot see is not feedback. This is the half of the
// new-row marker that is behaviour rather than CSS: locate the row, expand the
// section holding it, scroll it into view, and retire the mark on a timer.
//
// Pulled out of the panels so it is exercised without mounting either of them —
// the useBackdropClose pattern. jsdom has no layout, so scrollIntoView is spied
// rather than measured; the geometry is asserted in e2e/new-row-marker.spec.mjs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import {
  NEW_ROW_TTL_MS,
  useNewRowMarker
} from '../../../src/renderer/src/composables/useNewRowMarker'

let scope = null
let revealed = null

// One row in the document, addressable the way the composable addresses it.
function putRow(id) {
  document.body.innerHTML = `<li data-new-row="${id}"></li>`
  const el = document.querySelector(`[data-new-row="${id}"]`)
  el.scrollIntoView = vi.fn((opts) => (revealed = { id, opts }))
  return el
}

// Run the composable inside a scope, the way a component owns one, so
// onScopeDispose is reachable from a test.
function install(options) {
  scope = effectScope()
  return scope.run(() => useNewRowMarker(options))
}

beforeEach(() => {
  vi.useFakeTimers()
  revealed = null
  document.body.innerHTML = ''
})
afterEach(() => {
  scope?.stop()
  scope = null
  vi.useRealTimers()
})

const setup = (over = {}) => {
  const markedId = ref(null)
  const retire = vi.fn(() => (markedId.value = null))
  const onHidden = vi.fn()
  const open = vi.fn()
  install({
    markedId: () => markedId.value,
    locate: (id) => (id === 'visible' ? 'visible' : id === 'filtered' ? 'filtered' : 'elsewhere'),
    retire,
    onHidden,
    open,
    ...over
  })
  return { markedId, retire, onHidden, open }
}

describe('revealing the row', () => {
  it('scrolls a located row into view with block: nearest', async () => {
    const { markedId } = setup()
    putRow('visible')
    markedId.value = 'visible'
    await nextTick()
    await nextTick()
    // `nearest`, so a row already on screen does not jerk the list.
    expect(revealed).toEqual({ id: 'visible', opts: { block: 'nearest' } })
  })

  it('expands the section BEFORE looking for the row', async () => {
    const order = []
    const { markedId } = setup({
      open: () => {
        order.push('open')
        putRow('visible')
      }
    })
    markedId.value = 'visible'
    await nextTick()
    await nextTick()
    order.push('reveal')
    // A marker inside a collapsed section is invisible by construction.
    expect(order).toEqual(['open', 'reveal'])
    expect(revealed?.id).toBe('visible')
  })

  it('survives a marked id whose row never rendered', async () => {
    const { markedId, retire } = setup()
    markedId.value = 'visible'
    await nextTick()
    await nextTick()
    expect(revealed).toBeNull()
    // Still retires: a mark nothing drew must not leave the state key stuck.
    vi.advanceTimersByTime(NEW_ROW_TTL_MS)
    expect(retire).toHaveBeenCalledOnce()
  })
})

describe('a row the filter excludes', () => {
  it('says so instead of animating something off-list', async () => {
    const { markedId, onHidden, open } = setup()
    markedId.value = 'filtered'
    await nextTick()
    await nextTick()
    expect(onHidden).toHaveBeenCalledWith('filtered')
    // The user's filter is theirs; it is reported, never cleared for them.
    expect(open).not.toHaveBeenCalled()
    expect(revealed).toBeNull()
  })

  it('still retires on the timer', async () => {
    const { markedId, retire } = setup()
    markedId.value = 'filtered'
    await nextTick()
    vi.advanceTimersByTime(NEW_ROW_TTL_MS)
    expect(retire).toHaveBeenCalledOnce()
  })
})

describe('a row belonging to another section', () => {
  it('is left entirely alone — no reveal, no notice, no timer', async () => {
    const { markedId, onHidden, open, retire } = setup()
    markedId.value = 'other-section'
    await nextTick()
    await nextTick()
    expect(onHidden).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    vi.advanceTimersByTime(NEW_ROW_TTL_MS)
    // The section that owns it arms the timer; two panels must not double-retire.
    expect(retire).not.toHaveBeenCalled()
  })
})

describe('retiring', () => {
  it('retires after the TTL and not before', async () => {
    const { markedId, retire } = setup()
    putRow('visible')
    markedId.value = 'visible'
    await nextTick()
    vi.advanceTimersByTime(NEW_ROW_TTL_MS - 1)
    expect(retire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(retire).toHaveBeenCalledOnce()
  })

  it('restarts the clock when a second create replaces the id', async () => {
    const markedId = ref(null)
    const retire = vi.fn()
    install({
      markedId: () => markedId.value,
      locate: () => 'visible',
      retire,
      onHidden: vi.fn(),
      open: vi.fn()
    })
    putRow('first')
    markedId.value = 'first'
    await nextTick()
    vi.advanceTimersByTime(NEW_ROW_TTL_MS - 100)

    putRow('second')
    markedId.value = 'second'
    await nextTick()
    vi.advanceTimersByTime(200)
    // The first row's timer must not retire the second row's mark early.
    expect(retire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(NEW_ROW_TTL_MS)
    expect(retire).toHaveBeenCalledOnce()
  })

  it('drops its timer when the marker is cleared by an interaction', async () => {
    const { markedId, retire } = setup()
    putRow('visible')
    markedId.value = 'visible'
    await nextTick()
    markedId.value = null
    await nextTick()
    vi.advanceTimersByTime(NEW_ROW_TTL_MS * 2)
    expect(retire).not.toHaveBeenCalled()
  })

  it('drops its timer when the panel goes away', async () => {
    const { markedId, retire } = setup()
    putRow('visible')
    markedId.value = 'visible'
    await nextTick()
    scope.stop()
    vi.advanceTimersByTime(NEW_ROW_TTL_MS * 2)
    expect(retire).not.toHaveBeenCalled()
  })
})
