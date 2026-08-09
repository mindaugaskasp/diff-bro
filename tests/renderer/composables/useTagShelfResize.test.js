import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useTagShelfResize } from '../../../src/renderer/src/composables/useTagShelfResize'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { MAX_TAG_ROWS, MIN_TAG_ROWS } from '../../../src/renderer/src/utils/settingsDefaults'

const CHIP_H = 22
const shelfWithChip = () => ref({ querySelector: () => ({ offsetHeight: CHIP_H }) })

const press = (resize, clientY = 100) => resize.start({ clientY, preventDefault: () => {} })
const moveTo = (clientY) => window.dispatchEvent(new MouseEvent('pointermove', { clientY }))
const release = () => window.dispatchEvent(new MouseEvent('pointerup'))

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('useTagShelfResize', () => {
  it('dragging down one row-height deepens the shelf by one row', () => {
    const resize = useTagShelfResize(shelfWithChip())
    const settings = useSettingsStore()
    expect(settings.tagShelfRows).toBe(MIN_TAG_ROWS)

    press(resize)
    moveTo(100 + CHIP_H + 4)
    expect(settings.tagShelfRows).toBe(MIN_TAG_ROWS + 1)
    release()
    expect(resize.resizing.value).toBe(false)
  })

  it('quantises to whole rows — a half-row wobble changes nothing', () => {
    const resize = useTagShelfResize(shelfWithChip())
    const settings = useSettingsStore()
    press(resize)
    moveTo(100 + Math.floor(CHIP_H / 2) - 2)
    expect(settings.tagShelfRows).toBe(MIN_TAG_ROWS)
    release()
  })

  it('clamps to the floor and the cap however far the pointer goes', () => {
    const resize = useTagShelfResize(shelfWithChip())
    const settings = useSettingsStore()
    press(resize)
    moveTo(100 + 100 * CHIP_H)
    expect(settings.tagShelfRows).toBe(MAX_TAG_ROWS)
    release()

    press(resize, 400)
    moveTo(400 - 100 * CHIP_H)
    expect(settings.tagShelfRows).toBe(MIN_TAG_ROWS)
    release()
  })

  it('writes through setLimit, so the dragged depth persists across sessions', () => {
    const resize = useTagShelfResize(shelfWithChip())
    press(resize)
    moveTo(100 + 3 * (CHIP_H + 4))
    release()

    setActivePinia(createPinia())
    expect(useSettingsStore().tagShelfRows).toBe(MIN_TAG_ROWS + 3)
  })

  it('a released drag stops following the pointer', () => {
    const resize = useTagShelfResize(shelfWithChip())
    const settings = useSettingsStore()
    press(resize)
    release()
    moveTo(100 + 5 * CHIP_H)
    expect(settings.tagShelfRows).toBe(MIN_TAG_ROWS)
  })

  it('falls back to a sane row step when the shelf has no chip to measure', () => {
    const resize = useTagShelfResize(ref(null))
    const settings = useSettingsStore()
    press(resize)
    moveTo(100 + 26)
    expect(settings.tagShelfRows).toBe(MIN_TAG_ROWS + 1)
    release()
  })
})
