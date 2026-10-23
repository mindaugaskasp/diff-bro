import { describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../src/main/vaultCrypt'
import { diffAad, snippetAad } from '../../src/shared/entryAad'
import { listDiffs, listSnippets, readDiff, readSnippet, sidesOf } from '../../src/main/mcpLibrary'

const KEY = randomBytes(32)
const NOW = 10_000
const decrypt = (box, aad) => vaultDecrypt(KEY, box, aad)

const snippet = (id, extra = {}) => {
  const base = { id, aadSalt: `s-${id}`, createdAt: 1, name: `name ${id}`, tags: [], ...extra }
  const box = vaultEncrypt(KEY, `body ${id}`, snippetAad(base.id, base.aadSalt, base.createdAt))
  return { ...base, ...box }
}

const diff = (id, extra = {}) => {
  const base = {
    id,
    createdAt: 1,
    expiresAt: null,
    from: null,
    name: `diff ${id}`,
    tags: [],
    ...extra
  }
  const payload = { mode: 'paste', pasteLeft: 'a\n', pasteRight: 'b\n', pasteLeftName: 'l' }
  const aad = diffAad(base.id, base.createdAt, base.expiresAt, base.from)
  return { ...base, ...vaultEncrypt(KEY, JSON.stringify(payload), aad) }
}

const snippets = {
  entries: [
    snippet('plain', { tags: ['sql'], language: 'auto', detected: 'sql' }),
    snippet('hidden', { secret: true })
  ]
}
const vault = {
  entries: [
    diff('mine', { tags: ['api'] }),
    diff('received', { from: 'Ada' }),
    diff('expired', { expiresAt: NOW - 1 }),
    diff('later', { expiresAt: NOW + 1 })
  ]
}

describe('mcp library view', () => {
  it('never lists or reads a secret snippet', () => {
    expect(listSnippets(snippets).map((s) => s.id)).toEqual(['plain'])
    expect(readSnippet(snippets, 'hidden', decrypt)).toBeNull()
  })

  it('never lists or reads a received or expired diff', () => {
    expect(listDiffs(vault, NOW).map((d) => d.id)).toEqual(['mine', 'later'])
    expect(readDiff(vault, 'received', NOW, decrypt)).toBeNull()
    expect(readDiff(vault, 'expired', NOW, decrypt)).toBeNull()
  })

  it('lists metadata only, with the detected language for an auto snippet', () => {
    expect(listSnippets(snippets)[0]).toEqual({
      id: 'plain',
      name: 'name plain',
      language: 'sql',
      tags: ['sql'],
      updatedAt: 1
    })
  })

  it('filters by name and by every tag given', () => {
    expect(listSnippets(snippets, { query: 'PLAIN' })).toHaveLength(1)
    expect(listSnippets(snippets, { query: 'nope' })).toHaveLength(0)
    expect(listDiffs(vault, NOW, { tags: ['api'] }).map((d) => d.id)).toEqual(['mine'])
  })

  it('decrypts a visible snippet and a visible diff', () => {
    expect(readSnippet(snippets, 'plain', decrypt).content).toBe('body plain')
    expect(readDiff(vault, 'mine', NOW, decrypt).sides).toEqual({
      left: { name: 'l', text: 'a\n' },
      right: { name: '', text: 'b\n' }
    })
  })

  it('returns null for an entry whose metadata was tampered with', () => {
    const tampered = { entries: [{ ...snippets.entries[0], createdAt: 2 }] }
    expect(readSnippet(tampered, 'plain', decrypt)).toBeNull()
  })

  it('tolerates a missing or malformed store', () => {
    expect(listSnippets(null)).toEqual([])
    expect(listDiffs({ entries: 'x' }, NOW)).toEqual([])
  })

  it('reads the sides of a file comparison', () => {
    const sides = sidesOf({
      mode: 'files',
      left: { name: 'a.json', content: '{}' },
      right: { name: 'b.json', content: '[]' }
    })
    expect(sides.left).toEqual({ name: 'a.json', text: '{}' })
    expect(sides.right).toEqual({ name: 'b.json', text: '[]' })
  })
})
