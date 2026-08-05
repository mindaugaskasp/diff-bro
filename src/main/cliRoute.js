// Electron glue over cli.js/cliShim.js: turns a launch's argv into one message
// for the renderer, and exposes the shim installer to Settings. Kept thin — the
// parsing and the shim content are the tested cores.

import { app, clipboard, dialog, ipcMain } from 'electron'
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

  // Both of these put something OUTSIDE the app: a 0755 shim on PATH, and five
  // git config --global mutations. Rule 7 fences shell.openExternal behind a
  // confirm for the smaller act of opening a URL, so these ask too — a
  // compromised renderer must not be able to install persistence silently.
  const confirmed = async (message, detail) =>
    (
      await dialog.showMessageBox({
        type: 'question',
        buttons: ['Cancel', 'Continue'],
        defaultId: 1,
        cancelId: 0,
        message,
        detail
      })
    ).response === 1

  ipcMain.handle('cli:status', () => shimStatus(where()))
  ipcMain.handle('cli:install', async () =>
    (await confirmed(
      'Add the diffbro command to your terminal?',
      'This writes a small launcher script into ~/.local/bin.'
    ))
      ? installShim(where())
      : { canceled: true }
  )
  ipcMain.handle('cli:remove', () => removeShim(where()))

  ipcMain.handle('git:toolStatus', () => gitToolStatus(where()))
  ipcMain.handle('git:register', async () =>
    (await confirmed(
      'Register Diff Bro as your git difftool?',
      'This changes your global git configuration (~/.gitconfig).'
    ))
      ? registerGitTool(where())
      : { canceled: true }
  )
  ipcMain.handle('git:unregister', () => unregisterGitTool(where()))

  // The launcher's copies of git's temp files have no other owner. Swept on quit
  // as well as launch: a crash skips will-quit, and these are repo file contents.
  sweepGitTemp(tmpdir())
  app.on('will-quit', () => sweepGitTemp(tmpdir()))
}
