import { describe, expect, it } from 'vitest'
import { applyJiraAction, JIRA_ACTIONS } from '../../../src/renderer/src/utils/jiraMarkup'
import { createTranslator } from '../../../src/shared/i18n'

// Drive an action against a text with a [start, end] selection and read back the
// new text plus the substring the returned selection covers.
const run = (id, text, start, end = start) => {
  const r = applyJiraAction(id, { text, start, end })
  return { text: r.text, sel: r.text.slice(r.start, r.end), start: r.start, end: r.end }
}

describe('jiraMarkup — inline wraps', () => {
  it('wraps a selection in bold markers and keeps it selected', () => {
    const r = run('bold', 'make me bold', 8, 12)
    expect(r.text).toBe('make me *bold*')
    expect(r.sel).toBe('bold')
  })

  it('places the caret between the markers when nothing is selected', () => {
    const r = run('italic', 'x', 1)
    expect(r.text).toBe('x__')
    expect(r.start).toBe(2)
    expect(r.end).toBe(2)
  })

  it('toggles bold off when the selection already carries the markers', () => {
    const r = run('bold', 'a *bold* b', 2, 8) // selects "*bold*"
    expect(r.text).toBe('a bold b')
    expect(r.sel).toBe('bold')
  })

  it('toggles off when the markers sit just outside the selection', () => {
    const r = run('bold', 'a *bold* b', 3, 7) // selects the inner "bold"
    expect(r.text).toBe('a bold b')
    expect(r.sel).toBe('bold')
  })

  it('uses two-character monospace markers', () => {
    const r = run('code', 'x', 0, 1)
    expect(r.text).toBe('{{x}}')
    expect(r.sel).toBe('x')
  })
})

describe('jiraMarkup — headings and quote', () => {
  it('prefixes the current line with h1.', () => {
    const r = run('h1', 'Title\nbody', 2)
    expect(r.text).toBe('h1. Title\nbody')
  })

  it('replaces an existing heading level rather than stacking it', () => {
    const r = run('h2', 'h1. Title', 5)
    expect(r.text).toBe('h2. Title')
  })

  it('removes the heading when the same level is toggled', () => {
    const r = run('h1', 'h1. Title', 5)
    expect(r.text).toBe('Title')
  })

  it('applies the bq. quote prefix', () => {
    const r = run('quote', 'quoted', 0)
    expect(r.text).toBe('bq. quoted')
  })
})

describe('jiraMarkup — lists', () => {
  it('bullets every line the selection spans', () => {
    const r = run('bullet', 'one\ntwo\nthree', 0, 13)
    expect(r.text).toBe('* one\n* two\n* three')
  })

  it('numbers a single line', () => {
    const r = run('numbered', 'item', 2)
    expect(r.text).toBe('# item')
  })

  it('toggles a bullet list off when every line already has the marker', () => {
    const r = run('bullet', '* one\n* two', 0, 11)
    expect(r.text).toBe('one\ntwo')
  })

  it('leaves blank lines untouched when bulleting', () => {
    const r = run('bullet', 'one\n\ntwo', 0, 8)
    expect(r.text).toBe('* one\n\n* two')
  })
})

describe('jiraMarkup — blocks and links', () => {
  it('wraps a selection in a {code} block and selects the inner content', () => {
    const r = run('codeblock', 'x = 1', 0, 5)
    expect(r.text).toBe('{code}\nx = 1\n{code}')
    expect(r.sel).toBe('x = 1')
  })

  it('keeps a selection as the link label and lands the caret in the url slot', () => {
    const r = run('link', 'Docs', 0, 4)
    expect(r.text).toBe('[Docs|]')
    expect(r.start).toBe(6) // just before the closing ]
    expect(r.sel).toBe('')
  })

  it('inserts a placeholder link and selects "text" when nothing is selected', () => {
    const r = run('link', '', 0)
    expect(r.text).toBe('[text|url]')
    expect(r.sel).toBe('text')
  })
})

describe('jiraMarkup — registry', () => {
  it('has a transform for every advertised toolbar action', () => {
    for (const a of JIRA_ACTIONS) {
      expect(applyJiraAction(a.id, { text: 'x', start: 0, end: 1 })).not.toBeNull()
    }
  })

  it('returns null for an unknown action id', () => {
    expect(applyJiraAction('nope', { text: 'x', start: 0, end: 1 })).toBeNull()
  })
})

describe('JIRA_ACTIONS', () => {
  const t = createTranslator('en')

  it('every action has an id + label key and an icon or a text label', () => {
    for (const a of JIRA_ACTIONS) {
      expect(typeof a.id).toBe('string')
      expect(t(a.labelKey), a.id).not.toBe(a.labelKey)
      expect(!!a.icon || !!a.text).toBe(true)
    }
  })

  // Jira's markup is where this bites hardest: `[text|url]` would parse as a
  // TWO-FORM PLURAL and `{code}` / `{{text}}` as interpolation, so these never
  // go through the catalogue.
  it('keeps the syntax example out of the catalogue, verbatim', () => {
    const byId = Object.fromEntries(JIRA_ACTIONS.map((a) => [a.id, a]))
    expect(byId.link.syntax).toBe('[text|url]')
    expect(byId.codeblock.syntax).toBe('{code}')
    expect(byId.code.syntax).toBe('{{text}}')
  })
})
