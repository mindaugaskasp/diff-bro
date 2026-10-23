import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { BUNDLE_ID, caskText } from '../../scripts/lib/homebrewCask.mjs'

const cask = caskText({ version: '1.2.3', sha256: 'ab'.repeat(32) })

describe('homebrew cask', () => {
  it('quits the running app before brew swaps the bundle', () => {
    expect(cask).toMatch(new RegExp(`^  uninstall quit: "${BUNDLE_ID}"$`, 'm'))
  })

  it('names the bundle id electron-builder stamps into the app', () => {
    const builder = readFileSync('electron-builder.yml', 'utf8')
    expect(builder).toMatch(new RegExp(`^appId: ${BUNDLE_ID}$`, 'm'))
  })

  it('pins the release it was generated for', () => {
    expect(cask).toContain('version "1.2.3"')
    expect(cask).toContain(`sha256 "${'ab'.repeat(32)}"`)
  })
})
