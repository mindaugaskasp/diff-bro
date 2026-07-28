import { describe, expect, it } from 'vitest'
import { diffToHtml } from '../../../src/renderer/src/utils/diffHtml'

describe('diffToHtml', () => {
  it('marks added and removed lines and is a self-contained document', () => {
    const { html } = diffToHtml('a\nb\nc\n', 'a\nB\nc\n', { leftName: 'x.js', rightName: 'y.js' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>x.js ↔ y.js — Diff Bro</title>')
    expect(html).toContain('<tr class="del"><td class="ln">2</td><td class="ln"></td>')
    expect(html).toContain('<tr class="add"><td class="ln"></td><td class="ln">2</td>')
    // no external assets — everything is inline
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/<(script|link|img)\b/)
  })

  it('escapes user text and names so content can never inject markup', () => {
    const { html } = diffToHtml('<b>&', 'x', { leftName: '<name>', rightName: 'r' })
    expect(html).toContain('&lt;b&gt;&amp;')
    expect(html).toContain('&lt;name&gt; ↔ r')
    expect(html).not.toContain('<b>&')
  })

  it('propagates the size guard', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `l${i}`).join('\n')
    expect(diffToHtml(big, 'x')).toEqual({ error: 'too-large' })
  })
})
