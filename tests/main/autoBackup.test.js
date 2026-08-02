// Backups exist for the failure that gives no warning: a store file going bad.
// Two rules carry the whole feature — several generations are kept (a backup
// taken AFTER the corruption must not be the only one), and an expiring diff is
// never captured (restoring one later would undo the expiry the reader chose).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_WINDOW_HOURS,
  KEEP_GENERATIONS,
  MAX_WINDOW_HOURS,
  MIN_WINDOW_HOURS,
  backupName,
  backupPayload,
  backupTime,
  clampWindowHours,
  isDue,
  listBackups,
  pruneOlderThan,
  readBackup,
  rotate,
  writeBackup
} from '../../src/main/autoBackup'

const HOUR = 3600_000
const entry = (id, expiresAt) => ({ id, name: id, expiresAt, iv: 'x', data: 'y' })
const VAULT = { entries: [entry('kept', null), entry('expiring', Date.now() + HOUR)] }
const SNIPPETS = { tags: { a: { color: '#fff', rank: 1 } }, entries: [{ id: 's1', name: 'note' }] }

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'diffbro-backup-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('backupPayload', () => {
  // The reader asked those diffs to die. A backup that resurrects them months
  // later is a broken promise, not a recovered file.
  it('keeps only the diffs that were kept, never the expiring ones', () => {
    const p = backupPayload(VAULT, SNIPPETS, 1000)
    expect(p.vault.entries.map((e) => e.id)).toEqual(['kept'])
  })

  it('carries snippets whole, tags and all', () => {
    const p = backupPayload(VAULT, SNIPPETS, 1000)
    expect(p.snippets.entries).toHaveLength(1)
    expect(p.snippets.tags.a.color).toBe('#fff')
  })

  // The ciphertext is copied verbatim: no key is touched, so a restore hands
  // back entries whose AAD bindings still hold.
  it('copies entries verbatim rather than re-encoding them', () => {
    const p = backupPayload(VAULT, SNIPPETS, 1000)
    expect(p.vault.entries[0]).toEqual(VAULT.entries[0])
  })

  it('survives a missing or empty store', () => {
    const p = backupPayload(null, undefined, 1000)
    expect(p.vault.entries).toEqual([])
    expect(p.snippets.entries).toEqual([])
  })
})

describe('the window', () => {
  it('is clamped to the offered range, whatever the settings file says', () => {
    expect(clampWindowHours(0)).toBe(MIN_WINDOW_HOURS)
    expect(clampWindowHours(999)).toBe(MAX_WINDOW_HOURS)
    expect(clampWindowHours('nonsense')).toBe(DEFAULT_WINDOW_HOURS)
    expect(clampWindowHours(6)).toBe(6)
  })

  it('is always due when nothing has been backed up yet', () => {
    expect(isDue(null, 6, Date.now())).toBe(true)
  })

  it('holds off until the window has elapsed', () => {
    const now = Date.now()
    expect(isDue(now - 5 * HOUR, 6, now)).toBe(false)
    expect(isDue(now - 6 * HOUR, 6, now)).toBe(true)
  })

  // A hand-edited settings file must not be able to widen it.
  it('clamps the window it is judged against', () => {
    const now = Date.now()
    expect(isDue(now - 25 * HOUR, 9999, now)).toBe(true)
  })
})

describe('names', () => {
  it('sort chronologically as plain strings, which is what rotation relies on', () => {
    const a = backupName(Date.UTC(2026, 0, 1, 3, 4, 5))
    const b = backupName(Date.UTC(2026, 0, 1, 3, 4, 6))
    expect([b, a].sort()).toEqual([a, b])
  })

  it('round-trip to the moment they were taken', () => {
    const at = Date.UTC(2026, 7, 1, 12, 30, 45)
    expect(backupTime(backupName(at))).toBe(at)
  })

  it('refuse anything that is not one of ours', () => {
    for (const junk of ['vault.json', '../../etc/passwd', 'diffbro-backup-nope.json', '']) {
      expect(backupTime(junk)).toBeNull()
    }
  })
})

describe('writeBackup and rotate', () => {
  it('writes a readable backup and lists it', () => {
    const res = writeBackup({ dir, vault: VAULT, snippets: SNIPPETS, at: Date.now() })
    expect(res.ok).toBe(true)
    expect(listBackups(dir)).toHaveLength(1)
    const back = readBackup(dir, res.name)
    expect(back.ok).toBe(true)
    expect(back.vault.entries.map((e) => e.id)).toEqual(['kept'])
  })

  // The whole point of more than one: a backup taken after the damage must not
  // be the only copy left.
  it('keeps several generations, dropping only the oldest', () => {
    const base = Date.UTC(2026, 0, 1)
    for (let i = 0; i < KEEP_GENERATIONS + 3; i++) {
      writeBackup({ dir, vault: VAULT, snippets: SNIPPETS, at: base + i * HOUR })
    }
    const kept = listBackups(dir)
    expect(kept).toHaveLength(KEEP_GENERATIONS)
    // Newest first, and the survivors are the newest ones.
    expect(kept[0].at).toBe(base + (KEEP_GENERATIONS + 2) * HOUR)
    expect(kept.at(-1).at).toBe(base + 3 * HOUR)
  })

  it('leaves files that are not backups alone', () => {
    writeFileSync(join(dir, 'vault.json'), '{}')
    writeBackup({ dir, vault: VAULT, snippets: SNIPPETS, at: Date.now() })
    rotate(dir, 0)
    expect(readFileSync(join(dir, 'vault.json'), 'utf8')).toBe('{}')
    expect(listBackups(dir)).toHaveLength(0)
  })

  it('reports rather than throws when the directory cannot be written', () => {
    const res = writeBackup({ dir: '/proc/nope/nested', vault: VAULT, snippets: SNIPPETS })
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('lists nothing for a directory that does not exist', () => {
    expect(listBackups(join(dir, 'missing'))).toEqual([])
  })
})

describe('readBackup', () => {
  it('refuses a file that is not a backup, by name or by shape', () => {
    expect(readBackup(dir, 'vault.json').ok).toBe(false)
    const name = backupName(Date.now())
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, name), JSON.stringify({ format: 'something-else' }))
    expect(readBackup(dir, name)).toEqual({ ok: false, error: 'not-a-backup' })
  })

  it('refuses unreadable or corrupt contents', () => {
    const name = backupName(Date.now())
    writeFileSync(join(dir, name), 'not json at all')
    expect(readBackup(dir, name)).toEqual({ ok: false, error: 'unreadable' })
    expect(readBackup(dir, backupName(Date.now() - HOUR)).ok).toBe(false)
  })
})

// The manual lever beside rotate()'s automatic generation count: backups pile up
// on a clock, and the only alternative was deleting files by hand in a folder
// holding the reader's keys.
describe('pruneOlderThan', () => {
  const DAY = 86_400_000
  const put = (at, bytes = 10) => {
    const name = backupName(at)
    writeFileSync(join(dir, name), 'x'.repeat(bytes))
    return name
  }

  it('removes what is past the cutoff and keeps what is not', () => {
    const now = Date.UTC(2026, 0, 20)
    const old = put(now - 10 * DAY)
    const recent = put(now - 2 * DAY)

    const res = pruneOlderThan(dir, 7, now)

    expect(res.removed).toBe(1)
    expect(listBackups(dir).map((b) => b.name)).toEqual([recent])
    expect(res.freed).toBeGreaterThan(0)
    expect(old).not.toBe(recent)
  })

  // The folder holds the reader's data. A prune that deleted whatever it found
  // there would be a different, much worse feature.
  it('touches nothing that is not one of its own backups', () => {
    const now = Date.UTC(2026, 0, 20)
    put(now - 30 * DAY)
    writeFileSync(join(dir, 'notes.txt'), 'not a backup')
    writeFileSync(join(dir, 'vault.json'), '{}')

    const res = pruneOlderThan(dir, 7, now)

    expect(res.removed).toBe(1)
    expect(readFileSync(join(dir, 'notes.txt'), 'utf8')).toBe('not a backup')
    expect(readFileSync(join(dir, 'vault.json'), 'utf8')).toBe('{}')
  })

  it('reports the bytes it freed, so the button can say so first', () => {
    const now = Date.UTC(2026, 0, 20)
    put(now - 10 * DAY, 300)
    put(now - 11 * DAY, 200)
    expect(pruneOlderThan(dir, 7, now)).toMatchObject({ removed: 2, freed: 500 })
  })

  it('is a no-op on a missing folder or a nonsense age', () => {
    expect(pruneOlderThan(join(dir, 'nope'), 7)).toEqual({ removed: 0, freed: 0 })
    const now = Date.now()
    put(now - 100 * 86_400_000)
    expect(pruneOlderThan(dir, 0, now)).toEqual({ removed: 0, freed: 0 })
    expect(pruneOlderThan(dir, -5, now)).toEqual({ removed: 0, freed: 0 })
    expect(pruneOlderThan(dir, 'week', now)).toEqual({ removed: 0, freed: 0 })
  })
})
