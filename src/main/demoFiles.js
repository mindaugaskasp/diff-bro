import { ipcMain } from 'electron'
import { getDataDir } from './appData'
import { demoPayloads } from './demoContent'

export function registerDemoIpc() {
  // No argument: the renderer asks for the demo pair, it never names a file.
  ipcMain.handle('demo:files', () => demoPayloads(getDataDir()))
}
