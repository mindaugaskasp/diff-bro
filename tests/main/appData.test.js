// store:load / store:save take a name from the renderer and turn it into a
// path. Without an allowlist `../../evil` escaped the data directory entirely,
// and `trusted-keys` rewrote the trust store through a key/value channel.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const handlers = new Map()
const syncHandlers = new Map()
let root
let dataDir

vi.mock('electron', () => ({
  app: { getPath: () => dataDir, relaunch: vi.fn(), exit: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  ipcMain: {
    on: (channel, fn) => syncHandlers.set(channel, fn),
    handle: (channel, fn) => handlers.set(channel, fn)
  },
  shell: { openPath: vi.fn() }
}))

const { dialog } = await import('electron')
const { readSettings, registerAppDataIpc } = await import('../../src/main/appData')
const { STORE_NAMES } = await import('../../src/main/dataFiles')

const save = (name, contents) => handlers.get('store:save')({}, name, contents)
const load = (name) => {
  const event = {}
  syncHandlers.get('store:load')(event, name)
  return event.returnValue
}

const TRAVERSING = ['../../evil', '../escaped', '..%2Fevil', 'a/b', 'a\\b', '', '.', '..']

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'diffbro-appdata-test-'))
  dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
  registerAppDataIpc()
})
afterAll(() => rmSync(root, { force: true, recursive: true }))

beforeEach(() => {
  for (const name of readdirSync(dataDir)) rmSync(join(dataDir, name), { force: true })
})

describe('store:save', () => {
  it('refuses a traversing name instead of writing outside the data directory', () => {
    for (const name of TRAVERSING) {
      expect(save(name, 'pwned')).toEqual({ error: 'bad-request' })
    }
    expect(readdirSync(root)).toEqual(['data'])
    expect(readdirSync(dataDir)).toEqual([])
  })

  it('refuses an absolute path', () => {
    const outside = join(root, 'absolute')
    expect(save(outside, 'pwned')).toEqual({ error: 'bad-request' })
    expect(existsSync(`${outside}.json`)).toBe(false)
  })

  it('refuses a name that is a data file but not a store', () => {
    expect(save('trusted-keys', '[{"sign":"attacker"}]')).toEqual({ error: 'bad-request' })
    expect(existsSync(join(dataDir, 'trusted-keys.json'))).toBe(false)
  })

  it('refuses a non-string name', () => {
    expect(save(null, 'x')).toEqual({ error: 'bad-request' })
    expect(save(['vault'], 'x')).toEqual({ error: 'bad-request' })
  })

  it('still refuses non-string contents', () => {
    expect(save('vault', { entries: [] })).toEqual({ error: 'bad-request' })
    expect(existsSync(join(dataDir, 'vault.json'))).toBe(false)
  })
})

describe('store:load', () => {
  it('refuses a traversing name instead of reading outside the data directory', () => {
    writeFileSync(join(root, 'secret.json'), 'top-secret')
    writeFileSync(join(root, 'evil.json'), 'top-secret')
    for (const name of [...TRAVERSING, '../secret', '../../evil']) {
      expect(load(name)).toBeNull()
    }
    rmSync(join(root, 'secret.json'))
    rmSync(join(root, 'evil.json'))
  })

  it('refuses a data file that is not a store', () => {
    writeFileSync(join(dataDir, 'trusted-keys.json'), '[{"sign":"real"}]')
    expect(load('trusted-keys')).toBeNull()
  })

  it('is null for a non-string name', () => {
    expect(load(undefined)).toBeNull()
  })
})

describe('the real stores', () => {
  it('round-trips every persisted store name', () => {
    for (const name of STORE_NAMES) {
      expect(save(name, `{"store":"${name}"}`)).toEqual({ ok: true })
      expect(load(name)).toBe(`{"store":"${name}"}`)
      expect(readFileSync(join(dataDir, `${name}.json`), 'utf-8')).toBe(`{"store":"${name}"}`)
    }
  })

  it('is null for a store that has never been written', () => {
    expect(load('vault')).toBeNull()
  })

  it('lets main read the settings the renderer saved', () => {
    save('settings', JSON.stringify({ fileSizeLimitsMb: { text: 12 } }))
    expect(readSettings()).toEqual({ fileSizeLimitsMb: { text: 12 } })
  })
})

// Moving the data folder restarts the app, so it is confirmed in main between
// the pick and the move: a confirm after the move would be too late.
describe('datadir:choose and datadir:reset', () => {
  const pointer = () => join(dataDir, 'data-location.json')
  const choose = () => handlers.get('datadir:choose')()
  const reset = () => handlers.get('datadir:reset')()
  beforeEach(() => {
    dialog.showOpenDialog.mockReset()
    dialog.showMessageBox.mockReset()
  })

  it('asks before moving, naming the folder, and Cancel moves nothing', async () => {
    const target = join(root, 'elsewhere')
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [target] })
    dialog.showMessageBox.mockResolvedValue({ response: 1 })
    expect(await choose()).toEqual({ canceled: true })
    expect(dialog.showMessageBox.mock.calls[0][0].detail).toContain(target)
    expect(existsSync(pointer())).toBe(false)
    expect(existsSync(target)).toBe(false)
  })

  it('Proceed moves the data and records the new folder', async () => {
    const target = join(root, 'moved')
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [target] })
    dialog.showMessageBox.mockResolvedValue({ response: 0 })
    expect(await choose()).toEqual({ ok: true, dir: target })
    expect(JSON.parse(readFileSync(pointer(), 'utf-8')).dir).toBe(target)
  })

  it('Use default asks too, and Cancel leaves the folder where it is', async () => {
    dialog.showMessageBox.mockResolvedValue({ response: 1 })
    expect(await reset()).toEqual({ canceled: true })
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
  })
})
