import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readLanSettings, writeLanSettings } from '../../../src/main/lan/lanStore'
import { readComputerName } from '../../../src/main/lan/computerName'
import { defaultLanSettings } from '../../../src/main/lan/lanSettings'

let dir
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'lan-store-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('lan settings file', () => {
  it('reads defaults when there is no file', () => {
    expect(readLanSettings(join(dir, 'lan.json'), 'pc')).toEqual(defaultLanSettings('pc'))
  })

  it('reads defaults from a corrupt file', () => {
    writeFileSync(join(dir, 'lan.json'), '{not json')
    expect(readLanSettings(join(dir, 'lan.json'), 'pc')).toEqual(defaultLanSettings('pc'))
  })

  it('writes and reads back, private to the user', () => {
    const file = join(dir, 'lan.json')
    const settings = { ...defaultLanSettings('pc'), visible: false, name: 'Ben' }
    writeLanSettings(file, settings)
    expect(readLanSettings(file, 'pc')).toEqual(settings)
    expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('Ben')
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
  })
})

describe('computer name', () => {
  const hostname = () => 'jonas-mbp.local'

  it('uses ComputerName on macOS', async () => {
    const run = vi.fn(async () => 'Jonas’s MacBook Pro\n')
    expect(await readComputerName({ platform: 'darwin', env: {}, hostname, run })).toBe(
      'Jonas’s MacBook Pro'
    )
    expect(run).toHaveBeenCalledWith('/usr/sbin/scutil', ['--get', 'ComputerName'])
  })

  it('falls back to the hostname when scutil fails or is empty', async () => {
    const failing = async () => {
      throw new Error('nope')
    }
    expect(await readComputerName({ platform: 'darwin', env: {}, hostname, run: failing })).toBe(
      'jonas-mbp.local'
    )
    expect(
      await readComputerName({ platform: 'darwin', env: {}, hostname, run: async () => ' ' })
    ).toBe('jonas-mbp.local')
  })

  it('uses COMPUTERNAME on Windows and the hostname elsewhere', async () => {
    const run = vi.fn()
    expect(
      await readComputerName({ platform: 'win32', env: { COMPUTERNAME: 'DESK-1' }, hostname, run })
    ).toBe('DESK-1')
    expect(await readComputerName({ platform: 'linux', env: {}, hostname, run })).toBe(
      'jonas-mbp.local'
    )
    expect(run).not.toHaveBeenCalled()
  })
})
