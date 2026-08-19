import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useContentEditable } from '../../../src/renderer/src/composables/useContentEditable'

// The markup the caret actually sits in, so handlers run against a real DOM.
const mount = (html) => {
  const el = document.createElement('div')
  el.className = 'jira-rendered'
  el.innerHTML = html
  document.body.replaceChildren(el)
  return el
}

const setup = (html, { dialect = 'markdown', content = '' } = {}) => {
  const el = mount(html)
  const root = ref(el)
  const text = ref(content)
  return { el, text, api: useContentEditable({ root, content: text, dialect: ref(dialect) }) }
}

const caretIn = (node, offset = 0) => {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

const pasteEvent = (data) => ({
  preventDefault: vi.fn(),
  clipboardData: { getData: vi.fn((type) => data[type] ?? '') }
})

const keyEvent = (key, shiftKey = false) => ({
  key,
  shiftKey,
  preventDefault: vi.fn()
})

beforeEach(() => {
  document.body.replaceChildren()
})

describe('useContentEditable — reading the DOM back', () => {
  it('serializes Markdown on input', () => {
    const { text, api } = setup('<h2 class="ji-h">Title</h2>')
    api.onInput()
    expect(text.value).toBe('## Title')
  })

  it('serializes Jira on input', () => {
    const { text, api } = setup('<h2 class="ji-h">Title</h2>', { dialect: 'jira' })
    api.onInput()
    expect(text.value).toBe('h2. Title')
  })

  it('writes a ticked task back as [x]', () => {
    const { el, text, api } = setup(
      '<ul class="ji-list ji-tasks"><li class="ji-task" data-depth="1"><input type="checkbox">todo</li></ul>'
    )
    el.querySelector('input').checked = true
    api.onToggleTask()
    expect(text.value).toBe('- [x] todo')
  })
})

describe('useContentEditable — paste', () => {
  // Rule 8: a default paste inserts the clipboard's text/html.
  it('never reads text/html', () => {
    const { api } = setup('<p class="ji-p">x</p>')
    const event = pasteEvent({
      'text/plain': 'safe',
      'text/html': '<img src=x onerror="alert(1)">'
    })
    api.onPaste(event)
    expect(event.clipboardData.getData).toHaveBeenCalledWith('text/plain')
    expect(event.clipboardData.getData).not.toHaveBeenCalledWith('text/html')
  })

  it('prevents the browser default', () => {
    const { api } = setup('<p class="ji-p">x</p>')
    const event = pasteEvent({ 'text/plain': 'hi' })
    api.onPaste(event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('inserts the plain text at the caret', () => {
    const { el, text, api } = setup('<p class="ji-p">ac</p>')
    caretIn(el.querySelector('p').firstChild, 1)
    api.onPaste(pasteEvent({ 'text/plain': 'b' }))
    expect(text.value).toBe('abc')
  })

  it('ignores a paste carrying no plain text', () => {
    const { text, api } = setup('<p class="ji-p">x</p>', { content: 'x' })
    api.onPaste(pasteEvent({ 'text/html': '<b>no</b>' }))
    expect(text.value).toBe('x')
  })
})

describe('useContentEditable — list nesting', () => {
  const LIST = '<ul class="ji-list"><li data-depth="1">one</li><li data-depth="1">two</li></ul>'

  it('Tab indents the item holding the caret', () => {
    const { el, text, api } = setup(LIST)
    caretIn(el.querySelectorAll('li')[1].firstChild, 0)
    const event = keyEvent('Tab')
    api.onKeydown(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(text.value).toBe('- one\n  - two')
  })

  it('Shift+Tab outdents', () => {
    const { el, text, api } = setup(
      '<ul class="ji-list"><li data-depth="1">one</li><li data-depth="2">two</li></ul>'
    )
    caretIn(el.querySelectorAll('li')[1].firstChild, 0)
    api.onKeydown(keyEvent('Tab', true))
    expect(text.value).toBe('- one\n- two')
  })

  it('will not outdent past the first level', () => {
    const { el, text, api } = setup(LIST, { content: '- one\n- two' })
    caretIn(el.querySelectorAll('li')[0].firstChild, 0)
    api.onKeydown(keyEvent('Tab', true))
    expect(el.querySelectorAll('li')[0].getAttribute('data-depth')).toBe('1')
    expect(text.value).toBe('- one\n- two')
  })

  // Tab leaves a dialog field; stealing it would trap focus in the editor.
  it('leaves Tab alone outside a list', () => {
    const { el, api } = setup('<p class="ji-p">plain</p>')
    caretIn(el.querySelector('p').firstChild, 2)
    const event = keyEvent('Tab')
    api.onKeydown(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('leaves other keys alone', () => {
    const { el, api } = setup(LIST)
    caretIn(el.querySelectorAll('li')[0].firstChild, 0)
    const event = keyEvent('a')
    api.onKeydown(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

describe('useContentEditable — the typing guard', () => {
  it('re-renders when content changes from outside', async () => {
    const { text, api } = setup('<p class="ji-p">old</p>', { content: 'old' })
    text.value = '# new'
    await Promise.resolve()
    expect(api.blocks.value).toEqual([
      { type: 'heading', level: 1, inlines: [{ type: 'text', value: 'new' }] }
    ])
  })

  // The caret-jump mitigation.
  it('does not re-render from its own output', async () => {
    const { api } = setup('<h2 class="ji-h">Title</h2>', { content: '## Title' })
    const before = api.blocks.value
    api.onInput()
    await Promise.resolve()
    expect(api.blocks.value).toBe(before)
  })
})
