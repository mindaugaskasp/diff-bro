import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_PLIST_BYTES,
  bundleVersionOf,
  createUpdateCheck,
  infoPlistPath,
  readBundleVersion
} from '../../src/main/bundleVersion.js'

const plist = (version) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.mindaugas.diffbro</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>999</string>
</dict>
</plist>`

describe('infoPlistPath', () => {
  it('finds Info.plist beside the MacOS folder holding the executable', () => {
    expect(infoPlistPath('/Applications/Diff Bro.app/Contents/MacOS/Diff Bro')).toBe(
      '/Applications/Diff Bro.app/Contents/Info.plist'
    )
  })
})

describe('bundleVersionOf', () => {
  it('reads the short version string, not the build number', () => {
    expect(bundleVersionOf(plist('0.11.0'))).toBe('0.11.0')
  })

  it('accepts a prerelease suffix', () => {
    expect(bundleVersionOf(plist('0.11.0-beta.2'))).toBe('0.11.0-beta.2')
  })

  it.each(['', 'latest', '1.2', '1.2.3; rm -rf', '<b>1.2.3</b>'])('rejects %j', (v) => {
    expect(bundleVersionOf(plist(v))).toBeNull()
  })

  it('returns null when the key is absent', () => {
    expect(bundleVersionOf('<plist><dict></dict></plist>')).toBeNull()
  })
})

describe('readBundleVersion', () => {
  let dir
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'bundle-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads the version from disk', () => {
    writeFileSync(join(dir, 'Info.plist'), plist('2.0.0'))
    expect(readBundleVersion(join(dir, 'Info.plist'))).toBe('2.0.0')
  })

  it('returns null while the bundle is missing mid-swap', () => {
    expect(readBundleVersion(join(dir, 'Info.plist'))).toBeNull()
  })

  it('refuses a file over the size cap without parsing it', () => {
    writeFileSync(join(dir, 'Info.plist'), plist('2.0.0') + ' '.repeat(MAX_PLIST_BYTES))
    expect(readBundleVersion(join(dir, 'Info.plist'))).toBeNull()
  })
})

describe('createUpdateCheck', () => {
  it('stays quiet while the bundle matches the running build', () => {
    const check = createUpdateCheck({ running: '1.0.0', read: () => '1.0.0' })
    expect(check()).toBeNull()
  })

  it('reports a new version once, then again only for a newer swap', () => {
    let onDisk = '1.1.0'
    const check = createUpdateCheck({ running: '1.0.0', read: () => onDisk })
    expect(check()).toBe('1.1.0')
    expect(check()).toBeNull()
    onDisk = '1.2.0'
    expect(check()).toBe('1.2.0')
  })

  it('says nothing when the bundle is swapped back to the running build', () => {
    let onDisk = '1.1.0'
    const check = createUpdateCheck({ running: '1.0.0', read: () => onDisk })
    check()
    onDisk = '1.0.0'
    expect(check()).toBeNull()
    onDisk = '1.1.0'
    expect(check()).toBe('1.1.0')
  })

  it('ignores an unreadable bundle', () => {
    const check = createUpdateCheck({ running: '1.0.0', read: () => null })
    expect(check()).toBeNull()
  })
})
