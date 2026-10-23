import { describe, expect, it } from 'vitest'
import { claudeSetup } from '../../src/main/claudeSetup'

describe('claude setup command', () => {
  it('launches the packaged binary with the mcp verb', () => {
    const setup = claudeSetup({
      exePath: '/Applications/Diff Bro.app/Contents/MacOS/Diff Bro',
      appPath: null
    })
    expect(setup.cli).toBe(
      'claude mcp add diffbro -- "/Applications/Diff Bro.app/Contents/MacOS/Diff Bro" "mcp"'
    )
    expect(JSON.parse(setup.desktopJson).mcpServers.diffbro).toEqual({
      command: '/Applications/Diff Bro.app/Contents/MacOS/Diff Bro',
      args: ['mcp']
    })
  })

  it('passes the app directory to Electron on an unpackaged run', () => {
    const setup = claudeSetup({ exePath: '/x/electron', appPath: '/src/diff-bro' })
    expect(setup.args).toEqual(['/src/diff-bro', 'mcp'])
  })

  it('escapes a quote in a Windows path rather than breaking the command', () => {
    const setup = claudeSetup({ exePath: 'C:\\Apps\\Diff "Bro".exe', appPath: null })
    expect(setup.cli).toContain('"C:\\\\Apps\\\\Diff \\"Bro\\".exe"')
  })
})
