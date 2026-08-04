import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, sep } from 'node:path'
import { demoPayloads, ensureDemoFiles } from '../../src/main/demoContent'

let root

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'diffbro-demo-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the tour demo pair', () => {
  it('writes both files and returns their paths', () => {
    const paths = ensureDemoFiles(root)
    expect(paths).toHaveLength(2)
    for (const path of paths) expect(readFileSync(path, 'utf8')).toBeTruthy()
  })

  it('is valid JSON on both sides — the step opens them as a JSON comparison', () => {
    const [left, right] = ensureDemoFiles(root).map((p) => JSON.parse(readFileSync(p, 'utf8')))
    expect(left.version).not.toBe(right.version)
    expect(Object.keys(right)).toContain('experimental')
  })

  it('never overwrites an edited demo file — once written it is the user’s', () => {
    const [left] = ensureDemoFiles(root)
    writeFileSync(left, '{ "mine": true }', 'utf8')
    ensureDemoFiles(root)
    expect(JSON.parse(readFileSync(left, 'utf8'))).toStrictEqual({ mine: true })
  })

  it('is safe to call repeatedly — and leaves the bytes on disk alone', () => {
    const first = ensureDemoFiles(root)
    const before = first.map((p) => statSync(p).mtimeMs)
    expect(ensureDemoFiles(root)).toStrictEqual(first)
    // Comparing the returned paths alone passed with every fs call deleted.
    expect(first.map((p) => statSync(p).mtimeMs)).toStrictEqual(before)
    for (const p of first) expect(readFileSync(p, 'utf8')).toBeTruthy()
  })

  it('hands the renderer the contents, so nothing has to be read back', () => {
    const payloads = demoPayloads(root)
    expect(payloads).toHaveLength(2)
    for (const p of payloads) {
      expect(p.content).toBeTruthy()
      expect(() => JSON.parse(p.content)).not.toThrow()
    }
    expect(payloads[0].name).toBe('demo-config-v1.json')
  })

  it('writes under a demo/ subdirectory, never beside the real data files', () => {
    for (const path of ensureDemoFiles(root)) {
      expect(path.startsWith(join(root, 'demo') + sep)).toBe(true)
      expect(basename(path).startsWith('demo-')).toBe(true)
    }
  })
})
