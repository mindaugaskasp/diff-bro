// Handing a typed draft to an already-running app. It cannot ride in the
// single-instance payload: Chromium's POSIX singleton mis-sizes that buffer, so
// a body holding whitespace and any character above U+00FF KILLED the running
// app and lost the command. A short ASCII path travels; the draft goes in a
// file beside it.
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDraftFile, sweepDraftFiles, writeDraftFile } from '../../src/main/cliDraft'

const draft = {
  name: 'Café ✓ Привет',
  language: 'sql',
  content: 'select 1;\n— dash',
  tags: ['cli']
}

describe('writeDraftFile', () => {
  it('gives back a path that is short and pure ASCII', () => {
    const path = writeDraftFile(draft)
    expect(path).toMatch(/^[\x20-\x7e]+$/)
    expect(path.length).toBeLessThan(200)
    expect(existsSync(path)).toBe(true)
    readDraftFile(path)
  })

  // The body is snippet plaintext sitting in the OS temp dir, so it is readable
  // by nobody else and lives for the length of one hand-off.
  it('is readable only by its owner', () => {
    const path = writeDraftFile(draft)
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o077).toBe(0)
    readDraftFile(path)
  })
})

describe('readDraftFile', () => {
  it('round-trips a draft whose text is what broke the payload', () => {
    expect(readDraftFile(writeDraftFile(draft))).toEqual(draft)
  })

  it('deletes the file, so plaintext does not outlive the hand-off', () => {
    const path = writeDraftFile(draft)
    readDraftFile(path)
    expect(existsSync(path)).toBe(false)
  })

  // The path arrives from another process. It is untrusted input, so it is
  // checked against our own staging shape before anything is opened.
  it('refuses a path that is not one of ours', () => {
    const outside = join(mkdtempSync(join(tmpdir(), 'not-ours-')), 'draft.json')
    writeFileSync(outside, JSON.stringify(draft))
    expect(readDraftFile(outside)).toBeNull()
    // …and leaves it alone rather than deleting a stranger's file.
    expect(existsSync(outside)).toBe(true)
  })

  it('refuses a missing path, and anything that is not a draft', () => {
    expect(readDraftFile('/nowhere/at/all.json')).toBeNull()
    expect(readDraftFile(null)).toBeNull()
    const path = writeDraftFile(draft)
    writeFileSync(path, 'not json')
    expect(readDraftFile(path)).toBeNull()
  })

  it('refuses a draft missing the fields the store needs', () => {
    const path = writeDraftFile(draft)
    writeFileSync(path, JSON.stringify({ name: 'x' }))
    expect(readDraftFile(path)).toBeNull()
  })
})

describe('the file is bounded', () => {
  it('refuses a body far larger than a snippet', () => {
    const path = writeDraftFile(draft)
    writeFileSync(path, JSON.stringify({ ...draft, content: 'x'.repeat(40_000_000) }))
    expect(readDraftFile(path)).toBeNull()
  })
})

it('reads back a large but legitimate body — the payload limit no longer applies', () => {
  const big = { ...draft, content: 'select 1;\n'.repeat(20_000) }
  expect(readDraftFile(writeDraftFile(big)).content).toBe(big.content)
})

// A CLI running right now has a fresh file, and the launch sweep must not take
// it — that would lose the very draft someone is typing.
describe('sweepDraftFiles', () => {
  it('leaves a draft written moments ago alone', () => {
    const path = writeDraftFile(draft)
    sweepDraftFiles()
    expect(existsSync(path)).toBe(true)
    readDraftFile(path)
  })

  it('takes one old enough to be a crash leftover', () => {
    const path = writeDraftFile(draft)
    sweepDraftFiles(Date.now() + 60 * 60 * 1000)
    expect(existsSync(path)).toBe(false)
  })
})
