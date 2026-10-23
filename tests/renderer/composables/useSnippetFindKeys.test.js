import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useSnippetFindKeys } from '../../../src/renderer/src/composables/useSnippetFindKeys'

let stop
afterEach(() => stop?.())

function setup({ visible = true, editing = true } = {}) {
  const root = document.createElement('section')
  document.body.append(root)
  Object.defineProperty(root, 'offsetParent', { get: () => (visible ? document.body : null) })
  const openFind = vi.fn()
  stop = useSnippetFindKeys({ root: ref(root), editing: ref(editing), openFind, isMac: true })
  return { root, openFind }
}
const press = (target, init) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

describe('useSnippetFindKeys', () => {
  it('opens find with replace when focus is nowhere in particular', () => {
    const { openFind } = setup()
    press(document.body, { key: 'f', metaKey: true })
    expect(openFind).toHaveBeenCalledWith(true)
  })

  it('opens find only while viewing', () => {
    const { openFind } = setup({ editing: false })
    press(document.body, { key: 'f', metaKey: true })
    expect(openFind).toHaveBeenCalledWith(false)
  })

  it('stands down when this snippet is not the one on screen', () => {
    const { openFind } = setup({ visible: false })
    press(document.body, { key: 'f', metaKey: true })
    expect(openFind).not.toHaveBeenCalled()
  })

  it('leaves a key that started inside Monaco to Monaco', () => {
    const { root, openFind } = setup()
    const monaco = document.createElement('div')
    monaco.className = 'monaco-editor'
    root.append(monaco)
    press(monaco, { key: 'f', metaKey: true })
    expect(openFind).not.toHaveBeenCalled()
  })

  it('stays out of a dialog that owns the keyboard', () => {
    const { openFind } = setup()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    press(dialog, { key: 'f', metaKey: true })
    expect(openFind).not.toHaveBeenCalled()
    dialog.remove()
  })
})
