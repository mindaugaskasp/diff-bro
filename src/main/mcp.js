// Opens no socket, never takes the single-instance lock, never writes the library.
import { app } from 'electron'
import { createInterface } from 'readline'
import { createReadStream } from 'fs'
import { join } from 'path'
import { installNetworkKillSwitch } from './security'
import { readSnippetStore, readVaultStore } from './appData'
import { readExistingVaultKey } from './vault'
import { vaultDecrypt } from './vaultCrypt'
import { GRANT_OFF, verifyGrant } from './mcpGrant'
import { createMcpSession } from './mcpProtocol'
import { callTool, toolList } from './mcpTools'
import { resourceList, resourceRead } from './mcpResources'
import { writeProposal } from './inboxStore'
import { appendActivity, claudePaths, readGrantRecord } from './claudeFiles'

const parsed = (raw) => {
  try {
    return JSON.parse(raw ?? '{}') ?? {}
  } catch {
    return {}
  }
}

function toolContext(key, paths) {
  const grant = key ? verifyGrant(key, readGrantRecord(paths.grant)) : GRANT_OFF
  return {
    grant,
    snippets: () => parsed(readSnippetStore()),
    vault: () => parsed(readVaultStore()),
    decrypt: (box, aad) => vaultDecrypt(key, box, aad),
    propose: (kind, body) => writeProposal(paths.inbox, key, { kind, body, now: Date.now() }),
    now: Date.now()
  }
}

function sessionFor(keyOf, paths) {
  const ctx = () => toolContext(keyOf(), paths)
  const record = (tool, item) => appendActivity(paths.activity, { at: Date.now(), tool, item })
  return createMcpSession(
    {
      isEnabled: () => ctx().grant.enabled,
      listTools: () => toolList(ctx().grant),
      callTool: async (name, args) => {
        const { result, touched } = callTool(name, args, ctx())
        record(name, touched)
        return result
      },
      listResources: () => resourceList(ctx()),
      readResource: async (uri) => {
        const { result, touched } = resourceRead(uri, ctx())
        record('read_resource', touched)
        return result
      }
    },
    { name: 'diffbro', version: app.getVersion() }
  )
}

async function serve() {
  // On Windows Electron's process.stdin reports EOF at once; handle 0 itself is readable.
  const input =
    process.platform === 'win32'
      ? createReadStream(null, { fd: 0, autoClose: false })
      : process.stdin
  installNetworkKillSwitch()
  // Retried per request: a client may start this before the app has made a key.
  let key = null
  const session = sessionFor(() => key, claudePaths(app.getPath('userData')))
  const lines = createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    key ??= await readExistingVaultKey().catch(() => null)
    const response = await session.handleLine(line)
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
  }
  app.quit()
}

export function startMcp() {
  // stdout is the protocol channel; a stray log line would corrupt it.
  console.log = console.info = console.warn = console.error
  app.dock?.hide()
  app.setPath('sessionData', join(app.getPath('userData'), 'mcp-session'))
  app.whenReady().then(serve)
}
