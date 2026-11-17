import { describe, expect, it } from 'vitest'
import {
  ITEM_LIMITS,
  itemHeader,
  ackResult,
  cleanFps,
  deliveryReport,
  resolveRecipients,
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

describe('sending helpers', () => {
  const A = 'aa'.repeat(16)
  const B = 'bb'.repeat(16)
  const trusted = [
    { fingerprint: A, label: 'Ana' },
    { fingerprint: B, label: 'Ben' }
  ]

  it('keeps each well-formed fingerprint once', () => {
    expect(cleanFps([A, A, 'nope', 7, B])).toEqual([A, B])
    expect(cleanFps('not a list')).toEqual([])
  })

  it('resolves recipients only when every one is trusted', () => {
    expect(resolveRecipients([A, B], trusted).recipients.map((r) => r.label)).toEqual([
      'Ana',
      'Ben'
    ])
    expect(resolveRecipients([A, 'cc'.repeat(16)], trusted)).toEqual({ error: 'unknown-recipient' })
  })

  it('reads an acknowledgement', () => {
    expect(ackResult({ type: 'item-ack', ok: true })).toEqual({ ok: true })
    expect(ackResult({ type: 'item-ack', ok: false, reason: 'inbox-full' })).toEqual({
      ok: false,
      reason: 'inbox-full'
    })
    expect(ackResult({ type: 'add-reveal' })).toEqual({ ok: false, reason: 'refused' })
    expect(ackResult(undefined)).toEqual({ ok: false, reason: 'refused' })
  })

  it('reports who it reached and who it did not, by name', () => {
    const report = deliveryReport(
      [
        { fp: A, ok: true },
        { fp: B, ok: false, reason: 'offline' }
      ],
      trusted
    )
    expect(report).toEqual({
      ok: true,
      sent: ['Ana'],
      failed: [{ name: 'Ben', reason: 'offline' }]
    })
  })
})

describe('itemHeader', () => {
  it('carries the sender and nothing about the item', () => {
    expect(itemHeader('ab'.repeat(16))).toEqual({ type: 'item', fp: 'ab'.repeat(16) })
  })
})
