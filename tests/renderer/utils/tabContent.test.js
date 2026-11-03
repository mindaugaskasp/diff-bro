import { afterEach, describe, expect, it } from 'vitest'
import {
  registerTabContent,
  tabContent,
  tabSnippetSource,
  unregisterTabContent,
  writeTabContent
} from '../../../src/renderer/src/utils/tabContent'

const read = (content) => () => ({
  name: 'Note',
  content,
  language: 'auto',
  secret: false,
  snippetId: null
})

afterEach(() => unregisterTabContent('t1'))

describe('tabContent', () => {
  it('reads what a registered tab shows, and nothing once it is gone', () => {
    registerTabContent('t1', read('hello'))
    expect(tabContent('t1').content).toBe('hello')
    expect(tabSnippetSource('t1')).toMatchObject({ name: 'Note', content: 'hello' })
    unregisterTabContent('t1')
    expect(tabContent('t1')).toBeNull()
  })

  it('writes into a tab that takes text, and says whether it could', () => {
    let text = ''
    registerTabContent('t1', read(''), (next) => (text = next))
    expect(writeTabContent('t1', 'filled')).toBe(true)
    expect(text).toBe('filled')
    expect(writeTabContent('nope', 'x')).toBe(false)
  })

  it('refuses to write into a tab registered without a writer', () => {
    registerTabContent('t1', read(''))
    expect(writeTabContent('t1', 'x')).toBe(false)
  })
})
