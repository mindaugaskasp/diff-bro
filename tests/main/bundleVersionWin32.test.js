import { describe, expect, it, vi } from 'vitest'

vi.mock('path', async () => {
  const { win32 } = await vi.importActual('path')
  return { ...win32, default: win32 }
})

describe('infoPlistPath on a Windows build host', () => {
  it('still builds a macOS bundle path', async () => {
    const { infoPlistPath } = await import('../../src/main/bundleVersion.js')
    expect(infoPlistPath('/Applications/Diff Bro.app/Contents/MacOS/Diff Bro')).toBe(
      '/Applications/Diff Bro.app/Contents/Info.plist'
    )
  })
})
