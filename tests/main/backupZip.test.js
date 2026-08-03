import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { BACKUP_ENTRY, checkDestination, writeBackupZip } from '../../src/main/backupZip'

let work
let dataDir

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'diffbro-bzip-'))
  dataDir = join(work, 'data')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(work, { recursive: true, force: true }))

// The destination is a path typed into a shell — the one input here that the
// app did not choose.
describe('checkDestination', () => {
  it('accepts a writable path whose parent exists', () => {
    expect(checkDestination(join(work, 'backup.zip'), dataDir)).toBe(null)
  })

  it('refuses a directory', () => {
    expect(checkDestination(dataDir, dataDir)).toMatch(/directory/i)
  })

  it('refuses a parent that does not exist rather than creating one', () => {
    expect(checkDestination(join(work, 'nope', 'backup.zip'), dataDir)).toMatch(/does not exist/i)
  })

  // Writing the backup into the directory being backed up grows the next one.
  it('refuses a destination inside the data directory', () => {
    expect(checkDestination(join(dataDir, 'backup.zip'), dataDir)).toMatch(/inside/i)
    expect(checkDestination(join(dataDir, 'nested', 'b.zip'), dataDir)).toMatch(/inside|exist/i)
  })

  // "/…/data" and "/…/database.zip" share a prefix but one is not inside the other.
  it('does not mistake a sibling sharing the directory’s name prefix for inside', () => {
    expect(checkDestination(join(work, 'database.zip'), dataDir)).toBe(null)
  })

  it('refuses to overwrite an existing file silently', () => {
    const target = join(work, 'taken.zip')
    writeFileSync(target, 'x')
    expect(checkDestination(target, dataDir)).toMatch(/already exists/i)
  })

  it('refuses an empty path', () => {
    expect(checkDestination('', dataDir)).toMatch(/path/i)
  })
})

describe('writeBackupZip', () => {
  it('writes a real zip holding the sealed envelope', () => {
    const target = join(work, 'backup.zip')
    const sealed = 'c2VhbGVkLWJsb2I='
    const res = writeBackupZip(target, sealed, dataDir)
    expect(res).toEqual({ ok: true, path: target })

    const files = unzipSync(new Uint8Array(readFileSync(target)))
    expect(Object.keys(files)).toEqual([BACKUP_ENTRY])
    expect(Buffer.from(files[BACKUP_ENTRY]).toString('utf8')).toBe(sealed)
  })

  it('reports the destination error instead of writing', () => {
    const res = writeBackupZip(dataDir, 'blob', dataDir)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/directory/i)
  })

  // A sealed blob is base64, so it deflates; the container is not just a wrapper.
  it('compresses rather than storing', () => {
    const target = join(work, 'big.zip')
    writeBackupZip(target, 'A'.repeat(200_000), dataDir)
    expect(readFileSync(target).length).toBeLessThan(20_000)
  })
})
