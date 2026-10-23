import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorText } from '../../../src/renderer/src/composables/useEditorText'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'
import { useEditorFontStore } from '../../../src/renderer/src/stores/editorFontStore'

const fakeEditor = (fontSize) => ({
  getOption: () => ({ fontSize }),
  updateOptions: vi.fn()
})
const last = (editor) => editor.updateOptions.mock.calls.at(-1)[0]

beforeEach(() => {
  localStorage.clear()
  window.api = {}
  setActivePinia(createPinia())
})

describe('useEditorText: size', () => {
  it('starts an editor at the zoom already in force', () => {
    useUiStore().zoomDiff(1)
    const editor = fakeEditor(12)
    useEditorText().attach(editor)
    expect(last(editor).fontSize).toBe(13)
  })

  it('follows the shared level from the platform size it read', async () => {
    const editor = fakeEditor(14)
    useEditorText().attach(editor)
    useUiStore().zoomDiff(1)
    await nextTick()
    expect(last(editor).fontSize).toBe(15)
  })

  it('reads the size from the side that shows it, for a diff editor', () => {
    const diff = { updateOptions: vi.fn() }
    useEditorText().attach(diff, fakeEditor(12))
    expect(last(diff).fontSize).toBe(12)
  })

  it('scales a fixed base without rounding it away', () => {
    const editor = fakeEditor(99)
    useEditorText({ basePx: 12.5 }).attach(editor)
    expect(last(editor).fontSize).toBe(12.5)
  })

  it('stops touching an editor once detached', async () => {
    const editor = fakeEditor(12)
    const text = useEditorText()
    text.attach(editor)
    text.detach()
    useUiStore().zoomDiff(1)
    await nextTick()
    expect(editor.updateOptions).toHaveBeenCalledTimes(1)
  })
})

describe('useEditorText: face', () => {
  it('leaves Monaco its own face by default', () => {
    const editor = fakeEditor(12)
    useEditorText().attach(editor)
    expect(last(editor)).not.toHaveProperty('fontFamily')
  })

  it('applies the chosen face, and follows a change', async () => {
    useEditorFontStore().setFamily('Menlo')
    const editor = fakeEditor(12)
    useEditorText().attach(editor)
    expect(last(editor).fontFamily).toBe('"Menlo", monospace')
    useEditorFontStore().setFamily('Courier New')
    await nextTick()
    expect(last(editor).fontFamily).toBe('"Courier New", monospace')
  })

  it('goes back to the default face when the choice is cleared', async () => {
    useEditorFontStore().setFamily('Menlo')
    const editor = fakeEditor(12)
    useEditorText().attach(editor)
    useEditorFontStore().setFamily('')
    await nextTick()
    expect(last(editor).fontFamily).toBe('DEFAULT_FACE')
  })
})
