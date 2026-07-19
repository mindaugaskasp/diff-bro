import { describe, expect, it } from 'vitest'
import { detectSnippetLanguage } from '../src/renderer/src/utils/detectLanguage'

describe('detectSnippetLanguage', () => {
  it('returns plaintext for empty content', () => {
    expect(detectSnippetLanguage('')).toBe('plaintext')
    expect(detectSnippetLanguage('   ')).toBe('plaintext')
  })

  it('detects valid JSON', () => {
    expect(detectSnippetLanguage('{"a": 1, "b": [1, 2]}')).toBe('json')
  })

  it('does not misdetect malformed JSON-shaped content as json', () => {
    expect(detectSnippetLanguage('{a: 1,}')).not.toBe('json')
  })

  it('detects SQL by its leading keyword', () => {
    expect(detectSnippetLanguage('SELECT * FROM users WHERE id = 1')).toBe('sql')
    expect(detectSnippetLanguage('insert into users (id) values (1)')).toBe('sql')
    expect(detectSnippetLanguage('CREATE TABLE users (id INT)')).toBe('sql')
    expect(detectSnippetLanguage('with recent as (select 1) select * from recent')).toBe('sql')
  })

  it('does not detect sql from a keyword appearing mid-sentence', () => {
    expect(detectSnippetLanguage('Please select the correct answer from the list below.')).not.toBe(
      'sql'
    )
  })

  it('detects markdown from a single strong signal (heading)', () => {
    expect(detectSnippetLanguage('# Title\n\nSome text.')).toBe('markdown')
  })

  it('detects markdown from a fenced code block', () => {
    expect(detectSnippetLanguage('Some text\n```js\nconst x = 1\n```')).toBe('markdown')
  })

  it('detects markdown from two weak signals combined', () => {
    expect(detectSnippetLanguage('- item one\n- item two\n1. first\n2. second')).toBe('markdown')
  })

  it('does not detect markdown from a single weak signal', () => {
    expect(detectSnippetLanguage('- just one bullet in plain notes')).toBe('plaintext')
  })

  it('falls back to plaintext for ordinary text', () => {
    expect(detectSnippetLanguage('just a normal paragraph of text with no special shape')).toBe(
      'plaintext'
    )
  })
})
