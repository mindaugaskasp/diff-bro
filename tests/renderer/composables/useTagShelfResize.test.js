import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useTagShelfResize } from '../../../src/renderer/src/composables/useTagShelfResize'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import {
  DEFAULT_TAG_SHELF_PX,
  MAX_TAG_SHELF_PX
} from '../../../src/renderer/src/utils/tagShelf'

const CHIP_H = 22
const GAP = 4
const STEP = CHIP_H + GAP
const rowsHigh = (n) => n * STEP - GAP

// The shelf as the pointer sees it: a box as tall as the rows it is showing,
// holding chips of a known height. Both are read as RECTS — a chip is 16.5px
// tall on a fractional scale, and rounding that up claims rows the height
// cannot pay for.
const shelfShowing = (height) =>
  ref({
    querySelector: () => ({ getBoundingClientRect: () => ({ height: CHIP_H }) }),
    getBoundingClientRect: () => ({ height })
  })

const press = (resize, clientY = 100) => resize.start({ clientY, preventDefault: () => {} })
const moveTo = (clientY) => window.dispatchEvent(new MouseEvent('pointermove', { clientY }))
const release = () => window.dispatchEvent(new MouseEvent('pointerup'))
const key = (resize, k) => resize.onKeydown({ key: k, preventDefault: () => {} })

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

// The seam has to end up where the hand left it. Dragging one rendered row must
// deepen the shelf by one rendered row — the old chip-count model made that
// anything between half a row and two, which is what "clunky" was.
describe('useTagShelfResize — the drag', () => {
  it('follows the pointer 1:1, landing on whole rows', () => {
    const resize = useTagShelfResize(shelfShowing(rowsHigh(2)))
    const settings = useSettingsStore()
    expect(settings.tagShelfHeight).toBe(DEFAULT_TAG_SHELF_PX)

    press(resize)
    moveTo(100 + STEP)
    expect(settings.tagShelfHeight).toBe(rowsHigh(3))

    moveTo(100 + 5 * STEP)
    expect(settings.tagShelfHeight).toBe(rowsHigh(7))
    release()
    expect(resize.resizing.value).toBe(false)
  })

  it('quantises — a half-row wobble changes nothing', () => {
    const resize = useTagShelfResize(shelfShowing(rowsHigh(2)))
    const settings = useSettingsStore()
    press(resize)
    moveTo(100 + Math.floor(STEP / 2) - 2)
    expect(settings.tagShelfHeight).toBe(rowsHigh(2))
    release()
  })

  it('drags back up as well as down, never past one row', () => {
    const resize = useTagShelfResize(shelfShowing(rowsHigh(6)))
    const settings = useSettingsStore()
    press(resize, 400)
    moveTo(400 - 3 * STEP)
    expect(settings.tagShelfHeight).toBe(rowsHigh(3))

    moveTo(400 - 100 * STEP)
    expect(settings.tagShelfHeight).toBe(rowsHigh(1))
    release()
  })

  it('clamps at the ceiling however far the pointer goes', () => {
    const resize = useTagShelfResize(shelfShowing(rowsHigh(2)))
    press(resize)
    moveTo(100 + 500 * STEP)
    expect(useSettingsStore().tagShelfHeight).toBe(MAX_TAG_SHELF_PX)
    release()
  })

  // With everything on show the stored height can sit well past the last chip;
  // anchoring to it would leave the first inch of the drag doing nothing.
  it('starts from where the seam is, not from what was stored', () => {
    const settings = useSettingsStore()
    settings.setLimit('tagShelfHeight', rowsHigh(12))
    const resize = useTagShelfResize(shelfShowing(rowsHigh(2)))

    press(resize)
    moveTo(100 + STEP)
    expect(settings.tagShelfHeight).toBe(rowsHigh(3))
    release()
  })

  it('writes through setLimit, so the depth survives a session', () => {
    const resize = useTagShelfResize(shelfShowing(rowsHigh(2)))
    press(resize)
    moveTo(100 + 3 * STEP)
    release()

    setActivePinia(createPinia())
    expect(useSettingsStore().tagShelfHeight).toBe(rowsHigh(5))
  })

  it('a released drag stops following the pointer', () => {
    const resize = useTagShelfResize(shelfShowing(rowsHigh(2)))
    const settings = useSettingsStore()
    press(resize)
    release()
    moveTo(100 + 5 * STEP)
    expect(settings.tagShelfHeight).toBe(DEFAULT_TAG_SHELF_PX)
  })

  it('falls back to a sane row step when there is no chip to measure', () => {
    const resize = useTagShelfResize(ref(null))
    const settings = useSettingsStore()
    press(resize)
    moveTo(100 + 26)
    expect(settings.tagShelfHeight).toBeGreaterThan(DEFAULT_TAG_SHELF_PX)
    release()
  })
})

// Wide chips do not FILL the rows the stored height pays for, so the box hugs
// its chips and renders shorter than the setting. Anchoring a key press on what
// is rendered then computes every step from the wrong number: ↓ wrote a SMALLER
// depth than the stored one (63 → 58) and moved the seam not at all, and the ↑
// after it dropped two rows in one press.
describe('useTagShelfResize — a shelf whose chips do not fill it', () => {
  const partlyFilled = () =>
    useTagShelfResize(shelfShowing(rowsHigh(2)), { fullHeight: ref(rowsHigh(9)) })

  it('deepens by exactly one row from the STORED depth, never shallower', () => {
    const settings = useSettingsStore()
    settings.setLimit('tagShelfHeight', rowsHigh(3))

    key(partlyFilled(), 'ArrowDown')
    expect(settings.tagShelfHeight).toBe(rowsHigh(4))
  })

  it('↓ then ↑ leaves the depth exactly where it started', () => {
    const settings = useSettingsStore()
    settings.setLimit('tagShelfHeight', rowsHigh(3))

    key(partlyFilled(), 'ArrowDown')
    key(partlyFilled(), 'ArrowUp')
    expect(settings.tagShelfHeight).toBe(rowsHigh(3))
  })

  // Past the point where every tag is on show, more height buys nothing — and a
  // stored value that runs away from what is rendered is what broke the keys.
  it('never stores more depth than showing every tag would take', () => {
    const settings = useSettingsStore()
    settings.setLimit('tagShelfHeight', rowsHigh(9))
    key(useTagShelfResize(shelfShowing(rowsHigh(9)), { fullHeight: ref(rowsHigh(9)) }), 'ArrowDown')
    expect(settings.tagShelfHeight).toBe(rowsHigh(9))
  })
})

// A drag is not the only way to ask for a deeper shelf, and it was the only one
// there was: the seam carried no keyboard at all and nothing snapped.
describe('useTagShelfResize — snap and keys', () => {
  const withFull = (shownHeight, full) =>
    useTagShelfResize(shelfShowing(shownHeight), { fullHeight: ref(full) })

  it('double-click opens the shelf to everything, then rests it again', () => {
    const settings = useSettingsStore()
    const resize = withFull(rowsHigh(2), rowsHigh(9))
    resize.toggle()
    expect(settings.tagShelfHeight).toBe(rowsHigh(9))

    withFull(rowsHigh(9), rowsHigh(9)).toggle()
    expect(settings.tagShelfHeight).toBe(DEFAULT_TAG_SHELF_PX)
  })

  it('double-click rests a shelf that is already showing every tag', () => {
    const settings = useSettingsStore()
    settings.setLimit('tagShelfHeight', rowsHigh(6))
    withFull(rowsHigh(3), rowsHigh(3)).toggle()
    expect(settings.tagShelfHeight).toBe(DEFAULT_TAG_SHELF_PX)
  })

  // A row at a time from the STORED depth — what the key is writing — rather
  // than from whatever the chips happen to fill.
  it('↓ and ↑ move it a row at a time', () => {
    const settings = useSettingsStore()
    settings.setLimit('tagShelfHeight', rowsHigh(2))
    key(withFull(rowsHigh(2), 0), 'ArrowDown')
    expect(settings.tagShelfHeight).toBe(rowsHigh(3))

    key(withFull(rowsHigh(3), 0), 'ArrowUp')
    expect(settings.tagShelfHeight).toBe(rowsHigh(2))

    settings.setLimit('tagShelfHeight', rowsHigh(1))
    key(withFull(rowsHigh(1), 0), 'ArrowUp')
    expect(settings.tagShelfHeight).toBe(rowsHigh(1))
  })

  it('Home rests it and End opens it', () => {
    const settings = useSettingsStore()
    key(withFull(rowsHigh(8), rowsHigh(9)), 'Home')
    expect(settings.tagShelfHeight).toBe(DEFAULT_TAG_SHELF_PX)

    key(withFull(rowsHigh(2), rowsHigh(9)), 'End')
    expect(settings.tagShelfHeight).toBe(rowsHigh(9))
  })

  it('leaves every other key to whatever else wants it', () => {
    const settings = useSettingsStore()
    let defaulted = false
    withFull(rowsHigh(2), 0).onKeydown({ key: 'Tab', preventDefault: () => (defaulted = true) })
    expect(defaulted).toBe(false)
    expect(settings.tagShelfHeight).toBe(DEFAULT_TAG_SHELF_PX)
  })
})
