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
import { fileAtRevision, isRevisionSide, REVISION_ERROR_KEYS } from './gitCliFiles'
import { beginMerge, cancelMerge, writeMerged } from './mergeSession'
import { mergeInputsFor } from './mergeInputs'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { hasConflictMarkers, isBinaryBuffer } from './mergeGuards'
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
  routeCommand(parsed.command, cwd)
}

// Each `revision:path` side becomes a real file before the renderer hears about
// the command at all, so everything downstream sees paths and nothing else has
// to know git was involved.
async function withRevisionsResolved(command, cwd) {
  const files = []
  for (const side of command.files) {
    if (!isRevisionSide(side)) {
      files.push(side)
      continue
    }
    const res = await fileAtRevision(side, cwd || process.cwd())
    if (res.error) {
      process.stderr.write(`${t(REVISION_ERROR_KEYS[res.error] ?? 'cliErrors.not-a-repo')}\n`)
      return null
    }
    files.push(res.file)
  }
  return { ...command, files }
}

function deliverResolved(command, cwd) {
  withRevisionsResolved(command, cwd)
    .then((ready) => {
      if (!ready) return
      ready.files.forEach(allowCliPath)
      deliver(ready)
    })
    // A path the fence refuses THROWS. Without this it opened nothing, said
    // nothing, and landed in the crash log instead.
    .catch(() => process.stderr.write(`${t('cliErrors.refused')}\n`))
}

const needsGit = (command) => command?.name === 'compare' && command.files.some(isRevisionSide)

// A mergetool launch: main REMEMBERS the path git wants written and sends the
// renderer the conflicted text, never the path. What comes back is text.
function routeMerge(command) {
  let buffer
  try {
    buffer = readFileSync(command.merged)
  } catch {
    process.stderr.write(`${t('cliErrors.merge-unreadable')}\n`)
    return
  }
  // git calls the mergetool for a BINARY conflict too, and leaves it with no
  // markers. Decoding one as text turns every invalid byte into U+FFFD, and
  // writing that back destroys the file — so it never reaches the renderer.
  if (isBinaryBuffer(buffer)) {
    process.stderr.write(`${t('cliErrors.merge-binary')}\n`)
    return
  }
  const content = buffer.toString('utf8')
  // Nothing to decide is not the same as "resolved": a file with no markers is
  // one this tool has no business rewriting.
  if (!hasConflictMarkers(content)) {
    process.stderr.write(`${t('cliErrors.merge-no-conflicts')}\n`)
    return
  }
  beginMerge(command)
  // A NAME for the band, never a path: the renderer must not be able to learn,
  // or name, the file main is going to write.
  const base = { name: 'merge', fileName: basename(command.merged), content }
  mergeInputsFor(command.merged)
    .then((inputs) => deliver({ ...base, ...inputs }))
    // Without this the renderer is never told, no sentinel is written, and the
    // terminal that ran `git mergetool` waits forever on a decision nobody was
    // asked for. The markers alone are enough to resolve it.
    .catch(() => deliver(base))
}

// The verbs that need something done before the renderer hears about them.
const SPECIAL = {
  // `open` with no file has nothing to tell the renderer — the window IS the
  // answer, so it never reaches deliver's pending queue.
  raise: () => void ensureMainWindow()?.focus(),
  merge: (command) => routeMerge(command),
  'clipboard-save': (command) => deliver({ ...command, text: clipboard.readText() })
}

function routeCommand(command, cwd) {
  if (needsGit(command)) return void deliverResolved(command, cwd)
  const special = SPECIAL[command?.name]
  if (special) return void special(command)
  // Vouch for the paths before the renderer asks for them: file:read honours
  // only what main has already approved.
  if (command?.name === 'compare') command.files.forEach(allowCliPath)
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

  // The renderer's ONLY say in the merge is the text. It cannot name a file:
  // main has held that path since the launch.
  ipcMain.handle('merge:write', (e, text) => writeMerged(text))
  // Declining is an answer too: it releases the launcher and spends the session.
  ipcMain.handle('merge:cancel', () => cancelMerge())
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
