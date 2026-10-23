import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useMonacoZoom } from '../../../src/renderer/src/composables/useMonacoZoom'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'

const fakeEditor = (fontSize) => ({
  getOption: () => ({ fontSize }),
  updateOptions: vi.fn()
})

beforeEach(() => setActivePinia(createPinia()))

describe('useMonacoZoom', () => {
  it('starts an editor at the zoom already in force', () => {
    useUiStore().zoomDiff(1)
    const editor = fakeEditor(12)
    useMonacoZoom().attach(editor)
    expect(editor.updateOptions).toHaveBeenLastCalledWith({ fontSize: 13 })
  })

  it('follows the shared level from the platform size it read', async () => {
    const editor = fakeEditor(14)
    useMonacoZoom().attach(editor)
    useUiStore().zoomDiff(1)
    await nextTick()
    expect(editor.updateOptions).toHaveBeenLastCalledWith({ fontSize: 15 })
  })

  it('reads the size from the side that shows it, for a diff editor', () => {
    const diff = { updateOptions: vi.fn() }
    useMonacoZoom().attach(diff, fakeEditor(12))
    expect(diff.updateOptions).toHaveBeenLastCalledWith({ fontSize: 12 })
  })

  it('stops touching an editor once detached', async () => {
    const editor = fakeEditor(12)
    const zoom = useMonacoZoom()
    zoom.attach(editor)
    zoom.detach()
    useUiStore().zoomDiff(1)
    await nextTick()
    expect(editor.updateOptions).toHaveBeenCalledTimes(1)
  })
})
