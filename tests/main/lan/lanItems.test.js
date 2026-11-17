import { describe, expect, it } from 'vitest'
import {
  ITEM_LIMITS,
  SNIPPET_TTL_MS,
  isValidItemEntry,
  itemSummary,
  snippetEntry
} from '../../../src/main/lan/lanItems'

const diff = (over = {}) => ({
  kind: 'diff',
  name: 'config.yaml ↔ config.prod.yaml',
  createdAt: 1,
  expiresAt: 2,
  snapshot: { mode: 'paste' },
  ...over
})

describe('snippet entries', () => {
  it('expire a week after they are sent', () => {
    const entry = snippetEntry(
      { name: 'nginx reload', content: 'x', language: 'shell', tags: ['ops'] },
      100
    )
    expect(entry).toEqual({
      kind: 'snippet',
      name: 'nginx reload',
      createdAt: 100,
      expiresAt: 100 + SNIPPET_TTL_MS,
      snippet: { content: 'x', language: 'shell', tags: ['ops'] }
    })
    expect(isValidItemEntry(entry)).toBe(true)
  })

  it('default the language and tags', () => {
    expect(snippetEntry({ name: 'n', content: '' }, 1).snippet).toEqual({
      content: '',
      language: 'auto',
      tags: []
    })
  })
})

describe('isValidItemEntry', () => {
  it('accepts a diff', () => expect(isValidItemEntry(diff())).toBe(true))

  it.each([
    [null],
    [{}],
    [diff({ kind: 'secret' })],
    [diff({ kind: undefined })],
    [diff({ name: '' })],
    [diff({ name: 'x'.repeat(ITEM_LIMITS.name + 1) })],
    [diff({ snapshot: null })],
    [diff({ createdAt: 'now' })],
    [diff({ expiresAt: -1 })],
    [
      {
        ...snippetEntry({ name: 'n', content: 'x' }, 1),
        snippet: { content: 1, language: 'a', tags: [] }
      }
    ],
    [
      {
        ...snippetEntry({ name: 'n', content: 'x' }, 1),
        snippet: { content: 'x', language: 'a', tags: Array(21).fill('t') }
      }
    ],
    [{ ...snippetEntry({ name: 'n', content: 'x' }, 1), snippet: null }]
  ])('refuses %j', (entry) => expect(isValidItemEntry(entry)).toBe(false))
})

describe('itemSummary', () => {
  it('keeps what the list shows and nothing of the content', () => {
    const summary = itemSummary(
      { id: 'i1', receivedAt: 5 },
      { entry: diff(), from: 'Ben Okafor', fp: 'bb'.repeat(16) }
    )
    expect(summary).toEqual({
      id: 'i1',
      kind: 'diff',
      name: 'config.yaml ↔ config.prod.yaml',
      from: 'Ben Okafor',
      fp: 'bb'.repeat(16),
      receivedAt: 5,
      expiresAt: 2
    })
  })
})
