import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { readdir, stat, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

let tempRoot
vi.mock('electron', () => ({
  app: { getPath: () => tempRoot, on: vi.fn() }
}))

const { STAGE_TTL_MS, safeName, stageFile, sweepStage } =
  await import('../../src/main/clipboardStage')

// mkdtemp names the directory, so find it by prefix rather than by path.
const stageDirs = () => readdirSync(tempRoot).filter((n) => n.startsWith('diffbro-clipboard-'))
const stageDir = () => join(tempRoot, stageDirs()[0])

beforeEach(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'diffbro-stage-test-'))
  // The staging dir is cached per process; each test gets a fresh temp root.
  await sweepStage()
})
afterEach(() => {
  rmSync(tempRoot, { force: true, recursive: true })
})

describe('safeName', () => {
  // Rule 6: the display name is user-controlled, so it becomes a filename
  // rather than being trusted as one.
  it('flattens a traversal into a filename', () => {
    expect(safeName('../../.ssh/config')).not.toContain('/')
    expect(safeName('../../.ssh/config')).not.toContain('..')
    expect(safeName('..\\..\\windows\\system32')).not.toContain('\\')
  })

  it('keeps an ordinary name and its extension', () => {
    expect(safeName('config-v2.json')).toBe('config-v2.json')
    expect(safeName('3f9c1ab27de40852.diffbro')).toBe('3f9c1ab27de40852.diffbro')
  })

  it('replaces only what a filesystem genuinely refuses', () => {
    expect(safeName('why not? #1 (final).txt')).toBe('why not- #1 (final).txt')
  })

  // An ASCII-only slug turned every non-Latin title into "diffbro" — the
  // opposite of "the name you gave it".
  it('keeps letters in any script', () => {
    expect(safeName('файл.txt')).toBe('файл.txt')
    expect(safeName('Rūta ir Ąžuolas.md')).toBe('Rūta ir Ąžuolas.md')
    expect(safeName('日本語.json')).toBe('日本語.json')
  })

  // The renderer supplies the name, and an extension tells the OS what to DO
  // with the file. A staged .command in a folder is one double-click from
  // running, so the set is closed rather than sanitised.
  // The user's text is kept — silently deleting it is its own surprise — but
  // the EFFECTIVE extension is always a safe one.
  it('never leaves an executable extension last', () => {
    for (const bad of ['payload.command', 'payload.exe', 'setup.bat', 'x.dylib', 'a.scpt']) {
      expect(safeName(bad).endsWith('.txt'), bad).toBe(true)
    }
    expect(safeName('payload.command')).toBe('payload.command.txt')
  })

  it('refuses a Windows reserved device name', () => {
    expect(safeName('NUL')).toBe('diffbro.txt')
    expect(safeName('con.txt')).toBe('diffbro.txt')
    expect(safeName('LPT1')).toBe('diffbro.txt')
  })

  it('falls back rather than returning an empty name', () => {
    expect(safeName('')).toBe('diffbro.txt')
    expect(safeName('///')).toBe('diffbro.txt')
    expect(safeName(null)).toBe('diffbro.txt')
    expect(safeName('...')).toBe('diffbro.txt')
  })

  it('caps a very long name', () => {
    expect(safeName(`${'a'.repeat(500)}.json`).length).toBeLessThanOrEqual(133)
  })

  it('leaves interior dots alone — they are part of the name, not separators', () => {
    // The trailing word is not a known extension, so .txt is appended.
    expect(safeName('release.notes.for.the.whole.quarter')).toBe(
      'release.notes.for.the.whole.quarter.txt'
    )
    expect(safeName('config.v2.json')).toBe('config.v2.json')
  })
})

describe('stageFile', () => {
  it('writes the bytes and returns the path', async () => {
    const res = await stageFile({ name: 'a.json', bytes: '{"a":1}' })
    expect(res.ok).toBe(true)
    expect(res.path.endsWith('a.json')).toBe(true)
    expect((await stat(res.path)).size).toBe(7)
  })

  it('creates the staging directory 0o700', async () => {
    await stageFile({ name: 'a.json', bytes: 'x' })
    expect((await stat(stageDir())).mode & 0o777).toBe(0o700)
  })

  // The OS temp dir is shared on Linux. A fixed name is one another local user
  // can pre-create, and mkdir(..., { mode }) does NOT chmod an existing
  // directory — so the 0o700 promise would silently not hold. mkdtemp cannot
  // adopt anything, whatever is sitting at the old path.
  it('never adopts a directory it did not create', async () => {
    const squatted = join(tempRoot, 'diffbro-clipboard')
    const victim = mkdtempSync(join(tempRoot, 'victim-'))
    symlinkSync(victim, squatted)

    const res = await stageFile({ name: 'a.json', bytes: 'x' })
    expect(res.ok).toBe(true)
    expect(res.path.startsWith(squatted + '/')).toBe(false)
    expect(res.path.startsWith(victim + '/')).toBe(false)
    expect(readdirSync(victim)).toEqual([])
  })

  it('gives each copy its own slot, so equal names never collide', async () => {
    const a = await stageFile({ name: 'same.json', bytes: 'one' })
    const b = await stageFile({ name: 'same.json', bytes: 'two' })
    expect(a.path).not.toBe(b.path)
    expect(await readdir(stageDir())).toHaveLength(2)
  })

  it('keeps every copy in ONE staging directory per process', async () => {
    await stageFile({ name: 'a.json', bytes: 'x' })
    await stageFile({ name: 'b.json', bytes: 'y' })
    expect(stageDirs()).toHaveLength(1)
  })

  it('refuses empty content rather than staging a zero-byte file', async () => {
    expect(await stageFile({ name: 'a.json', bytes: '' })).toEqual({ error: 'empty' })
    expect(await stageFile({})).toEqual({ error: 'empty' })
  })

  it('refuses content past the size cap', async () => {
    const huge = Buffer.alloc(65 * 1024 * 1024)
    expect(await stageFile({ name: 'a.bin', bytes: huge })).toEqual({ error: 'too-large' })
  })

  it('prunes a staged file older than the TTL when the next one is staged', async () => {
    const old = await stageFile({ name: 'old.json', bytes: 'x' })
    const slot = join(old.path, '..')
    const past = new Date(Date.now() - STAGE_TTL_MS - 60_000)
    await utimes(slot, past, past)

    await stageFile({ name: 'new.json', bytes: 'y' })
    const slots = await readdir(stageDir())
    expect(slots).toHaveLength(1)
    expect(await readdir(join(stageDir(), slots[0]))).toEqual(['new.json'])
  })

  it('keeps a staged file that is still inside the TTL', async () => {
    await stageFile({ name: 'fresh.json', bytes: 'x' })
    await stageFile({ name: 'also-fresh.json', bytes: 'y' })
    expect(await readdir(stageDir())).toHaveLength(2)
  })
})

describe('sweepStage', () => {
  it('removes everything, plaintext included', async () => {
    const staged = await stageFile({ name: 'secret.txt', bytes: 'an api key' })
    await sweepStage()
    await expect(stat(staged.path)).rejects.toThrow()
    expect(stageDirs()).toEqual([])
  })

  // The launch sweep exists because a crash skips will-quit, so it has to reach
  // a directory this process did not create.
  it('removes a staging directory left behind by a previous run', async () => {
    const orphan = mkdtempSync(join(tempRoot, 'diffbro-clipboard-'))
    writeFileSync(join(orphan, 'leftover.txt'), 'plaintext')
    await sweepStage()
    await expect(stat(orphan)).rejects.toThrow()
  })

  // Unlink it, never read or delete THROUGH it.
  it('unlinks a symlink at a staging path without touching its target', async () => {
    const victim = mkdtempSync(join(tempRoot, 'victim-'))
    writeFileSync(join(victim, 'keep.txt'), 'not ours')
    symlinkSync(victim, join(tempRoot, 'diffbro-clipboard-planted'))

    await sweepStage()
    expect(readdirSync(victim)).toEqual(['keep.txt'])
    expect(stageDirs()).toEqual([])
  })

  it('is idempotent, so a sweep on launch after a clean quit is harmless', async () => {
    await expect(sweepStage()).resolves.toBeUndefined()
    await expect(sweepStage()).resolves.toBeUndefined()
  })

  it('does not touch anything outside its own directory', async () => {
    const bystander = join(tempRoot, 'not-ours.txt')
    await writeFile(bystander, 'keep me')
    await stageFile({ name: 'a.json', bytes: 'x' })
    await sweepStage()
    expect((await stat(bystander)).size).toBe(7)
  })
})
