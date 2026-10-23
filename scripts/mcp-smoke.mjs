// Windows CI: proves a GUI-subsystem exe launched as Claude Desktop does keeps its stdio pipes.
// Usage: node scripts/mcp-smoke.mjs <executable> [<app dir>]
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const [exe, appDir] = process.argv.slice(2)
const profile = mkdtempSync(join(tmpdir(), 'diffbro-mcp-smoke-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const args = [...(appDir ? [appDir] : []), `--user-data-dir=${profile}`, 'mcp']
const child = spawn(exe, args, { env, stdio: ['pipe', 'pipe', 'inherit'] })
const answers = new Map()
const noise = []
createInterface({ input: child.stdout }).on('line', (line) => {
  try {
    const msg = JSON.parse(line)
    answers.get(msg.id)?.(msg)
  } catch {
    noise.push(line)
  }
})

const request = (id, method, params) =>
  new Promise((resolve) => {
    answers.set(id, resolve)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })

function fail(why) {
  console.error(`mcp smoke: ${why}`)
  child.kill()
  process.exit(1)
}

const timer = setTimeout(() => fail('no answer within 60 s'), 60_000)
const init = await request(1, 'initialize', { protocolVersion: '2025-06-18' })
if (init.result?.serverInfo?.name !== 'diffbro') fail(`initialize: ${JSON.stringify(init)}`)
const tools = await request(2, 'tools/list')
if (tools.error?.code !== -32001) fail(`tools/list while off: ${JSON.stringify(tools)}`)

child.stdin.end()
const code = await new Promise((resolve) => child.on('exit', resolve))
clearTimeout(timer)
rmSync(profile, { recursive: true, force: true })
if (code !== 0) fail(`exited ${code} after stdin closed`)
// stdout is the protocol channel: even a blank line is something a client must parse.
if (noise.length)
  fail(`non-protocol output on stdout: ${noise.map((l) => JSON.stringify(l)).join(', ')}`)
console.log('mcp smoke: initialize answered, refused while off, exited on EOF')
