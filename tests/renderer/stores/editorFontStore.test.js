import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorFontStore } from '../../../src/renderer/src/stores/editorFontStore'

const stored = () => JSON.parse(localStorage.getItem('diffbro.editorFont') ?? '{}')

beforeEach(() => {
  localStorage.clear()
  window.api = {}
  setActivePinia(createPinia())
})

describe('editorFontStore', () => {
  it('starts on the default face', () => {
    expect(useEditorFontStore().family).toBe('')
  })

  it('remembers a chosen face', () => {
    useEditorFontStore().setFamily('Menlo')
    expect(stored().family).toBe('Menlo')
    setActivePinia(createPinia())
    expect(useEditorFontStore().family).toBe('Menlo')
  })

  it('refuses a family off the list, from a call or from the file', () => {
    useEditorFontStore().setFamily('x"; color: red')
    expect(useEditorFontStore().family).toBe('')
    localStorage.setItem('diffbro.editorFont', JSON.stringify({ family: 'Comic Sans' }))
    setActivePinia(createPinia())
    expect(useEditorFontStore().family).toBe('')
  })
})
