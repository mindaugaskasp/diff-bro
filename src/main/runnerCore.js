// Runs a snippet with the interpreter the user picked. No Electron here, so the
// spawning, limits and kills are tested against real child processes.
import { execFile as nodeExecFile, spawn as nodeSpawn } from 'node:child_process'
import { homedir } from 'node:os'
import { win32 } from 'node:path'

const LANGUAGES = new Map([
  ['php', { args: [], version: /^PHP (\d+\.\d+\.\d+)/m }],
  ['python', { args: ['-u', '-'], version: /^Python (\d+\.\d+\.\d+)/m }]
])

const DEFAULT_LIMITS = { timeoutMs: 30_000, maxOutputBytes: 1024 * 1024 }
const VERSION_TIMEOUT_MS = 5000
// A grandchild can hold the pipes open past a kill, and `close` would never come.
const KILL_GRACE_MS = 1000
// Not util.stripVTControlCharacters: it leaves an OSC title with spaces half-stripped.
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

export function childEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('ELECTRON_')))
}

// Python puts its working directory first on sys.path; the folder the app was
// started from must not be able to plant a module.
const childPlacement = () => ({ env: childEnv(process.env), cwd: homedir() })

// Null also turns away the Windows Store's python.exe stub, which exits non-zero.
export function readVersion({ exe, language, execFile = nodeExecFile }) {
  return new Promise((resolve) => {
    const options = { ...childPlacement(), timeout: VERSION_TIMEOUT_MS, windowsHide: true }
    execFile(exe, ['--version'], options, (error, stdout, stderr) => {
      resolve(error ? null : parseVersion(language, `${stdout}\n${stderr}`))
    })
  })
}

// By absolute path: a bare name is searched for in the working directory first.
const TASKKILL = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe')

function killTree({ child, platform, spawn, exited }) {
  if (platform === 'win32') {
    if (exited) return
    const killer = spawn(TASKKILL, ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    killer.on('error', () => {})
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

// Cut at a character boundary: a byte cut through UTF-8 shows as U+FFFD.
const wholeCharsIn = (text, bytes) =>
  new TextDecoder().decode(Buffer.from(text).subarray(0, bytes), { stream: true })

function outputMeter({ maxOutputBytes, onOutput, onFull }) {
  let used = 0
  return (stream, raw) => {
    const room = maxOutputBytes - used
    if (room <= 0) return
    const text = stripAnsi(raw)
    const size = Buffer.byteLength(text)
    const kept = size <= room ? text : wholeCharsIn(text, room)
    used += Math.min(size, room)
    if (kept) onOutput({ stream, text: kept })
    if (used >= maxOutputBytes) onFull()
  }
}

function pipeOutput(child, meter) {
  for (const [name, stream] of [
    ['out', child.stdout],
    ['err', child.stderr]
  ]) {
    stream.setEncoding('utf8')
    stream.on('data', (raw) => meter(name, raw))
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
  let reported = false
  let killRequested = false
  let exited = false
  let timer = null

  const child = spawn(exe, args, {
    ...childPlacement(),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    detached: platform !== 'win32'
  })

  function reportExit(result) {
    if (reported) return
    reported = true
    clearTimeout(timer)
    onExit({ reason, code: null, signal: null, ...result, ms: Date.now() - startedAt })
  }
  function terminate(why) {
    if (reported || killRequested) return
    killRequested = true
    reason = why
    clearTimeout(timer)
    killTree({ child, platform, spawn, exited })
    timer = setTimeout(() => reportExit({}), KILL_GRACE_MS)
  }

  pipeOutput(
    child,
    outputMeter({ maxOutputBytes, onOutput, onFull: () => terminate('output-limit') })
  )
  child.on('error', () => {
    reason = 'spawn-error'
    reportExit({})
  })
  child.on('exit', () => (exited = true))
  child.on('close', (exitCode, signal) => reportExit({ code: exitCode, signal }))
  // A script that exits without reading stdin closes the pipe under us.
  child.stdin.on('error', () => {})
  child.stdin.end(preparedCode(language, code))
  timer = setTimeout(() => terminate('timeout'), timeoutMs)

  return { stop: () => terminate('stopped') }
}
