import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { presentationKeydown } from '../../../src/renderer/src/composables/usePresentationKeys'

// Escape is the only way out of a mode that hides every control offering one.
let exit
let presenting

const key = (k, over = {}) => ({ key: k, preventDefault: vi.fn(), target: null, ...over })

beforeEach(() => {
  exit = vi.fn()
  presenting = ref(true)
})

const handle = (event) => presentationKeydown(event, { presenting, exit })

describe('presentationKeydown', () => {
  it('leaves presentation mode on Escape', () => {
    const event = key('Escape')
    handle(event)
    expect(exit).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('does nothing when not presenting', () => {
    presenting.value = false
    const event = key('Escape')
    handle(event)
    expect(exit).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores every other key', () => {
    for (const k of ['a', 'Enter', 'Tab', 'ArrowDown', 'F5', ' ']) handle(key(k))
    expect(exit).not.toHaveBeenCalled()
  })

  // A dialog owns Escape first: one press must not also end the presentation.
  it('leaves Escape alone while a dialog is open', () => {
    const dialog = document.createElement('div')
    dialog.className = 'dialog-backdrop'
    document.body.replaceChildren(dialog)
    handle(key('Escape'))
    expect(exit).not.toHaveBeenCalled()
    document.body.replaceChildren()
  })

  // Monaco takes Escape for its own find widget and multi-cursor.
  it('leaves Escape alone inside the editor', () => {
    const editor = document.createElement('div')
    editor.className = 'monaco-editor'
    const inner = document.createElement('textarea')
    editor.appendChild(inner)
    document.body.replaceChildren(editor)
    handle(key('Escape', { target: inner }))
    expect(exit).not.toHaveBeenCalled()
    document.body.replaceChildren()
  })
})
