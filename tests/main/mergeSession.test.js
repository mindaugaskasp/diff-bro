import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beginMerge, endMerge, mergeInProgress, writeMerged } from '../../src/main/mergeSession'

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
