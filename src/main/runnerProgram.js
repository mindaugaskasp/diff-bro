// Which program a language adopts: a remembered one, a detected one, or one the user named.
import { accessSync, constants, readdirSync, realpathSync, statSync } from 'node:fs'
import { posix, win32 } from 'node:path'

const MAX_PATH_LENGTH = 4096

export const programFs = {
  readdir(dir) {
    try {
      return readdirSync(dir)
    } catch {
      return []
    }
  },
  isProgramFile(path) {
    try {
      accessSync(path, constants.X_OK)
      return statSync(path).isFile()
    } catch {
      return false
    }
  },
  realpath(path) {
    try {
      return realpathSync(path)
    } catch {
      return path
    }
  }
}

// A UNC path would make the OS reach a file server.
const isNetworkPath = (path) => /^[\\/]{2}/.test(path)

function isAbsoluteFor(platform, path) {
  return (platform === 'win32' ? win32 : posix).isAbsolute(path)
}

/** @returns {'bad-request'|'not-absolute'|'not-a-program'|null} */
export function typedPathRefusal(path, { platform, fs, isTrap }) {
  if (typeof path !== 'string' || !path || path.length > MAX_PATH_LENGTH || path.includes('\0')) {
    return 'bad-request'
  }
  if (!isAbsoluteFor(platform, path) || isNetworkPath(path)) return 'not-absolute'
  if (!fs.isProgramFile(path) || isTrap(path)) return 'not-a-program'
  return null
}

/**
 * @returns {Promise<{ path: string|null, notice?: 'redetected' }>}
 */
export async function programForEnable({ known, fs, detect, pick }) {
  if (known && fs.isProgramFile(known)) return { path: known }
  const [newest] = await detect()
  if (newest) return known ? { path: newest.path, notice: 'redetected' } : { path: newest.path }
  return { path: await pick() }
}
