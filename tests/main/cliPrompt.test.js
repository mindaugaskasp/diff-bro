// The interactive `diffbro new snippet`. The PROMPTING is glue — a synchronous
// line reader, because the cold CLI path runs before the single-instance lock
// and cannot await. What is testable is what it builds from the answers.
import { describe, expect, it } from 'vitest'
import { SYNTAXES, draftFrom, syntaxFor } from '../../src/main/cliPrompt'

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
