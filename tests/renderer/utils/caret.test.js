import { beforeEach, describe, expect, it } from 'vitest'
import { caretOffset, restoreCaret } from '../../../src/renderer/src/utils/caret'

// A re-render replaces every node, so a node+offset pair points at nothing.
let root

beforeEach(() => {
  root = document.createElement('div')
  document.body.replaceChildren(root)
})

const put = (node, offset) => {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

describe('caretOffset', () => {
  it('is null when nothing is selected', () => {
    window.getSelection().removeAllRanges()
    expect(caretOffset(root)).toBe(null)
  })

  it('is null for a caret outside the root', () => {
    const other = document.createElement('div')
    other.textContent = 'elsewhere'
    document.body.appendChild(other)
    put(other.firstChild, 3)
    expect(caretOffset(root)).toBe(null)
  })

  it('counts characters from the start of the root', () => {
    root.textContent = 'hello world'
    put(root.firstChild, 5)
    expect(caretOffset(root)).toBe(5)
  })

  it('counts across element boundaries', () => {
    const strong = document.createElement('strong')
    strong.textContent = 'bold'
    root.append('a ', strong, ' b')
    put(strong.firstChild, 2)
    expect(caretOffset(root)).toBe(4)
  })
})

describe('restoreCaret', () => {
  it('puts the caret back at the same character offset', () => {
    root.textContent = 'hello world'
    restoreCaret(root, 5)
    expect(caretOffset(root)).toBe(5)
  })

  it('finds the offset inside a nested element', () => {
    const strong = document.createElement('strong')
    strong.textContent = 'bold'
    root.append('a ', strong, ' b')
    restoreCaret(root, 4)
    const sel = window.getSelection()
    expect(sel.anchorNode).toBe(strong.firstChild)
    expect(sel.anchorOffset).toBe(2)
  })

  // A stale offset must clamp rather than throw.
  it('clamps an offset past the end', () => {
    root.textContent = 'short'
    restoreCaret(root, 999)
    expect(caretOffset(root)).toBe(5)
  })

  it('does nothing for an empty root rather than throwing', () => {
    expect(() => restoreCaret(root, 3)).not.toThrow()
  })

  it('ignores a null offset', () => {
    root.textContent = 'hello'
    put(root.firstChild, 2)
    restoreCaret(root, null)
    expect(caretOffset(root)).toBe(2)
  })
})

describe('caret — guards', () => {
  it('reads nothing from a null root', () => {
    expect(caretOffset(null)).toBe(null)
  })

  it('ignores a restore into a null root', () => {
    expect(() => restoreCaret(null, 2)).not.toThrow()
  })
})
