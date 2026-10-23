import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_CONFIG_BYTES,
  claudeCliCandidates,
  codeAddArgs,
  codeRemoveArgs,
  desktopConfigPath,
  entryStatus,
  mergedDesktopConfig,
  readConfigText,
  serverEntryOf
} from '../../src/main/claudeConnectCore.js'

const setup = { command: '/Applications/Diff Bro.app/Contents/MacOS/Diff Bro', args: ['mcp'] }

describe('claudeCliCandidates', () => {
  it('looks where the macOS installers put it, never on PATH', () => {
    const paths = claudeCliCandidates({ home: '/Users/a', platform: 'darwin' })
    expect(paths).toContain('/opt/homebrew/bin/claude')
    expect(paths).toContain('/Users/a/.local/bin/claude')
    expect(paths.every((p) => p.startsWith('/'))).toBe(true)
  })

  it("prefers the user's own install over a system-wide one", () => {
    const paths = claudeCliCandidates({ home: '/Users/a', platform: 'darwin' })
    expect(paths.indexOf('/Users/a/.local/bin/claude')).toBeLessThan(
      paths.indexOf('/opt/homebrew/bin/claude')
    )
  })

  it('looks for the native .exe on Windows, not an npm .cmd shim', () => {
    const paths = claudeCliCandidates({ home: 'C:\\Users\\a', platform: 'win32' })
    expect(paths).toEqual(['C:\\Users\\a\\.local\\bin\\claude.exe'])
  })

  it('covers the Linux install location', () => {
    expect(claudeCliCandidates({ home: '/home/a', platform: 'linux' })).toContain(
      '/home/a/.local/bin/claude'
    )
  })
})

describe('Claude Code arguments', () => {
  it('adds at user scope, with the app and its verb after the separator', () => {
    expect(codeAddArgs(setup)).toEqual([
      'mcp',
      'add',
      '--scope',
      'user',
      'diffbro',
      '--',
      setup.command,
      'mcp'
    ])
  })

  it('removes the same user-scope entry', () => {
    expect(codeRemoveArgs()).toEqual(['mcp', 'remove', '--scope', 'user', 'diffbro'])
  })
})

describe('serverEntryOf', () => {
  it('reads the diffbro server out of a config', () => {
    const text = JSON.stringify({ projects: {}, mcpServers: { diffbro: setup, other: {} } })
    expect(serverEntryOf(text)).toEqual(setup)
  })

  it.each([null, '', '{ nope', '[]', '{"mcpServers":{"diffbro":{"command":7}}}', '{}'])(
    'finds nothing in %j',
    (text) => expect(serverEntryOf(text)).toBeNull()
  )
})

describe('entryStatus', () => {
  it('is absent with no entry', () => expect(entryStatus(null, setup)).toBe('absent'))

  it('is current when it launches this app', () => {
    expect(entryStatus({ command: setup.command, args: ['mcp'] }, setup)).toBe('current')
  })

  it('is stale when it launches another copy', () => {
    expect(entryStatus({ command: '/Old/Diff Bro', args: ['mcp'] }, setup)).toBe('stale')
    expect(entryStatus({ command: setup.command, args: [] }, setup)).toBe('stale')
  })
})

describe('desktopConfigPath', () => {
  it('is in Application Support on macOS', () => {
    expect(desktopConfigPath({ home: '/Users/a', platform: 'darwin' })).toBe(
      '/Users/a/Library/Application Support/Claude/claude_desktop_config.json'
    )
  })

  it('is under APPDATA on Windows', () => {
    expect(
      desktopConfigPath({
        home: 'C:\\Users\\a',
        platform: 'win32',
        appData: 'C:\\Users\\a\\AppData\\Roaming'
      })
    ).toBe('C:\\Users\\a\\AppData\\Roaming\\Claude\\claude_desktop_config.json')
  })

  it('does not exist on Linux, where Claude Desktop does not ship', () => {
    expect(desktopConfigPath({ home: '/home/a', platform: 'linux' })).toBeNull()
  })
})

describe('mergedDesktopConfig', () => {
  it('adds the server and keeps every other key and server', () => {
    const before = { preferences: { x: 1 }, mcpServers: { other: { command: 'o' } } }
    const out = mergedDesktopConfig(JSON.stringify(before), setup)
    expect(JSON.parse(out.text)).toEqual({
      preferences: { x: 1 },
      mcpServers: { other: { command: 'o' }, diffbro: { command: setup.command, args: ['mcp'] } }
    })
  })

  it('creates the file when there is none', () => {
    expect(JSON.parse(mergedDesktopConfig(null, setup).text)).toEqual({
      mcpServers: { diffbro: { command: setup.command, args: ['mcp'] } }
    })
  })

  it('replaces an entry pointing at an older copy', () => {
    const before = { mcpServers: { diffbro: { command: '/Old', args: [] } } }
    expect(
      JSON.parse(mergedDesktopConfig(JSON.stringify(before), setup).text).mcpServers.diffbro.command
    ).toBe(setup.command)
  })

  it.each(['{ nope', '[1,2]', '"text"', '{"mcpServers":[]}'])(
    'refuses to rewrite a file it cannot read: %j',
    (text) => expect(mergedDesktopConfig(text, setup)).toEqual({ error: 'unreadable-config' })
  )
})

describe('readConfigText', () => {
  let dir
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'claude-cfg-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads a file', () => {
    writeFileSync(join(dir, 'c.json'), '{"a":1}')
    expect(readConfigText(join(dir, 'c.json'))).toEqual({ text: '{"a":1}' })
  })

  it('reports a missing file as no text', () => {
    expect(readConfigText(join(dir, 'none.json'))).toEqual({ text: null })
  })

  it('refuses an oversized file without reading it', () => {
    writeFileSync(join(dir, 'big.json'), ' '.repeat(MAX_CONFIG_BYTES + 1))
    expect(readConfigText(join(dir, 'big.json'))).toEqual({ error: 'unreadable-config' })
  })
})
