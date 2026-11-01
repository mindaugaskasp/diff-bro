// Runs a snippet with the interpreter the user picked. No Electron here, so the
// spawning, limits and kills are tested against real child processes.
import { execFile as nodeExecFile, spawn as nodeSpawn } from 'node:child_process'

const LANGUAGES = new Map([
  ['php', { args: [], version: /^PHP (\d+\.\d+\.\d+)/m }],
  ['python', { args: ['-u', '-'], version: /^Python (\d+\.\d+\.\d+)/m }]
])

const DEFAULT_LIMITS = { timeoutMs: 30_000, maxOutputBytes: 1024 * 1024 }
const VERSION_TIMEOUT_MS = 5000
// A grandchild can hold the pipes open past a kill, and `close` would never come.
const KILL_GRACE_MS = 1000
const ESC = '\\u001b'
const ANSI = new RegExp(
  `${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^\\u0007${ESC}]*(?:\\u0007|${ESC}\\\\)`,
  'g'
)

export const isRunnableLanguage = (language) => LANGUAGES.has(language)
export const interpreterArgs = (language) => LANGUAGES.get(language).args
export const stripAnsi = (text) => text.replace(ANSI, '')

// Without an opening tag, php echoes its input instead of running it.
export function preparedCode(language, code) {
  if (language !== 'php' || code.trimStart().startsWith('<?')) return code
  return `<?php\n${code}`
}

export function parseVersion(language, output) {
  return LANGUAGES.get(language)?.version.exec(output)?.[1] ?? null
}

// Null also turns away the Windows Store's python.exe stub, which exits non-zero.
export function readVersion({ exe, language, execFile = nodeExecFile }) {
  return new Promise((resolve) => {
    const options = { timeout: VERSION_TIMEOUT_MS, windowsHide: true }
    execFile(exe, ['--version'], options, (error, stdout, stderr) => {
      resolve(error ? null : parseVersion(language, `${stdout}\n${stderr}`))
    })
  })
}

export function childEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('ELECTRON_')))
}

function killTree({ child, platform, spawn }) {
  if (platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill?.('SIGKILL')
  }
}

function outputMeter({ maxOutputBytes, onOutput, onFull }) {
  let used = 0
  return (stream, raw) => {
    const room = maxOutputBytes - used
    if (room <= 0) return
    const text = stripAnsi(raw)
    const size = Buffer.byteLength(text)
    const fits = size <= room
    const kept = fits ? text : Buffer.from(text).subarray(0, room).toString()
    used += Math.min(size, room)
    if (kept) onOutput({ stream, text: kept })
    if (!fits || used >= maxOutputBytes) onFull()
  }
}

/**
 * @param {object} o
 * @param {string} o.exe
 * @param {string} o.language
 * @param {string} o.code
 * @param {(chunk: { stream: 'out'|'err', text: string }) => void} o.onOutput
 * @param {(exit: { reason: string, code: number|null, signal: string|null, ms: number }) => void} o.onExit
 * @param {string[]} [o.args]  defaults to the language's own
 * @param {{ timeoutMs?: number, maxOutputBytes?: number }} [o.limits]
 * @param {typeof nodeSpawn} [o.spawn]
 * @param {string} [o.platform]
 * @returns {{ stop: () => void }}
 */
export function startRun({
  exe,
  language,
  code,
  onOutput,
  onExit,
  args = interpreterArgs(language),
  limits = {},
  spawn = nodeSpawn,
  platform = process.platform
}) {
  const { timeoutMs, maxOutputBytes } = { ...DEFAULT_LIMITS, ...limits }
  const startedAt = Date.now()
  let reason = 'exit'
  let finished = false
  let timer = null

  const child = spawn(exe, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: childEnv(process.env),
    windowsHide: true,
    detached: platform !== 'win32'
  })

  function finish(result) {
    if (finished) return
    finished = true
    clearTimeout(timer)
    onExit({ reason, code: null, signal: null, ...result, ms: Date.now() - startedAt })
  }
  function end(why) {
    if (finished || reason !== 'exit') return
    reason = why
    clearTimeout(timer)
    killTree({ child, platform, spawn })
    timer = setTimeout(() => finish({}), KILL_GRACE_MS)
  }

  const meter = outputMeter({ maxOutputBytes, onOutput, onFull: () => end('output-limit') })
  for (const [name, stream] of [
    ['out', child.stdout],
    ['err', child.stderr]
  ]) {
    stream.setEncoding('utf8')
    stream.on('data', (raw) => meter(name, raw))
  }
  child.on('error', () => {
    reason = 'spawn-error'
    finish({})
  })
  child.on('close', (exitCode, signal) => finish({ code: exitCode, signal }))
  // A script that exits without reading stdin closes the pipe under us.
  child.stdin.on('error', () => {})
  child.stdin.end(preparedCode(language, code))
  timer = setTimeout(() => end('timeout'), timeoutMs)

  return { stop: () => end('stopped') }
}
