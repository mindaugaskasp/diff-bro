import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  beginMerge,
  cancelMerge,
  doneSentinel,
  endMerge,
  mergeInProgress,
  releaseLauncher,
  writeMerged
} from '../../src/main/mergeSession'

const dirs = []
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  endMerge()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('writeMerged', () => {
  // The whole point of the fence: with no launch there is no path, so there is
  // nothing to write over, whatever arrives.
  it('writes nothing at all when no mergetool launch is in progress', () => {
    expect(writeMerged('anything')).toEqual({ ok: false, error: 'no-merge' })
  })

  it('writes the text to the path the launch named', () => {
    const dir = scratch()
    const merged = join(dir, 'app.js')
    writeFileSync(merged, '<<<<<<< HEAD\n')
    beginMerge({ merged, local: join(dir, 'l'), remote: join(dir, 'r') })
    expect(writeMerged('resolved\n')).toEqual({ ok: true, path: merged })
    expect(readFileSync(merged, 'utf8')).toBe('resolved\n')
  })

  it('refuses anything that is not text', () => {
    const dir = scratch()
    beginMerge({ merged: join(dir, 'a.js'), local: '', remote: '' })
    expect(writeMerged({ path: '/etc/passwd' })).toEqual({ ok: false, error: 'not-text' })
    expect(writeMerged(null).ok).toBe(false)
  })

  // A second write would be a second file: once the merge is handed back, the
  // session is over.
  it('is spent once used', () => {
    const dir = scratch()
    const merged = join(dir, 'a.js')
    beginMerge({ merged, local: '', remote: '' })
    expect(writeMerged('one').ok).toBe(true)
    expect(writeMerged('two')).toEqual({ ok: false, error: 'no-merge' })
    expect(readFileSync(merged, 'utf8')).toBe('one')
  })

  it('reports a path it cannot write rather than throwing', () => {
    beginMerge({ merged: join(scratch(), 'no', 'such', 'dir', 'a.js'), local: '', remote: '' })
    const res = writeMerged('x')
    expect(res.ok).toBe(false)
    expect(res.error).not.toBe('no-merge')
  })

  it('says whether a merge is waiting, for the window that asks', () => {
    expect(mergeInProgress()).toBeNull()
    beginMerge({ merged: '/tmp/a', local: '/tmp/l', remote: '/tmp/r' })
    expect(mergeInProgress().merged).toBe('/tmp/a')
    endMerge()
    expect(mergeInProgress()).toBeNull()
  })
})

// The reader declining is an answer. Without it the launcher waited on a
// decision that was never coming, and the path stayed armed for the life of the
// process — so a later writeMerged still overwrote the file.
describe('cancelMerge', () => {
  it('spends the session, so a later write does nothing', () => {
    const dir = scratch()
    const merged = join(dir, 'app.js')
    writeFileSync(merged, 'original\n')
    beginMerge({ merged, local: '', remote: '' })
    expect(cancelMerge()).toEqual({ ok: true })
    expect(writeMerged('OVERWRITE')).toEqual({ ok: false, error: 'no-merge' })
    expect(readFileSync(merged, 'utf8')).toBe('original\n')
  })

  it('leaves the file itself untouched', () => {
    const dir = scratch()
    const merged = join(dir, 'app.js')
    writeFileSync(merged, '<<<<<<< HEAD\n')
    beginMerge({ merged, local: '', remote: '' })
    cancelMerge()
    expect(readFileSync(merged, 'utf8')).toBe('<<<<<<< HEAD\n')
  })

  // The launcher is blocked on this file; without it `git mergetool` hangs.
  it('releases the launcher, saying which answer it was', () => {
    const dir = scratch()
    const merged = join(dir, 'app.js')
    beginMerge({ merged, local: '', remote: '' })
    cancelMerge()
    expect(readFileSync(doneSentinel(merged), 'utf8')).toBe('cancelled')
  })

  it('is a no-op when nothing is in progress', () => {
    expect(cancelMerge()).toEqual({ ok: false })
  })
})

describe('the sentinel a successful write leaves', () => {
  it('tells the launcher the merge really was written', () => {
    const dir = scratch()
    const merged = join(dir, 'app.js')
    beginMerge({ merged, local: '', remote: '' })
    writeMerged('resolved\n')
    expect(readFileSync(doneSentinel(merged), 'utf8')).toBe('written')
  })

  // A resolution that happens to write the SAME bytes back changes neither size
  // nor timestamp — which is why the launcher watches a sentinel and not the
  // file itself.
  it('appears even when the resolved text is identical to the original', () => {
    const dir = scratch()
    const merged = join(dir, 'app.js')
    writeFileSync(merged, 'same\n')
    beginMerge({ merged, local: '', remote: '' })
    writeMerged('same\n')
    expect(existsSync(doneSentinel(merged))).toBe(true)
  })
})

describe('releaseLauncher', () => {
  // A file answered OUT OF ORDER still gets a launch of its own later, and that
  // launch has no session to spend: it is released before any window is shown.
  // Without this the terminal running `git mergetool` waits out the launcher's
  // two hours on a decision that was already made.
  it('releases a launch that has no session behind it', () => {
    const dir = scratch()
    const merged = join(dir, 'already-done.js')
    expect(mergeInProgress()).toBe(null)
    expect(releaseLauncher(merged, 'written')).toBe(true)
    expect(readFileSync(doneSentinel(merged), 'utf8')).toBe('written')
  })

  it('reports a sentinel it could not write rather than throwing', () => {
    expect(releaseLauncher(join(scratch(), 'no', 'such', 'dir', 'f.js'), 'written')).toBe(false)
  })
})
