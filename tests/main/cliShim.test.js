import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { delimiter, dirname, join } from 'node:path'
import {
  installShim,
  onPath,
  removeShim,
  shimScript,
  shimStatus,
  shimTarget
} from '../../src/main/cliShim'

const APP = '/Applications/Diff Bro.app/Contents/MacOS/Diff Bro'
let home

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'diffbro-shim-'))
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

describe('shimTarget', () => {
  it('uses ~/.local/bin on unix', () => {
    expect(shimTarget({ platform: 'darwin', home: '/Users/x' })).toBe('/Users/x/.local/bin/diffbro')
    expect(shimTarget({ platform: 'linux', home: '/home/x' })).toBe('/home/x/.local/bin/diffbro')
  })

  it('uses a .cmd under LOCALAPPDATA on windows', () => {
    const t = shimTarget({ platform: 'win32', home: 'C:\\Users\\x', localAppData: 'C:\\AppData' })
    expect(t).toMatch(/diffbro\.cmd$/)
    expect(t).toContain('AppData')
  })
})

describe('shimScript', () => {
  // "$@" not $@: a path with a space must stay ONE argument.
  it('execs the app and forwards arguments intact', () => {
    const s = shimScript(APP, 'darwin')
    expect(s).toMatch(/^#!\/bin\/sh/)
    expect(s).toContain(`exec '${APP}' "$@"`)
  })

  it('writes a .cmd that forwards %* on windows', () => {
    expect(shimScript('C:\\App\\DiffBro.exe', 'win32')).toContain('%*')
  })
})

describe('onPath', () => {
  it('is true only when the shim directory is actually on PATH', () => {
    const target = '/home/x/.local/bin/diffbro'
    expect(onPath(target, ['/usr/bin', '/home/x/.local/bin'].join(delimiter))).toBe(true)
    expect(onPath(target, '/usr/bin')).toBe(false)
  })
})

describe('installShim', () => {
  it('writes an executable shim and reports where', () => {
    const r = installShim({ exePath: APP, home, platform: 'darwin' })
    expect(r.ok).toBe(true)
    expect(r.target).toBe(join(home, '.local/bin/diffbro'))
    expect(readFileSync(r.target, 'utf8')).toContain(APP)
    expect(statSync(r.target).mode & 0o111).toBeTruthy()
  })

  it('is idempotent — reinstalling over our own shim rewrites it', () => {
    installShim({ exePath: '/old/DiffBro', home, platform: 'darwin' })
    const r = installShim({ exePath: APP, home, platform: 'darwin' })
    expect(r.ok).toBe(true)
    expect(readFileSync(r.target, 'utf8')).toContain(APP)
  })

  // Someone else's diffbro is not ours to overwrite.
  it('refuses to clobber a file it did not write', () => {
    const target = shimTarget({ platform: 'darwin', home })
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, '#!/bin/sh\necho not ours\n')
    const r = installShim({ exePath: APP, home, platform: 'darwin' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/different diffbro/)
    expect(readFileSync(target, 'utf8')).toContain('not ours')
  })
})

describe('shimStatus / removeShim', () => {
  it('reports not-installed before, installed after', () => {
    expect(shimStatus({ home, platform: 'darwin' }).installed).toBe(false)
    installShim({ exePath: APP, home, platform: 'darwin' })
    expect(shimStatus({ home, platform: 'darwin' }).installed).toBe(true)
  })

  it('removes only our own shim', () => {
    installShim({ exePath: APP, home, platform: 'darwin' })
    expect(removeShim({ home, platform: 'darwin' }).ok).toBe(true)
    expect(shimStatus({ home, platform: 'darwin' }).installed).toBe(false)

    const target = shimTarget({ platform: 'darwin', home })
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, 'someone elses\n')
    expect(removeShim({ home, platform: 'darwin' }).ok).toBe(false)
    expect(readFileSync(target, 'utf8')).toContain('someone elses')
  })
})

// The app path is interpolated into a /bin/sh script. Self-inflicted only (the
// user would have to install to a path like this) but a single quote or a $(…)
// otherwise ends the quoted string and the rest is executed.
describe('an app path with shell metacharacters', () => {
  // Asked of a REAL shell rather than a regex: the script is rewritten so the
  // exec target is echoed instead of run, and sh reports the single word it
  // actually resolved to. A path that broke out would print something else, or
  // fail the syntax check outright.
  const execTarget = (exePath) => {
    const script = shimScript(exePath, 'darwin').replace('exec ', 'printf %s ')
    expect(() => execFileSync('sh', ['-n'], { input: script })).not.toThrow()
    return execFileSync('sh', ['-s', '--'], { input: script, encoding: 'utf-8' })
  }

  it('passes a path holding quotes and a command substitution through untouched', () => {
    const nasty = '/Applications/Diff "; touch /tmp/pwned; $(id) `id` Bro/Diff Bro'
    expect(execTarget(nasty)).toBe(nasty)
  })

  it('survives an embedded single quote', () => {
    expect(execTarget("/opt/Bob's Diff/bro")).toBe("/opt/Bob's Diff/bro")
  })

  it('leaves an ordinary path alone', () => {
    expect(execTarget('/usr/local/bin/diffbro')).toBe('/usr/local/bin/diffbro')
  })
})
