// Configurable data directory + a tiny file-backed key/value store, so this
// install's data (diffs, snippets, keys) can live in a user-chosen folder and
// survive a reinstall. A pointer file in userData records the location.
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

// Atomic write (temp + fsync + rename) so a crash mid-write can't corrupt data.
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

// Main reads the renderer's settings.json fresh for the few limits it enforces
// (e.g. the large-file threshold).
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

// Non-destructive: keeps existing files at the destination (so re-pointing after
// a reinstall restores them) and copies over source-only files.
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
  // Sync so the Pinia stores can read state during setup.
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
