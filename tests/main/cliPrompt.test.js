// The interactive `diffbro new snippet`. The PROMPTING is glue — a synchronous
// line reader, because the cold CLI path runs before the single-instance lock
// and cannot await. What is testable is what it builds from the answers.
import { describe, expect, it } from 'vitest'
import { SYNTAXES, bodyFrom, draftFrom, syntaxFor } from '../../src/main/cliPrompt'

describe('syntaxFor', () => {
  it('takes a name from the list', () => {
    expect(syntaxFor('sql')).toBe('sql')
    expect(syntaxFor('SQL')).toBe('sql')
    expect(syntaxFor('  json  ')).toBe('json')
  })

  it('takes the number the list printed', () => {
    expect(syntaxFor('1')).toBe(SYNTAXES[0])
    expect(syntaxFor(String(SYNTAXES.length))).toBe(SYNTAXES.at(-1))
  })

  // An empty answer is the common one — Enter past the question.
  it('falls back to auto-detection for anything it does not recognise', () => {
    expect(syntaxFor('')).toBe('auto')
    expect(syntaxFor('   ')).toBe('auto')
    expect(syntaxFor('klingon')).toBe('auto')
    expect(syntaxFor('0')).toBe('auto')
    expect(syntaxFor(String(SYNTAXES.length + 1))).toBe('auto')
    expect(syntaxFor(undefined)).toBe('auto')
  })
})

describe('draftFrom', () => {
  const answers = { name: 'Deploy notes', syntax: 'sql', content: 'select 1;' }

  it('carries the answers through', () => {
    expect(draftFrom(answers)).toEqual({
      name: 'Deploy notes',
      language: 'sql',
      content: 'select 1;',
      tags: ['cli']
    })
  })

  // The tag is the whole point of the ask: a snippet made from the terminal is
  // findable as one afterwards.
  it('always tags it cli, whatever was typed', () => {
    expect(draftFrom({ ...answers, name: '' }).tags).toEqual(['cli'])
  })

  it('trims the name and lets an empty one fall through to the store', () => {
    expect(draftFrom({ ...answers, name: '  spaced  ' }).name).toBe('spaced')
    expect(draftFrom({ ...answers, name: '   ' }).name).toBe('')
  })

  // Content is the one thing worth refusing: a snippet with no body is not a
  // snippet, and the terminal is where saying so costs nothing.
  it('refuses an empty body', () => {
    expect(draftFrom({ ...answers, content: '' })).toBeNull()
    expect(draftFrom({ ...answers, content: '  \n \n' })).toBeNull()
  })

  it('keeps the body verbatim, including its blank lines and indentation', () => {
    const content = 'line one\n\n    indented\nlast'
    expect(draftFrom({ ...answers, content }).content).toBe(content)
  })
})

// The body is many lines, so it needs a terminator that cannot appear in one by
// accident. `:q` is the vim spelling and finishes the snippet; Ctrl+C is the
// universal cancel and is handled as a signal, not a line.
describe('bodyFrom', () => {
  it('collects every line until :q', () => {
    expect(bodyFrom(['one', 'two', ':q', 'after'])).toEqual({
      content: 'one\ntwo',
      cancelled: false
    })
  })

  it('keeps blank lines, indentation and anything that merely contains :q', () => {
    const lines = ['select 1;', '', '  indented', 'echo ":q"', 'a:q', ':q']
    expect(bodyFrom(lines).content).toBe('select 1;\n\n  indented\necho ":q"\na:q')
  })

  it('is not fooled by trailing whitespace around the terminator', () => {
    expect(bodyFrom(['x', '  :q  ']).content).toBe('x')
  })

  // EOF (Ctrl+D) is the other conventional "that is all".
  it('finishes at end of input', () => {
    expect(bodyFrom(['one', null])).toEqual({ content: 'one', cancelled: false })
  })

  it('takes an empty body as an empty body, not a cancel', () => {
    expect(bodyFrom([':q'])).toEqual({ content: '', cancelled: false })
  })
})
