import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const handlers = new Map()
const userData = mkdtempSync(join(tmpdir(), 'runner-settings-'))

vi.mock('electron', () => ({
  app: { getPath: () => userData, getLocale: () => 'en' },
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showMessageBox: vi.fn(), showOpenDialog: vi.fn() }
}))

const { registerRunnerSettingsIpc } = await import('../../src/main/runnerSettings')
registerRunnerSettingsIpc()

const file = join(userData, 'runners.json')
const setStopAfter = (...args) => handlers.get('run:setStopAfter')({}, ...args)
const stored = () => JSON.parse(readFileSync(file, 'utf8')).languages

describe('run:setStopAfter', () => {
  beforeEach(() => writeFileSync(file, JSON.stringify({ languages: {} })))
  afterAll(() => rmSync(userData, { recursive: true, force: true }))

  it('stores the minutes for that language alone, and sends the status back', () => {
    const reply = setStopAfter('python', 5)
    expect(reply.ok).toBe(true)
    expect(reply.status.python.stopAfterMinutes).toBe(5)
    expect(stored().python.stopAfterMinutes).toBe(5)
    expect(stored().php.stopAfterMinutes).toBe(2)
  })

  it('takes zero as no limit', () => {
    expect(setStopAfter('php', 0).status.php.stopAfterMinutes).toBe(0)
  })

  it('never turns a language on', () => {
    expect(setStopAfter('python', 3).status.python.enabled).toBe(false)
  })

  it.each([[-1], [1.5], ['2'], [null], [undefined], [Number.NaN], [1441], [{}]])(
    'refuses %j minutes, and writes nothing',
    (minutes) => {
      expect(setStopAfter('python', minutes)).toEqual({ error: 'bad-request' })
      expect(stored()).toEqual({})
    }
  )

  it('refuses a language it cannot run', () => {
    expect(setStopAfter('shell', 2)).toEqual({ error: 'bad-request' })
    expect(stored()).toEqual({})
  })
})
