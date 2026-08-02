// Electron glue over cli.js/cliShim.js: turns a launch's argv into one message
// for the renderer, and exposes the shim installer to Settings. Kept thin — the
// parsing and the shim content are the tested cores.

import { app, clipboard, ipcMain } from 'electron'
import { homedir, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { parseCli } from './cli'
import { installShim, removeShim, shimStatus } from './cliShim'
import { gitToolStatus, registerGitTool, sweepGitTemp, unregisterGitTool } from './gitTool'
import { ensureMainWindow } from './quickLook'
import { allowCliPath } from './files'

// A command can arrive before any window exists (a cold `diffbro compare …`),
// so it waits here until the renderer says it is listening.
let pending = null
let listener = null

function deliver(command) {
  if (!command) return
  const win = ensureMainWindow()
  if (listener && !listener.isDestroyed()) listener.send('cli:command', command)
  else pending = command
  win?.focus()
}

/**
 * @param {string[]} argv
 * @param {string} [cwd]  the shell's cwd, which second-instance forwards
 */
export function routeCliArgv(argv, cwd) {
  const { command, error } = parseCli(argv, (p) => resolve(cwd || process.cwd(), p))
  if (error) {
    process.stderr.write(`${error}\n`)
    return
  }
  // `open` with no file has nothing to tell the renderer — the window IS the
  // answer, so it never reaches deliver's pending queue.
  if (command?.name === 'raise') {
    ensureMainWindow()?.focus()
    return
  }
  // Vouch for the paths before the renderer asks for them: file:read honours
  // only what main has already approved.
  if (command?.name === 'compare') command.files.forEach(allowCliPath)
  if (command?.name === 'clipboard-save') {
    deliver({ ...command, text: clipboard.readText() })
    return
  }
  deliver(command)
}

export function registerCliIpc() {
  // The renderer announces itself, then drains anything that arrived first.
  ipcMain.on('cli:ready', (e) => {
    listener = e.sender
    if (pending) {
      e.sender.send('cli:command', pending)
      pending = null
    }
  })
  const where = () => ({ exePath: app.getPath('exe'), home: homedir() })
  ipcMain.handle('cli:status', () => shimStatus(where()))
  ipcMain.handle('cli:install', () => installShim(where()))
  ipcMain.handle('cli:remove', () => removeShim(where()))

  ipcMain.handle('git:toolStatus', () => gitToolStatus(where()))
  ipcMain.handle('git:register', () => registerGitTool(where()))
  ipcMain.handle('git:unregister', () => unregisterGitTool(where()))
  // The launcher's copies of git's temp files have no other owner.
  sweepGitTemp(tmpdir())
}
