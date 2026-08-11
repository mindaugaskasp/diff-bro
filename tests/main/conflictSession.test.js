// Custody of the conflict list, over real repositories — this module holds BOTH
// write paths and decides which file a Save lands on, and it is where two
// data-loss bugs lived: a row left armed from a previous repository, and a Save
// that wrote the right file but never released git.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  conflictRows,
  endConflictSession,
  indexOfRel,
  isResolvedRel,
  locate,
  openConflictAt,
  openConflictSession,
  openRel,
  takeSideAt,
  writeConflictText
} from '../../src/main/conflictSession'

const dirs = []
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@e',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@e'
}

// Two conflicted files, so out-of-order answering has somewhere to go wrong.
function conflictedRepo(names = ['alpha.txt', 'beta.txt']) {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-session-'))
  dirs.push(dir)
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, env: { ...process.env, ...GIT_ENV } })
  const write = (name, body) => {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), body)
  }
  git('init', '-q', '-b', 'main')
  for (const name of names) write(name, 'top\nbase\nbottom\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  for (const name of names) write(name, `top\ntheirs ${name}\nbottom\n`)
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  for (const name of names) write(name, `top\nours ${name}\nbottom\n`)
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected: this is the conflict under test.
  }
  return { dir, git, path: (name) => join(dir, name) }
}

beforeEach(() => endConflictSession())

afterEach(() => {
  endConflictSession()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('locate', () => {
  // The rel is what everything downstream is addressed by, and it must be git's
  // own spelling: Windows hands out an 8.3 temp path where git answers with the
  // long one, and deriving it from path.relative produced a `..` the fence then
  // rejected — so the list never opened there at all.
  it('finds the repository holding a mergetool’s file, and where it sits', async () => {
    const repo = conflictedRepo()
    const found = await locate(repo.path('alpha.txt'))
    expect(found).toMatchObject({ rel: 'alpha.txt' })
    expect(found.root).toBeTruthy()
  })

  it('spells a file in a subdirectory the way git does', async () => {
    const repo = conflictedRepo(['nested/deep/gamma.txt'])
    const found = await locate(repo.path(join('nested', 'deep', 'gamma.txt')))
    expect(found).toMatchObject({ rel: 'nested/deep/gamma.txt' })
  })

  it('answers null for a file outside any repository', async () => {
    const loose = mkdtempSync(join(tmpdir(), 'diffbro-loose-'))
    dirs.push(loose)
    writeFileSync(join(loose, 'loose.txt'), 'x\n')
    expect(await locate(join(loose, 'loose.txt'))).toBe(null)
  })
})

describe('the list', () => {
  it('carries no path — only what a row displays', async () => {
    const repo = conflictedRepo()
    await openConflictSession(repo.dir)
    const rows = conflictRows()
    expect(rows).toHaveLength(2)
    expect(Object.keys(rows[0]).sort()).toEqual(['dir', 'name', 'state', 'tally'])
    expect(rows.map((r) => r.name)).toEqual(['alpha.txt', 'beta.txt'])
  })
})

describe('takeSideAt', () => {
  it('writes a whole side out of the index and settles the row', async () => {
    const repo = conflictedRepo()
    await openConflictSession(repo.dir)
    expect(await takeSideAt({ index: 1, side: 'theirs' })).toEqual({ ok: true, rel: 'beta.txt' })
    expect(readFileSync(repo.path('beta.txt'), 'utf8')).toBe('top\ntheirs beta.txt\nbottom\n')
    expect(isResolvedRel('beta.txt')).toBe(true)
  })

  // The list can go stale between the dialog opening and the click.
  it('refuses a row git no longer calls conflicted', async () => {
    const repo = conflictedRepo()
    await openConflictSession(repo.dir)
    repo.git('add', 'beta.txt')
    expect(await takeSideAt({ index: 1, side: 'ours' })).toEqual({ ok: false, error: 'gone' })
  })

  it('refuses an index that is not a row', async () => {
    const repo = conflictedRepo()
    await openConflictSession(repo.dir)
    for (const index of [-1, 99, 1.5, '0', null, undefined]) {
      expect(await takeSideAt({ index, side: 'ours' })).toEqual({ ok: false, error: 'gone' })
    }
  })
})

describe('openConflictAt and the row a Save lands on', () => {
  it('remembers which row is open, and gives the view its three sides', async () => {
    const repo = conflictedRepo()
    await openConflictSession(repo.dir)
    const payload = await openConflictAt(1)
    expect(payload).toMatchObject({ ok: true, fileName: 'beta.txt', position: 2, total: 2 })
    expect(payload.ours).toBe('top\nours beta.txt\nbottom\n')
    expect(payload.theirs).toBe('top\ntheirs beta.txt\nbottom\n')
    expect(openRel()).toBe('beta.txt')
  })

  it('writes the row that is open, not the one git asked about', async () => {
    const repo = conflictedRepo()
    await openConflictSession(repo.dir)
    await openConflictAt(1)
    expect(await writeConflictText('resolved beta\n')).toEqual({ ok: true })
    expect(readFileSync(repo.path('beta.txt'), 'utf8')).toBe('resolved beta\n')
    expect(readFileSync(repo.path('alpha.txt'), 'utf8')).toContain('<<<<<<<')
  })

  // THE DATA-LOSS BUG. A mergetool launch for a file in no repository left the
  // PREVIOUS repository's row armed, so the next Save wrote that repo's file
  // with text the reader typed for a different one — silently, and destroying
  // the conflict that was there.
  it('forgets the open row when a launch has no repository behind it', async () => {
    const repo = conflictedRepo()
    await openConflictSession(repo.dir)
    await openConflictAt(1)
    endConflictSession()
    expect(openRel()).toBe(null)
    expect(await writeConflictText('text meant for somewhere else\n')).toEqual({
      ok: false,
      error: 'no-merge'
    })
    expect(readFileSync(repo.path('beta.txt'), 'utf8')).toContain('<<<<<<<')
  })

  // A second repository must not inherit the first one's open row either.
  it('forgets the open row when the walk moves to another repository', async () => {
    const first = conflictedRepo()
    await openConflictSession(first.dir)
    await openConflictAt(1)
    const second = conflictedRepo(['gamma.txt'])
    await openConflictSession(second.dir)
    expect(openRel()).toBe(null)
    expect(await writeConflictText('x\n')).toEqual({ ok: false, error: 'no-merge' })
    expect(readFileSync(first.path('beta.txt'), 'utf8')).toContain('<<<<<<<')
  })

  it('refuses to open a row that cannot be read as text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'diffbro-session-bin-'))
    dirs.push(dir)
    const git = (...a) => execFileSync('git', a, { cwd: dir, env: { ...process.env, ...GIT_ENV } })
    git('init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'blob.bin'), Buffer.from([0x01, 0x00, 0x02]))
    git('add', '.')
    git('commit', '-qm', 'base')
    git('checkout', '-qb', 'feature')
    writeFileSync(join(dir, 'blob.bin'), Buffer.from([0x03, 0x00, 0x04]))
    git('commit', '-qam', 'theirs')
    git('checkout', '-q', 'main')
    writeFileSync(join(dir, 'blob.bin'), Buffer.from([0x05, 0x00, 0x06]))
    git('commit', '-qam', 'ours')
    try {
      git('merge', 'feature')
    } catch {
      // Expected.
    }
    await openConflictSession(dir)
    expect(conflictRows()[0].state).toBe('blocked')
    expect(await openConflictAt(0)).toEqual({ ok: false, error: 'blocked' })
  })

  // "Binary — pick a side" is what the row says, so it has to be true. git's
  // stage comes back as a lossy UTF-8 decode unless it is read as bytes.
  it('answers a binary row from the index, byte for byte', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'diffbro-session-bin2-'))
    dirs.push(dir)
    const git = (...a) => execFileSync('git', a, { cwd: dir, env: { ...process.env, ...GIT_ENV } })
    const theirs = Buffer.from([0x89, 0x50, 0x00, 0xff, 0xfe, 0x0a])
    git('init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01]))
    git('add', '.')
    git('commit', '-qm', 'base')
    git('checkout', '-qb', 'feature')
    writeFileSync(join(dir, 'logo.png'), theirs)
    git('commit', '-qam', 'theirs')
    git('checkout', '-q', 'main')
    writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x07]))
    git('commit', '-qam', 'ours')
    try {
      git('merge', 'feature')
    } catch {
      // Expected.
    }
    await openConflictSession(dir)
    expect(await takeSideAt({ index: 0, side: 'theirs' })).toMatchObject({ ok: true })
    expect(readFileSync(join(dir, 'logo.png')).equals(theirs)).toBe(true)
  })
})

// git escapes a non-ASCII path in its own output unless told not to. Read back
// as `"\303\274..."` the row shows octal, is misclassified, and the launch's own
// file cannot be found in the list at all.
describe('a path git would otherwise escape', () => {
  it('lists a non-ASCII filename as itself', async () => {
    const name = 'ünïcødé-文件.txt'
    const repo = conflictedRepo([name, 'alpha.txt'])
    await openConflictSession(repo.dir)
    expect(conflictRows().map((r) => r.name)).toContain(name)
    expect(indexOfRel(name)).toBeGreaterThanOrEqual(0)
    expect(conflictRows().find((r) => r.name === name).state).toBe('open')
  })
})
