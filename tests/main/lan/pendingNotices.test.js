import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { keepPending, readPending, takePending } from '../../../src/main/lan/pendingNotices'
import { REVOKE_TTL_MS } from '../../../src/main/lan/revoke'

let dir
let file
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lan-pending-'))
  file = join(dir, 'notices.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const frame = (at) => ({ type: 'revoke', fp: 'aa'.repeat(16), at, sig: 's' })

describe('pending notices', () => {
  it('keeps one per person, newest wins, and hands it over once', () => {
    keepPending(file, 'ana', frame(1), 1)
    keepPending(file, 'ana', frame(2), 2)
    keepPending(file, 'ben', frame(2), 2)
    expect(takePending(file, 'ana', 3)).toEqual(frame(2))
    expect(takePending(file, 'ana', 3)).toBeNull()
    expect(Object.keys(readPending(file, 3))).toEqual(['ben'])
  })

  it('drops a notice older than a week', () => {
    keepPending(file, 'ana', frame(1), 1)
    expect(takePending(file, 'ana', 2 + REVOKE_TTL_MS)).toBeNull()
  })

  it('reads nothing from a missing or broken file', () => {
    expect(readPending(file, 1)).toEqual({})
    writeFileSync(file, '{nope')
    expect(readPending(file, 1)).toEqual({})
  })
})
