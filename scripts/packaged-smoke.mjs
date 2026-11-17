// Launches the packaged build, which e2e never does: catches left-out files, missing handlers, startup errors.
// Usage: node scripts/packaged-smoke.mjs <dist dir | executable>
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packagedExecutable, preloadChannels, smokeVerdict } from './lib/packagedSmoke.mjs'

const TIMEOUT_MS = 90_000
const target = process.argv[2]
if (!target) throw new Error('usage: node scripts/packaged-smoke.mjs <dist dir | executable>')
const found = statSync(target).isDirectory() ? packagedExecutable(readdirSync(target)) : target
if (!found) throw new Error(`no unpacked build in ${target}`)
const exe = found === target ? target : join(target, found)

const preloadDir = join(import.meta.dirname, '..', 'src', 'preload')
const expected = preloadChannels(
  readdirSync(preloadDir).map((f) => readFileSync(join(preloadDir, f), 'utf8'))
)
const profile = mkdtempSync(join(tmpdir(), 'diffbro-smoke-'))
const env = { ...process.env, DIFFBRO_SMOKE: '1' }
delete env.ELECTRON_RUN_AS_NODE
const args = [
  `--user-data-dir=${profile}`,
  ...(process.platform === 'linux' ? ['--no-sandbox'] : [])
]
const since = Date.now() - 1000

const child = spawn(exe, args, { env, stdio: ['ignore', 'pipe', 'inherit'] })
let report = null
let out = ''
child.stdout.on('data', (chunk) => {
  out += chunk
  for (const line of out.split('\n')) {
    if (line.startsWith('{"smoke"')) report = JSON.parse(line)
  }
})
const timer = setTimeout(() => child.kill(), TIMEOUT_MS)

child.on('exit', () => {
  clearTimeout(timer)
  const logText = report?.logDir ? readLogs(report.logDir) : ''
  const problems = smokeVerdict({ report, expected, logText, since })
  rmSync(profile, { recursive: true, force: true })
  if (problems.length) {
    console.error(`packaged smoke FAILED:\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`packaged smoke ok: ${expected.length} channels handled, nothing logged`)
})

function readLogs(dir) {
  try {
    return readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
  } catch {
    return ''
  }
}
