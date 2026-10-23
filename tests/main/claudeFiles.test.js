import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendFileSync, mkdtempSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ACTIVITY_SHOWN,
  appendActivity,
  claudePaths,
  clearActivity,
  readActivity,
  readGrantRecord,
  writeGrantRecord
} from '../../src/main/claudeFiles'

let dir
let paths
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'claude-files-'))
  paths = claudePaths(dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('claude connection files', () => {
  it('roundtrips the grant record, and reads a missing one as null', () => {
    expect(readGrantRecord(paths.grant)).toBeNull()
    writeGrantRecord(paths.grant, { enabled: true })
    expect(readGrantRecord(paths.grant)).toEqual({ enabled: true })
  })

  it('reads activity newest first, skipping a torn line', () => {
    appendActivity(paths.activity, { at: 1, tool: 'a', item: null })
    appendFileSync(paths.activity, '{"at":\n')
    appendActivity(paths.activity, { at: 2, tool: 'b', item: 'x' })
    expect(readActivity(paths.activity).map((e) => e.tool)).toEqual(['b', 'a'])
  })

  it('trims a long log down to what is shown', () => {
    const line = { at: 1, tool: 'list_snippets', item: 'n'.repeat(200) }
    for (let i = 0; i < 1500; i++) appendActivity(paths.activity, line)
    expect(readActivity(paths.activity)).toHaveLength(ACTIVITY_SHOWN)
    expect(statSync(paths.activity).size).toBeLessThan(256 * 1024)
  })

  it('clears the log, and reads nothing afterwards', () => {
    appendActivity(paths.activity, { at: 1, tool: 'a', item: null })
    clearActivity(paths.activity)
    expect(readActivity(paths.activity)).toEqual([])
  })
})
