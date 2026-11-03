import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { programFs, programForEnable, typedPathRefusal } from '../../src/main/runnerProgram'

const fakeFs = (files = []) => ({ isProgramFile: (path) => files.includes(path) })
const noTrap = () => false

describe('typedPathRefusal', () => {
  const posix = { platform: 'linux', fs: fakeFs(['/opt/py/bin/python3']), isTrap: noTrap }

  it('takes an absolute path to a program', () => {
    expect(typedPathRefusal('/opt/py/bin/python3', posix)).toBeNull()
  })

  it.each([[''], [42], [null], ['/a\0b'], ['/'.repeat(5000)]])('turns away %j', (path) => {
    expect(typedPathRefusal(path, posix)).toBe('bad-request')
  })

  it('turns away a relative path', () => {
    expect(typedPathRefusal('python3', posix)).toBe('not-absolute')
    expect(typedPathRefusal('./bin/python3', posix)).toBe('not-absolute')
  })

  it('turns away a network path, which the OS would fetch from a server', () => {
    const win = { platform: 'win32', fs: fakeFs(['\\\\host\\share\\php.exe']), isTrap: noTrap }
    expect(typedPathRefusal('\\\\host\\share\\php.exe', win)).toBe('not-absolute')
    expect(typedPathRefusal('//host/share/php', posix)).toBe('not-absolute')
  })

  it('judges absolute by the platform it runs on', () => {
    const win = { platform: 'win32', fs: fakeFs(['C:\\php\\php.exe']), isTrap: noTrap }
    expect(typedPathRefusal('C:\\php\\php.exe', win)).toBeNull()
    expect(typedPathRefusal('C:\\php\\php.exe', posix)).toBe('not-absolute')
  })

  it('turns away something that is not a program file', () => {
    expect(typedPathRefusal('/etc/passwd', posix)).toBe('not-a-program')
  })

  it('turns away a trap the user typed', () => {
    const trapped = { ...posix, isTrap: () => true }
    expect(typedPathRefusal('/opt/py/bin/python3', trapped)).toBe('not-a-program')
  })
})

describe('programForEnable', () => {
  const found = [
    { path: '/opt/homebrew/bin/python3', version: '3.12.1' },
    { path: '/usr/bin/python3', version: '3.9.6' }
  ]

  it('keeps a remembered program that is still there, without looking further', async () => {
    const detect = vi.fn()
    const pick = vi.fn()
    const choice = await programForEnable({
      known: '/usr/bin/python3',
      fs: fakeFs(['/usr/bin/python3']),
      detect,
      pick
    })
    expect(choice).toEqual({ path: '/usr/bin/python3' })
    expect(detect).not.toHaveBeenCalled()
    expect(pick).not.toHaveBeenCalled()
  })

  it('takes the newest found when nothing is remembered', async () => {
    const choice = await programForEnable({
      known: null,
      fs: fakeFs(),
      detect: async () => found,
      pick: vi.fn()
    })
    expect(choice).toEqual({ path: '/opt/homebrew/bin/python3' })
  })

  it('says so when a remembered program is gone and another was found', async () => {
    const choice = await programForEnable({
      known: '/opt/homebrew/Cellar/python/3.11/bin/python3',
      fs: fakeFs(),
      detect: async () => found,
      pick: vi.fn()
    })
    expect(choice).toEqual({ path: '/opt/homebrew/bin/python3', notice: 'redetected' })
  })

  it('asks when nothing is found', async () => {
    const choice = await programForEnable({
      known: null,
      fs: fakeFs(),
      detect: async () => [],
      pick: async () => '/picked/php'
    })
    expect(choice).toEqual({ path: '/picked/php' })
  })
})

describe('programFs', () => {
  let dir
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'runner-program-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('sees an executable file as a program, and nothing else', () => {
    const program = join(dir, 'php')
    const text = join(dir, 'notes.txt')
    writeFileSync(program, '#!/bin/sh\n')
    chmodSync(program, 0o755)
    writeFileSync(text, 'hi')
    mkdirSync(join(dir, 'folder'))
    expect(programFs.isProgramFile(program)).toBe(true)
    expect(programFs.isProgramFile(join(dir, 'folder'))).toBe(false)
    expect(programFs.isProgramFile(join(dir, 'missing'))).toBe(false)
    if (process.platform !== 'win32') expect(programFs.isProgramFile(text)).toBe(false)
  })

  it('lists a folder, and an unreadable one as empty', () => {
    writeFileSync(join(dir, 'a'), '')
    expect(programFs.readdir(dir)).toEqual(['a'])
    expect(programFs.readdir(join(dir, 'missing'))).toEqual([])
  })

  it('resolves a link, and leaves a missing path as it is', () => {
    const target = join(dir, 'python3.11')
    writeFileSync(target, '')
    symlinkSync(target, join(dir, 'python3'))
    expect(programFs.realpath(join(dir, 'python3'))).toBe(programFs.realpath(target))
    expect(programFs.realpath(join(dir, 'gone'))).toBe(join(dir, 'gone'))
  })
})
