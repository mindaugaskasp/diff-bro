import { readFileSync, statSync } from 'fs'
import { posix } from 'path'

export const MAX_PLIST_BYTES = 64 * 1024
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const SHORT_VERSION = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/

/** @param {string} execPath `Contents/MacOS/<name>` inside the bundle */
// posix: a macOS bundle path, also on the Windows CI runner that tests it.
export const infoPlistPath = (execPath) => posix.join(posix.dirname(execPath), '..', 'Info.plist')

/** @returns {string|null} */
export function bundleVersionOf(xml) {
  const version = SHORT_VERSION.exec(xml)?.[1]
  return version && VERSION.test(version) ? version : null
}

/** @returns {string|null} null while the bundle is missing, oversized or unreadable */
export function readBundleVersion(plistPath) {
  try {
    if (statSync(plistPath).size > MAX_PLIST_BYTES) return null
    return bundleVersionOf(readFileSync(plistPath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * @param {{ running: string, read: () => string|null }} opts
 * @returns {() => string|null} the on-disk version the first time it differs, else null
 */
export function createUpdateCheck({ running, read }) {
  let reported = running
  return () => {
    const onDisk = read()
    if (!onDisk || onDisk === reported) return null
    reported = onDisk
    return onDisk === running ? null : onDisk
  }
}
