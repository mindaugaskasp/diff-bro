import { beforeEach, describe, expect, it } from 'vitest'
import { applyDomFormat, isInListItem } from '../../../src/renderer/src/utils/domFormat'
import { domToBlocks } from '../../../src/renderer/src/utils/domToBlocks'
import { serializeMarkdown } from '../../../src/renderer/src/utils/markdownSerialize'

// Asserted through the serializer: the claim is that the snippet's MARKUP
// changed, not that the DOM did.
let root

const mount = (html) => {
  root = document.createElement('div')
  root.className = 'jira-rendered'
  root.innerHTML = html
  document.body.replaceChildren(root)
  return root
}

const markup = () => serializeMarkdown(domToBlocks(root))

const select = (node, start, end) => {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

const caretIn = (node, at = 0) => select(node, at, at)

beforeEach(() => {
  document.body.replaceChildren()
})

describe('applyDomFormat — inline', () => {
  it.each([
    ['bold', '**mid**'],
    ['italic', '*mid*'],
    ['strike', '~~mid~~'],
    ['code', '`mid`']
  ])('%s wraps the selection', (id, want) => {
    mount('<p class="ji-p">a mid b</p>')
    select(root.querySelector('p').firstChild, 2, 5)
    expect(applyDomFormat(root, id)).toBe(true)
    expect(markup()).toBe(`a ${want} b`)
  })

  it('does nothing when nothing is selected', () => {
    mount('<p class="ji-p">abc</p>')
    caretIn(root.querySelector('p').firstChild, 1)
    expect(applyDomFormat(root, 'bold')).toBe(false)
    expect(markup()).toBe('abc')
  })

  it('makes a link carrying its href', () => {
    mount('<p class="ji-p">see docs here</p>')
    select(root.querySelector('p').firstChild, 4, 8)
    expect(applyDomFormat(root, 'link')).toBe(true)
    expect(markup()).toBe('see [docs]() here')
  })
})

describe('applyDomFormat — blocks', () => {
  it.each([
    ['h1', '# text'],
    ['h2', '## text'],
    ['h3', '### text']
  ])('%s retags the block holding the caret', (id, want) => {
    mount('<p class="ji-p">text</p>')
    caretIn(root.querySelector('p').firstChild, 1)
    expect(applyDomFormat(root, id)).toBe(true)
    expect(markup()).toBe(want)
  })

  it('turns a heading back into a paragraph when reapplied', () => {
    mount('<h2 class="ji-h">text</h2>')
    caretIn(root.querySelector('h2').firstChild, 1)
    applyDomFormat(root, 'h2')
    expect(markup()).toBe('text')
  })

  it('quotes the block holding the caret', () => {
    mount('<p class="ji-p">said</p>')
    caretIn(root.querySelector('p').firstChild, 1)
    expect(applyDomFormat(root, 'quote')).toBe(true)
    expect(markup()).toBe('> said')
  })

  it.each([
    ['bullet', '- item'],
    ['numbered', '1. item'],
    ['task', '- [ ] item']
  ])('%s converts the block to a list', (id, want) => {
    mount('<p class="ji-p">item</p>')
    caretIn(root.querySelector('p').firstChild, 1)
    expect(applyDomFormat(root, id)).toBe(true)
    expect(markup()).toBe(want)
  })

  it('inserts a code block', () => {
    mount('<p class="ji-p">x</p>')
    caretIn(root.querySelector('p').firstChild, 1)
    expect(applyDomFormat(root, 'codeblock')).toBe(true)
    expect(markup()).toContain('```')
  })

  it('inserts a table', () => {
    mount('<p class="ji-p">x</p>')
    caretIn(root.querySelector('p').firstChild, 1)
    expect(applyDomFormat(root, 'table')).toBe(true)
    expect(markup()).toContain('| --- |')
  })
})

describe('applyDomFormat — nesting', () => {
  const LIST = '<ul class="ji-list"><li data-depth="1">one</li><li data-depth="1">two</li></ul>'

  it('indents the item holding the caret', () => {
    mount(LIST)
    caretIn(root.querySelectorAll('li')[1].firstChild, 0)
    expect(applyDomFormat(root, 'indent')).toBe(true)
    expect(markup()).toBe('- one\n  - two')
  })

  it('outdents', () => {
    mount('<ul class="ji-list"><li data-depth="1">one</li><li data-depth="2">two</li></ul>')
    caretIn(root.querySelectorAll('li')[1].firstChild, 0)
    expect(applyDomFormat(root, 'outdent')).toBe(true)
    expect(markup()).toBe('- one\n- two')
  })

  it('refuses to outdent past the first level', () => {
    mount(LIST)
    caretIn(root.querySelectorAll('li')[0].firstChild, 0)
    expect(applyDomFormat(root, 'outdent')).toBe(false)
    expect(markup()).toBe('- one\n- two')
  })

  it('does nothing for indent outside a list', () => {
    mount('<p class="ji-p">plain</p>')
    caretIn(root.querySelector('p').firstChild, 1)
    expect(applyDomFormat(root, 'indent')).toBe(false)
  })
})

describe('applyDomFormat — guards', () => {
  it('ignores an unknown action', () => {
    mount('<p class="ji-p">x</p>')
    caretIn(root.querySelector('p').firstChild, 1)
    expect(applyDomFormat(root, 'nope')).toBe(false)
  })

  it('ignores a caret outside the root', () => {
    mount('<p class="ji-p">x</p>')
    const other = document.createElement('p')
    other.textContent = 'elsewhere'
    document.body.appendChild(other)
    caretIn(other.firstChild, 1)
    expect(applyDomFormat(root, 'bold')).toBe(false)
  })
})

describe('applyDomFormat — no block under the caret', () => {
  // No block element to retag, so every block action declines rather than throws.
  const bareCaret = () => {
    root = document.createElement('div')
    root.className = 'jira-rendered'
    root.appendChild(document.createTextNode('loose'))
    document.body.replaceChildren(root)
    caretIn(root.firstChild, 1)
  }

  it.each(['h1', 'quote', 'bullet', 'numbered', 'task', 'codeblock', 'table'])(
    '%s declines',
    (id) => {
      bareCaret()
      expect(applyDomFormat(root, id)).toBe(false)
    }
  )
})

describe('applyDomFormat — root and caret guards', () => {
  it('declines a null root', () => {
    expect(applyDomFormat(null, 'bold')).toBe(false)
  })

  it('reports whether the caret is in a list item', () => {
    mount('<ul class="ji-list"><li data-depth="1">one</li></ul>')
    caretIn(root.querySelector('li').firstChild, 0)
    expect(isInListItem(root)).toBe(true)
    expect(isInListItem(null)).toBe(false)
  })

  it('is not in a list item for a paragraph', () => {
    mount('<p class="ji-p">x</p>')
    caretIn(root.querySelector('p').firstChild, 1)
    expect(isInListItem(root)).toBe(false)
  })
})
