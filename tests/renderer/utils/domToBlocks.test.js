import { describe, expect, it } from 'vitest'
import { domToBlocks } from '../../../src/renderer/src/utils/domToBlocks'

// Literal markup, so this fails if JiraRendered's shape drifts from the reader.
const root = (html) => {
  const el = document.createElement('div')
  el.className = 'jira-rendered'
  el.innerHTML = html
  return el
}

describe('domToBlocks', () => {
  it('reads an empty root as no blocks', () => {
    expect(domToBlocks(root(''))).toEqual([])
    expect(domToBlocks(null)).toEqual([])
  })

  it('reads a heading and its level', () => {
    const blocks = domToBlocks(root('<h2 class="ji-h">Title</h2>'))
    expect(blocks).toEqual([
      { type: 'heading', level: 2, inlines: [{ type: 'text', value: 'Title' }] }
    ])
  })

  it('reads a paragraph, splitting on <br>', () => {
    const blocks = domToBlocks(root('<p class="ji-p">one<br>two</p>'))
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        lines: [[{ type: 'text', value: 'one' }], [{ type: 'text', value: 'two' }]]
      }
    ])
  })

  it('reads every inline element back to its node', () => {
    const blocks = domToBlocks(
      root(
        '<p class="ji-p"><strong>b</strong><em>i</em><u>u</u><s>s</s>' +
          '<code class="ji-mono">c</code><span class="ji-link" title="u">l</span></p>'
      )
    )
    expect(blocks[0].lines[0]).toEqual([
      { type: 'strong', inlines: [{ type: 'text', value: 'b' }] },
      { type: 'em', inlines: [{ type: 'text', value: 'i' }] },
      { type: 'ins', inlines: [{ type: 'text', value: 'u' }] },
      { type: 'del', inlines: [{ type: 'text', value: 's' }] },
      { type: 'code', value: 'c' },
      { type: 'link', label: 'l', href: 'u' }
    ])
  })

  it('reads nested emphasis', () => {
    const blocks = domToBlocks(root('<p class="ji-p"><strong>a<em>b</em></strong></p>'))
    expect(blocks[0].lines[0]).toEqual([
      {
        type: 'strong',
        inlines: [
          { type: 'text', value: 'a' },
          { type: 'em', inlines: [{ type: 'text', value: 'b' }] }
        ]
      }
    ])
  })

  it('reads a bullet list and its depth', () => {
    const blocks = domToBlocks(
      root('<ul class="ji-list"><li data-depth="1">top</li><li data-depth="2">nested</li></ul>')
    )
    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [
          { depth: 1, inlines: [{ type: 'text', value: 'top' }] },
          { depth: 2, inlines: [{ type: 'text', value: 'nested' }] }
        ]
      }
    ])
  })

  it('reads an ordered list', () => {
    const blocks = domToBlocks(root('<ol class="ji-list"><li data-depth="1">a</li></ol>'))
    expect(blocks[0].ordered).toBe(true)
  })

  it('reads a task item and its checked state', () => {
    const blocks = domToBlocks(
      root(
        '<ul class="ji-list ji-tasks">' +
          '<li class="ji-task" data-depth="1"><input type="checkbox">todo</li>' +
          '<li class="ji-task" data-depth="1"><input type="checkbox" checked>done</li>' +
          '</ul>'
      )
    )
    expect(blocks[0].items).toEqual([
      { depth: 1, task: true, checked: false, inlines: [{ type: 'text', value: 'todo' }] },
      { depth: 1, task: true, checked: true, inlines: [{ type: 'text', value: 'done' }] }
    ])
  })

  // The attribute is only the box's initial value.
  it('reads the checkbox property, not its attribute', () => {
    const el = root(
      '<ul class="ji-list ji-tasks"><li class="ji-task" data-depth="1"><input type="checkbox">x</li></ul>'
    )
    el.querySelector('input').checked = true
    expect(domToBlocks(el)[0].items[0].checked).toBe(true)
  })

  it('reads a code block verbatim', () => {
    const blocks = domToBlocks(root('<pre class="ji-code">a &lt; b\nc</pre>'))
    expect(blocks).toEqual([{ type: 'code', code: 'a < b\nc' }])
  })

  it('reads a quote and recurses into its children', () => {
    const blocks = domToBlocks(
      root(
        '<blockquote class="ji-quote"><div class="jira-rendered"><p class="ji-p">in</p></div></blockquote>'
      )
    )
    expect(blocks).toEqual([
      {
        type: 'quote',
        children: [{ type: 'paragraph', lines: [[{ type: 'text', value: 'in' }]] }]
      }
    ])
  })

  it('reads a table, its head and its alignment', () => {
    const blocks = domToBlocks(
      root(
        '<div class="ji-table-wrap"><table class="ji-table">' +
          '<thead><tr><th style="text-align: center;">h</th></tr></thead>' +
          '<tbody><tr><td style="text-align: center;">c</td></tr></tbody>' +
          '</table></div>'
      )
    )
    expect(blocks).toEqual([
      {
        type: 'table',
        align: ['center'],
        head: [[{ type: 'text', value: 'h' }]],
        rows: [[[{ type: 'text', value: 'c' }]]]
      }
    ])
  })

  it('reads a headerless table', () => {
    const blocks = domToBlocks(
      root(
        '<div class="ji-table-wrap"><table class="ji-table"><tbody><tr><td>c</td></tr></tbody></table></div>'
      )
    )
    expect(blocks[0].head).toEqual([])
    expect(blocks[0].align).toEqual([])
  })

  // Rule 8's safety net: off-whitelist can only come back out as text.
  it('degrades an unknown element to its text', () => {
    const blocks = domToBlocks(root('<div><iframe src="evil"></iframe>hello</div>'))
    expect(blocks).toEqual([{ type: 'paragraph', lines: [[{ type: 'text', value: 'hello' }]] }])
  })

  it('degrades an unknown inline element to its text', () => {
    const blocks = domToBlocks(root('<p class="ji-p">a<span class="what">b</span></p>'))
    expect(blocks[0].lines[0]).toEqual([
      { type: 'text', value: 'a' },
      { type: 'text', value: 'b' }
    ])
  })

  it('skips a block that browsers leave behind as empty', () => {
    expect(domToBlocks(root('<p class="ji-p"></p><p class="ji-p">x</p>'))).toEqual([
      { type: 'paragraph', lines: [[{ type: 'text', value: 'x' }]] }
    ])
  })
})

describe('domToBlocks — shapes the browser leaves behind', () => {
  // blockOf only routes to tableBlock when a table is present.
  it('drops a table wrapper holding no table', () => {
    expect(domToBlocks(root('<div class="ji-table-wrap"></div>'))).toEqual([])
  })

  it('reads a list item with no data-depth as the first level', () => {
    const blocks = domToBlocks(root('<ul class="ji-list"><li>x</li></ul>'))
    expect(blocks[0].items[0].depth).toBe(1)
  })

  it('reads a blockquote with no inner wrapper', () => {
    const blocks = domToBlocks(
      root('<blockquote class="ji-quote"><p class="ji-p">in</p></blockquote>')
    )
    expect(blocks[0].children).toEqual([
      { type: 'paragraph', lines: [[{ type: 'text', value: 'in' }]] }
    ])
  })

  it('drops an empty text node rather than emitting an empty run', () => {
    const el = root('<p class="ji-p">x</p>')
    el.querySelector('p').appendChild(document.createTextNode(''))
    expect(el.querySelector('p').childNodes.length).toBe(2)
    expect(domToBlocks(el)[0].lines[0]).toEqual([{ type: 'text', value: 'x' }])
  })

  it('ignores a comment node', () => {
    const el = root('<p class="ji-p">x</p>')
    el.querySelector('p').appendChild(document.createComment('note'))
    expect(domToBlocks(el)[0].lines[0]).toEqual([{ type: 'text', value: 'x' }])
  })
})
