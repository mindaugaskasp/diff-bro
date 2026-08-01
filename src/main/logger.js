// Local error/crash logger — LOCAL ONLY, never sends anything (offline). Writes a
// daily-rotated file; formatting/rotation/retention live in logFormat.js.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { capLog, dailyLogName, formatLogEntry, isLogFileName, staleLogFiles } from './logFormat'
import { redactSensitive } from './logRedact'

const MAX_DAY_BYTES = 512 * 1024 // one day's file
const KEEP_DAYS = 7
// Pointer file so the log dir is main-managed and readable at startup; defaults
// to Electron's logs path.
const pointerPath = () => join(app.getPath('userData'), 'log-location.json')

function defaultLogDir() {
  try {
    return app.getPath('logs')
  } catch {
    return join(app.getPath('userData'), 'logs')
  }
}

export function getLogDir() {
  try {
    const { dir } = JSON.parse(readFileSync(pointerPath(), 'utf-8'))
    if (typeof dir === 'string' && dir) return dir
  } catch {
    // no pointer yet, or unreadable — fall through to the default
  }
  return defaultLogDir()
}

function isDefaultDir() {
  return getLogDir() === defaultLogDir()
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function currentLogPath() {
  return join(getLogDir(), dailyLogName())
}

// Best-effort: a logging failure must never throw into a crash handler.
export function appendLog(record) {
  try {
    const dir = getLogDir()
    ensureDir(dir)
    const file = join(dir, dailyLogName())
    const entry = redactSensitive(formatLogEntry({ ...record, ...envInfo() }), {
      homeDir: homedir()
    })
    const existing = existsSync(file) ? readFileSync(file, 'utf-8') : ''
    writeFileSync(file, capLog(existing, entry, MAX_DAY_BYTES))
    pruneOldLogs(dir)
  } catch {
    // swallow — a broken log path can't be allowed to take the app down
  }
}

function envInfo() {
  return { appVersion: app.getVersion(), platform: `${process.platform} ${process.arch}` }
}

function pruneOldLogs(dir) {
  try {
    for (const name of staleLogFiles(readdirSync(dir), KEEP_DAYS)) {
      unlinkSync(join(dir, name))
    }
  } catch {
    // directory vanished mid-run, etc. — retention is best-effort
  }
}

// Tail-capped so a big day doesn't flood the report dialog / clipboard.
const READ_TAIL_BYTES = 64 * 1024
export function readCurrentLog() {
  try {
    const file = currentLogPath()
    if (!existsSync(file)) return { path: file, content: '' }
    const content = readFileSync(file, 'utf-8')
    return { path: file, content: content.slice(-READ_TAIL_BYTES) }
  } catch {
    return { path: currentLogPath(), content: '' }
  }
}

function clearLogs() {
  try {
    const dir = getLogDir()
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (isLogFileName(name)) unlinkSync(join(dir, name))
    }
  } catch {
    // best-effort
  }
}

async function chooseLogDir(win) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Choose a folder for logs',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || !filePaths.length) return { ok: false }
  const dir = filePaths[0]
  ensureDir(dir)
  writeFileSync(pointerPath(), JSON.stringify({ dir }))
  return { ok: true, dir }
}

function resetLogDir() {
  try {
    if (existsSync(pointerPath())) rmSync(pointerPath())
  } catch {
    // ignore
  }
  return { ok: true, dir: getLogDir() }
}

// Main-process + process-level failures (renderer JS errors arrive via log:error).
export function installCrashHooks() {
  process.on('uncaughtException', (err) => {
    appendLog({ source: 'main', message: err?.message ?? String(err), stack: err?.stack })
  })
  process.on('unhandledRejection', (reason) => {
    appendLog({
      source: 'main',
      message: `Unhandled rejection: ${reason?.message ?? reason}`,
      stack: reason?.stack
    })
  })
  app.on('render-process-gone', (_e, _wc, details) => {
    appendLog({
      source: 'renderer-process',
      message: `Renderer gone: ${details.reason} (exit ${details.exitCode})`,
      context: 'render-process-gone'
    })
  })
  app.on('child-process-gone', (_e, details) => {
    appendLog({
      source: 'child-process',
      message: `${details.type} gone: ${details.reason}`,
      context: 'child-process-gone'
    })
  })
}

export function registerLoggerIpc() {
  // Untrusted record: only known string fields are read; logFormat caps them.
  ipcMain.handle('log:error', (_e, record = {}) => {
    appendLog({
      source: 'renderer',
      message: record.message,
      stack: record.stack,
      context: record.context
    })
    return true
  })
  ipcMain.handle('log:read', () => readCurrentLog())
  ipcMain.handle('log:clear', () => {
    clearLogs()
    return true
  })
  ipcMain.handle('log:reveal', () => {
    const { path } = readCurrentLog()
    if (existsSync(path)) shell.showItemInFolder(path)
    else shell.openPath(getLogDir())
  })
  ipcMain.handle('log:getDir', () => ({ dir: getLogDir(), isDefault: isDefaultDir() }))
  ipcMain.handle('log:chooseDir', (e) => chooseLogDir(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle('log:resetDir', () => resetLogDir())
}
