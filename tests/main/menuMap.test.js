import { describe, expect, it, vi } from 'vitest'
import { MENU_MAP, menuPaths } from '../menuMap.fixture'

let template = null
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '0.0.0-test' },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  Menu: { buildFromTemplate: (t) => ((template = t), {}), setApplicationMenu: () => {} },
  dialog: {},
  ipcMain: { handle: () => {}, on: () => {} },
  shell: {},
  systemPreferences: { setUserDefault: () => {} }
}))
vi.mock('../../src/main/quickLook', () => ({ isLauncher: () => false, toggleQuickLook: () => {} }))
vi.mock('../../src/main/tray', () => ({ refreshTrayMenu: () => {} }))

const { installMenu } = await import('../../src/main/menu')

// The OS's own items: macOS adds the clipboard roles to Edit, so the map holds on every platform.
const OS_ROLES = new Set([
  'appMenu',
  'close',
  'quit',
  'toggleDevTools',
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'selectAll'
])

const isNotACommand = (item) =>
  item.type === 'separator' || OS_ROLES.has(item.role) || item.enabled === false

describe('the native application menu', () => {
  it('is the approved menu map, item for item', () => {
    installMenu()
    expect(menuPaths(template, 'submenu', isNotACommand)).toEqual(MENU_MAP)
  })
})
