import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerTabContent,
  startTabDrag,
  tabSnippetSource,
  unregisterTabContent
} from '../../../src/renderer/src/composables/useTabContent'
import { TAB_DRAG_TYPE } from '../../../src/renderer/src/utils/snippetSource'

const live = (over = {}) => ({
  name: 'Notes',
  content: 'body',
  secret: false,
  snippetId: null,
  ...over
})

const dragEvent = () => {
  const data = {}
  return {
    preventDefault: vi.fn(),
    dataTransfer: { setData: (type, value) => (data[type] = value), data }
  }
}

describe('tab content', () => {
  afterEach(() => unregisterTabContent('t1'))

  it("a registered tab's current text becomes a comparison side", () => {
    registerTabContent('t1', () => live({ content: 'typed now' }))
    expect(tabSnippetSource('t1')).toEqual({
      path: null,
      name: 'Notes',
      content: 'typed now',
      snippetId: null
    })
  })

  it('is null for a tab that is gone or secret', () => {
    expect(tabSnippetSource('t1')).toBeNull()
    registerTabContent('t1', () => live({ secret: true }))
    expect(tabSnippetSource('t1')).toBeNull()
  })

  it('a drag carries the tab id, never the text', () => {
    registerTabContent('t1', () => live())
    const e = dragEvent()
    startTabDrag(e, 't1')
    expect(e.dataTransfer.data).toEqual({ [TAB_DRAG_TYPE]: 't1' })
  })

  it('a secret or unknown tab does not start a drag', () => {
    registerTabContent('t1', () => live({ secret: true }))
    const e = dragEvent()
    startTabDrag(e, 't1')
    expect(e.preventDefault).toHaveBeenCalled()
    const other = dragEvent()
    startTabDrag(other, 'nope')
    expect(other.preventDefault).toHaveBeenCalled()
  })
})
