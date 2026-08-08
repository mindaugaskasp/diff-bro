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
import { t } from './i18n'

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
export function routeCliArgv(argv, cwd, carried = null) {
  // ONLY `new snippet`, whose typed answers cannot be re-derived from argv, is
  // routed as the CLI process built it. Everything else must be re-parsed HERE,
  // because this is the only place that resolves a path against the shell's cwd
  // — carrying those verbs across skipped that, so `cd ~/work && diffbro compare
  // a.json b.json` resolved against the RUNNING app's cwd and read the wrong
  // file, or none. (Re-parsing is also wrong for the draft: second-instance
  // hands over a REORDERED argv with switches hoisted.)
  if (carried?.name === 'new-snippet') return routeCommand(carried)
  const parsed = parseCli(argv, (p) => resolve(cwd || process.cwd(), p))
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`)
    return
  }
  routeCommand(parsed.command)
}

function routeCommand(command) {
  // `open` with no file has nothing to tell the renderer — the window IS the
  // answer, so it never reaches deliver's pending queue.
  if (command?.name === 'raise') return void ensureMainWindow()?.focus()
  // Vouch for the paths before the renderer asks for them: file:read honours
  // only what main has already approved.
  if (command?.name === 'compare') command.files.forEach(allowCliPath)
  if (command?.name === 'clipboard-save') {
    return void deliver({ ...command, text: clipboard.readText() })
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
  // Unpackaged, `exe` is Electron itself, so the app directory has to travel
  // with it or the shim launches Electron with the verb as its app path.
  const where = () => ({
    exePath: app.getPath('exe'),
    home: homedir(),
    entryPath: app.isPackaged ? null : app.getAppPath()
  })

  // Both of these put something OUTSIDE the app: a 0755 shim on PATH, and five
  // git config --global mutations. Rule 7 fences shell.openExternal behind a
  // confirm for the smaller act of opening a URL, so these ask too — a
  // compromised renderer must not be able to install persistence silently.
  const confirmed = async (message, detail) =>
    (
      await dialog.showMessageBox({
        type: 'question',
        buttons: [t('common.cancel'), t('dialog.continue')],
        defaultId: 1,
        cancelId: 0,
        message,
        detail
      })
    ).response === 1

  ipcMain.handle('cli:status', () => shimStatus(where()))
  ipcMain.handle('cli:install', async () =>
    (await confirmed(t('dialog.cliInstall.message'), t('dialog.cliInstall.detail')))
      ? installShim(where())
      : { canceled: true }
  )
  ipcMain.handle('cli:remove', () => removeShim(where()))

  ipcMain.handle('git:toolStatus', () => gitToolStatus(where()))
  ipcMain.handle('git:register', async () =>
    (await confirmed(t('dialog.gitRegister.message'), t('dialog.gitRegister.detail')))
      ? registerGitTool(where())
      : { canceled: true }
  )
  ipcMain.handle('git:unregister', () => unregisterGitTool(where()))

  // The launcher's copies of git's temp files have no other owner. Swept on quit
  // as well as launch: a crash skips will-quit, and these are repo file contents.
  sweepGitTemp(tmpdir())
  app.on('will-quit', () => sweepGitTemp(tmpdir()))
}
