import { readFileSync, statSync } from 'fs'
import { posix, win32 } from 'path'

// ~/.claude.json carries Claude Code's project history, so the cap is generous.
export const MAX_CONFIG_BYTES = 8 * 1024 * 1024
const SERVER = 'diffbro'
const UNREADABLE = { error: 'unreadable-config' }

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Fixed install locations, the user's own first: an app started from the Dock has no shell PATH.
 * @param {{ home: string, platform: string }} where
 * @returns {string[]}
 */
export function claudeCliCandidates({ home, platform }) {
  if (platform === 'win32') return [win32.join(home, '.local', 'bin', 'claude.exe')]
  const local = posix.join(home, '.local', 'bin', 'claude')
  if (platform === 'darwin') {
    return [
      local,
      posix.join(home, '.claude', 'local', 'claude'),
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude'
    ]
  }
  return [local, posix.join(home, '.claude', 'local', 'claude'), '/usr/local/bin/claude']
}

/** @param {{ command: string, args: string[] }} setup */
export const codeAddArgs = (setup) => [
  'mcp',
  'add',
  '--scope',
  'user',
  SERVER,
  '--',
  setup.command,
  ...setup.args
]

export const codeRemoveArgs = () => ['mcp', 'remove', '--scope', 'user', SERVER]

/** @returns {{ command: string, args: string[] }|null} */
export function serverEntryOf(text) {
  try {
    const entry = JSON.parse(text)?.mcpServers?.[SERVER]
    if (!isObject(entry) || typeof entry.command !== 'string') return null
    return { command: entry.command, args: Array.isArray(entry.args) ? entry.args : [] }
  } catch {
    return null
  }
}

/** @returns {'absent'|'current'|'stale'} */
export function entryStatus(entry, setup) {
  if (!entry) return 'absent'
  const same =
    entry.command === setup.command &&
    entry.args.length === setup.args.length &&
    entry.args.every((a, i) => a === setup.args[i])
  return same ? 'current' : 'stale'
}

/** @returns {string|null} null where Claude Desktop does not ship */
export function desktopConfigPath({ home, platform, appData }) {
  if (platform === 'darwin') {
    return posix.join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    )
  }
  if (platform === 'win32') {
    return win32.join(
      appData ?? win32.join(home, 'AppData', 'Roaming'),
      'Claude',
      'claude_desktop_config.json'
    )
  }
  return null
}

/** @returns {{ text: string }|{ error: string }} never a rewrite of a file that did not parse */
export function mergedDesktopConfig(text, setup) {
  let config = {}
  if (text != null) {
    try {
      config = JSON.parse(text)
    } catch {
      return UNREADABLE
    }
  }
  if (!isObject(config)) return UNREADABLE
  const servers = config.mcpServers ?? {}
  if (!isObject(servers)) return UNREADABLE
  const merged = {
    ...config,
    mcpServers: { ...servers, [SERVER]: { command: setup.command, args: [...setup.args] } }
  }
  return { text: `${JSON.stringify(merged, null, 2)}\n` }
}

/** @returns {{ text: string|null }|{ error: string }} */
export function readConfigText(path) {
  try {
    if (statSync(path).size > MAX_CONFIG_BYTES) return UNREADABLE
    return { text: readFileSync(path, 'utf8') }
  } catch (err) {
    return err?.code === 'ENOENT' ? { text: null } : UNREADABLE
  }
}
