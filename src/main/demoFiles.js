import { ipcMain } from 'electron'
import { demoPayloads } from './demoContent'

export function registerDemoIpc() {
  ipcMain.handle('demo:files', () => demoPayloads())
}
