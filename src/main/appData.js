// Configurable data directory + a tiny file-backed key/value store, so all of
// this install's data (saved diffs, snippets, identity + trusted keys) can live
// in a folder the user chooses — e.g. under Documents or a synced folder — and
// therefore survive an app reinstall that wipes userData.
//
// A pointer file in userData records where the data lives; it defaults to
// userData itself, so nothing moves until the user opts in. If the pointer is
// lost on reinstall, the data is still intact in the chosen folder — the user
// just re-points to it in Settings.
import { app, dialog, ipcMain, shell } from 'electron'
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync
} from 'fs'
import { join } from 'path'

// Every file that makes up this install's data — copied together when the
// location changes, so the folder is self-contained and portable.
const DATA_FILES = [
  'vault.json', // saved diffs (encrypted at rest)
  'snippets.json', // snippet library (encrypted at rest)
  'identity.key', // private identity key (OS-keychain wrapped)
  'identity.pub', // public identity key
  'trusted-keys.json', // trusted peers
  'vault.key' // vault encryption key (OS-keychain wrapped)
]

const pointerPath = () => join(app.getPath('userData'), 'data-location.json')

let cachedDir = null

export function getDataDir() {
  if (cachedDir) return cachedDir
  let dir = app.getPath('userData')
  try {
    const { dir: saved } = JSON.parse(readFileSync(pointerPath(), 'utf-8'))
    if (typeof saved === 'string' && saved) dir = saved
  } catch {
    // no pointer yet — default to userData
  }
  mkdirSync(dir, { recursive: true })
  cachedDir = dir
  return dir
}

// Absolute path to a data file in the current data directory. Used by vault.js
// and share.js instead of hardcoding userData.
export function dataFile(name) {
  return join(getDataDir(), name)
}

// Atomic write: write to a temp file, fsync, then rename over the target, so a
// crash mid-write can never corrupt existing data. Node's rename replaces an
// existing destination on both POSIX and Windows.
function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp`
  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
}

function readStore(name) {
  try {
    return readFileSync(join(getDataDir(), `${name}.json`), 'utf-8')
  } catch {
    return null
  }
}

// The renderer's settings store persists preferences as plaintext settings.json
// through the same key/value store. The main process reads it directly (fresh
// each call, so a changed setting takes effect without a restart) for the few
// limits it has to enforce itself — e.g. the large-file warning threshold.
export function readSettings() {
  try {
    return JSON.parse(readStore('settings') ?? '{}') || {}
  } catch {
    return {}
  }
}

function writeStore(name, contents) {
  writeFileAtomic(join(getDataDir(), `${name}.json`), String(contents))
}

// Point at a new data directory. Non-destructive: existing files at the
// destination are kept (so pointing back at a folder after a reinstall restores
// it), and files present only at the source are copied over. The old directory
// is left untouched.
function setDataDir(newDir) {
  const current = getDataDir()
  const resolved = String(newDir)
  mkdirSync(resolved, { recursive: true })
  if (resolved !== current) {
    for (const f of DATA_FILES) {
      const src = join(current, f)
      const dest = join(resolved, f)
      if (existsSync(src) && !existsSync(dest)) copyFileSync(src, dest)
    }
  }
  writeFileSync(pointerPath(), JSON.stringify({ dir: resolved }, null, 2))
  cachedDir = resolved
  return resolved
}

export function registerAppDataIpc() {
  // Synchronous load so the renderer's Pinia stores can read their state during
  // setup (like localStorage did). Returns the raw JSON string, or null.
  ipcMain.on('store:load', (e, name) => {
    e.returnValue = typeof name === 'string' ? readStore(name) : null
  })

  ipcMain.handle('store:save', (e, name, contents) => {
    if (typeof name !== 'string' || typeof contents !== 'string') return { error: 'bad-request' }
    writeStore(name, contents)
    return { ok: true }
  })

  ipcMain.handle('datadir:get', () => ({
    dir: getDataDir(),
    isDefault: getDataDir() === app.getPath('userData')
  }))

  // Pick a folder and move the data there. The renderer restarts the app after
  // this so every in-memory key cache is rebuilt from the new location.
  ipcMain.handle('datadir:choose', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose a folder for Diff Bro data',
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || !filePaths.length) return { canceled: true }
    return { ok: true, dir: setDataDir(filePaths[0]) }
  })

  // Reset to the default (userData) location, copying the data back.
  ipcMain.handle('datadir:reset', () => ({ ok: true, dir: setDataDir(app.getPath('userData')) }))

  ipcMain.handle('datadir:reveal', () => {
    shell.openPath(getDataDir())
    return { ok: true }
  })

  // Relaunch so all data is re-read from the (new) location with fresh caches.
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })
}
