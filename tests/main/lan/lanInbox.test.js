import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  MAX_PER_SENDER,
  MAX_WAITING,
  isItemId,
  listItems,
  readItem,
  removeItem,
  removeItemsFrom,
  writeItem
} from '../../../src/main/lan/lanInbox'

const A = 'aa'.repeat(16)
const B = 'bb'.repeat(16)
let dir
beforeEach(() => (dir = join(mkdtempSync(join(tmpdir(), 'lan-inbox-')), 'inbox')))
afterEach(() => rmSync(join(dir, '..'), { recursive: true, force: true }))

describe('lan inbox', () => {
  it('keeps the sealed bytes as they arrived, private to the user', () => {
    const { id } = writeItem(dir, { sealed: { ciphertext: 'abc' }, fromFp: A, now: 7 })
    expect(isItemId(id)).toBe(true)
    expect(readItem(dir, id)).toEqual({
      v: 1,
      id,
      fromFp: A,
      receivedAt: 7,
      sealed: { ciphertext: 'abc' }
    })
    if (process.platform !== 'win32') expect(statSync(dir).mode & 0o777).toBe(0o700)
  })

  it('caps how many items can wait', () => {
    const fp = (i) => (i % 10).toString(16).repeat(32)
    for (let i = 0; i < MAX_WAITING; i++)
      writeItem(dir, { sealed: { n: i }, fromFp: fp(i), now: i })
    expect(writeItem(dir, { sealed: {}, fromFp: B, now: 0 })).toEqual({ error: 'inbox-full' })
    expect(listItems(dir)).toHaveLength(MAX_WAITING)
  })

  it('removes one item, or everything from one sender', () => {
    const one = writeItem(dir, { sealed: { a: 1 }, fromFp: A, now: 1 }).id
    writeItem(dir, { sealed: { a: 2 }, fromFp: A, now: 2 })
    writeItem(dir, { sealed: { b: 1 }, fromFp: B, now: 3 })
    removeItem(dir, one)
    expect(listItems(dir)).toHaveLength(2)
    removeItemsFrom(dir, A)
    expect(listItems(dir).map((i) => i.fromFp)).toEqual([B])
  })

  it('refuses ids that are not ours and ignores files that are not items', () => {
    writeFileSync(join(mkdtempSync(join(tmpdir(), 'x-')), 'junk.json'), '{}')
    writeItem(dir, { sealed: { a: 1 }, fromFp: A, now: 1 })
    writeFileSync(join(dir, 'notes.txt'), 'hello')
    writeFileSync(join(dir, '11111111-1111-1111-1111-111111111111.json'), '{broken')
    expect(readItem(dir, '../escape')).toBeNull()
    expect(listItems(dir)).toHaveLength(1)
    removeItem(dir, '../../etc/passwd')
    expect(readdirSync(dir)).toContain('notes.txt')
  })

  it('reads nothing from a missing folder', () => {
    expect(listItems(join(dir, 'nope'))).toEqual([])
  })
})

describe('replayed and flooding items', () => {
  const later = { now: 1, expiresAt: 10_000 }

  it('refuses the same sealed item twice while one is waiting', () => {
    writeItem(dir, { sealed: { ciphertext: 'abc' }, fromFp: A, ...later })
    expect(writeItem(dir, { sealed: { ciphertext: 'abc' }, fromFp: A, ...later })).toEqual({
      error: 'duplicate'
    })
  })

  it('refuses an item that was already opened or declined, until it would have expired', () => {
    const { id } = writeItem(dir, { sealed: { ciphertext: 'abc' }, fromFp: A, ...later })
    removeItem(dir, id, 5)
    expect(writeItem(dir, { sealed: { ciphertext: 'abc' }, fromFp: A, ...later })).toEqual({
      error: 'duplicate'
    })
    expect(
      writeItem(dir, { sealed: { ciphertext: 'abc' }, fromFp: A, now: 10_001, expiresAt: 20_000 })
    ).toHaveProperty('id')
  })

  it('caps one sender, so they cannot crowd out everyone else', () => {
    for (let i = 0; i < MAX_PER_SENDER; i++)
      writeItem(dir, { sealed: { n: i }, fromFp: A, ...later })
    expect(writeItem(dir, { sealed: { n: 'x' }, fromFp: A, ...later })).toEqual({
      error: 'sender-full'
    })
    expect(writeItem(dir, { sealed: { n: 'y' }, fromFp: B, ...later })).toHaveProperty('id')
  })
})
