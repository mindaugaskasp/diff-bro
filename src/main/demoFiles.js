import { ipcMain } from 'electron'
import { getDataDir } from './appData'
import { demoPayloads } from './demoContent'

export function registerDemoIpc() {
  // The renderer names a KIND, never a file, and main decides what that means —
  // anything but 'diagram' is the config pair.
  ipcMain.handle('demo:files', (_e, kind) =>
    demoPayloads(getDataDir(), kind === 'diagram' ? 'diagram' : 'config')
  )
}
