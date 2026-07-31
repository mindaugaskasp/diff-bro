import { describe, expect, it } from 'vitest'
import { parseSnippetImport, MAX_IMPORT_BYTES } from '../../../src/renderer/src/utils/snippetImport'

describe('parseSnippetImport', () => {
  it('turns a VS Code snippets .json into one snippet per entry', () => {
    const json = JSON.stringify({
      'Log line': { prefix: 'log', body: ['console.log($1)', 'x'], scope: 'javascript' },
      Greeting: { prefix: 'hi', body: 'hello' }
    })
    const { snippets } = parseSnippetImport(json, 'js.code-snippets.json')
    expect(snippets).toEqual([
      { name: 'Log line', content: 'console.log($1)\nx', language: 'auto', tags: ['imported'] },
      { name: 'Greeting', content: 'hello', language: 'auto', tags: ['imported'] }
    ])
  })

  it('skips entries without a body', () => {
    const json = JSON.stringify({ good: { body: 'x' }, bad: { prefix: 'p' } })
    expect(parseSnippetImport(json, 'a.json').snippets.map((s) => s.name)).toEqual(['good'])
  })

  it('imports a plain text file as a single snippet named after the file', () => {
    const { snippets } = parseSnippetImport('some text\nhere', '/tmp/notes.txt')
    expect(snippets).toEqual([
      { name: 'notes', content: 'some text\nhere', language: 'auto', tags: ['imported'] }
    ])
  })

  it('falls back to a single snippet for a .json that is not VS Code snippets', () => {
    const { snippets } = parseSnippetImport('[1,2,3]', 'data.json')
    expect(snippets).toHaveLength(1)
    expect(snippets[0].content).toBe('[1,2,3]')
  })

  it('rejects oversized and non-string input', () => {
    expect(parseSnippetImport('x'.repeat(MAX_IMPORT_BYTES + 1), 'a.txt')).toEqual({
      error: 'too-large'
    })
    expect(parseSnippetImport(null)).toEqual({ error: 'bad-input' })
  })

  it('returns no snippets for empty input', () => {
    expect(parseSnippetImport('   ', 'a.txt')).toEqual({ snippets: [] })
  })
})
