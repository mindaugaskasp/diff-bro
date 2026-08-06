import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The Windows copy shells out to PowerShell (hard rule 7). These lock the two
// invariants that keep it safe: the staged path reaches the subprocess ONLY
// through the environment, never a command-line argument, and a spawn failure
// fails CLOSED rather than leaving a half-written clipboard.
let execFileImpl
const calls = []

vi.mock('node:child_process', () => {
  const execFile = (command, args, options, cb) => {
    calls.push({ command, args, options })
    return execFileImpl(command, args, options, cb)
  }
  return { execFile, default: { execFile } }
})
vi.mock('electron', () => ({
  app: { on: () => {} },
  clipboard: { clear: () => {}, writeBuffer: () => {} },
  ipcMain: { handle: () => {} }
}))
vi.mock('../../src/main/clipboardStage', () => ({
  stageFile: () => Promise.resolve({ ok: false }),
  sweepStage: () => {}
}))

const { copyPathToClipboard } = await import('../../src/main/clipboardCopy')

const realPlatform = process.platform
const setPlatform = (p) =>
  Object.defineProperty(process, 'platform', { value: p, configurable: true })

describe('copyPathToClipboard on Windows', () => {
  beforeEach(() => {
    calls.length = 0
    execFileImpl = (_c, _a, _o, cb) => cb(null, { stdout: '', stderr: '' })
    setPlatform('win32')
  })
  afterEach(() => setPlatform(realPlatform))

  it('passes the staged path via the environment, never as an argument', async () => {
    const path = 'C:\\Users\\me\\c-ab12\\report.md" ; Remove-Item C:\\'
    const res = await copyPathToClipboard(path)

    expect(res).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    const { command, args, options } = calls[0]
    expect(command).toBe('powershell.exe')
    // The path — even one carrying shell metacharacters — rides in the env…
    expect(options.env.DIFFBRO_CLIP_PATH).toBe(path)
    // …and appears NOWHERE on the command line, so it cannot inject.
    expect(args.join(' ')).not.toContain('report.md')
    expect(args.join(' ')).not.toContain('Remove-Item')
    // No shell interpolation layer, and the run is bounded.
    expect(options.shell).toBeFalsy()
    expect(options.timeout).toBeGreaterThan(0)
  })

  it('fails closed when PowerShell is missing or Constrained Language Mode blocks it', async () => {
    execFileImpl = (_c, _a, _o, cb) => cb(new Error('cannot run in this language mode'))
    const res = await copyPathToClipboard('C:\\staged\\x.txt')
    expect(res.error).toBe('clipboard-failed')
  })
})
