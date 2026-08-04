import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEMO_FILES, demoPayloads, ensureDemoFiles } from '../../src/main/demoFiles'

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

  it('is safe to call repeatedly', () => {
    expect(ensureDemoFiles(root)).toStrictEqual(ensureDemoFiles(root))
  })

  it('hands the renderer contents, never a path to read back', () => {
    const payloads = demoPayloads(root)
    expect(payloads).toHaveLength(2)
    for (const p of payloads) {
      expect(p.content).toBeTruthy()
      expect(() => JSON.parse(p.content)).not.toThrow()
    }
    // file:read refuses anything under the data dir; the renderer must never
    // need to ask for one of these by path.
    expect(payloads[0].name).toBe('demo-config-v1.json')
  })

  it('names files that cannot be mistaken for the user’s own', () => {
    for (const { name } of DEMO_FILES) expect(name.startsWith('demo-')).toBe(true)
  })
})
