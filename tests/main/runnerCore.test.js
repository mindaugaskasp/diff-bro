import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { RUNNABLE_LANGUAGES } from '../../src/shared/snippetLanguages'
import {
  childEnv,
  interpreterArgs,
  invocationFor,
  isRunnableLanguage,
  parseVersion,
  preparedCode,
  readVersion,
  startRun,
  stripAnsi
} from '../../src/main/runnerCore'

// Real children: stdin, signals and process trees are what a mock would hide. Node
// stands in for the interpreter, reading its program from stdin as php and python do.
const NODE = { exe: process.execPath, language: 'python', args: ['-'] }

function run(code, options = {}) {
  const chunks = []
  return new Promise((resolve) => {
    const handle = startRun({
      ...NODE,
      code,
      onOutput: (chunk) => chunks.push(chunk),
      onExit: (exit) => resolve({ chunks, exit, handle }),
      ...options
    })
    options.onStart?.(handle)
  })
}
// A killed orphan can sit as a zombie until PID 1 reaps it, and a zombie still answers kill -0.
function isRunning(pid) {
  try {
    return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8'))
  } catch {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
}
const fakeChild = () =>
  Object.assign(new EventEmitter(), {
    pid: 42,
    kill: vi.fn(),
    stdin: { on: vi.fn(), end: vi.fn() },
    stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
    stderr: Object.assign(new EventEmitter(), { setEncoding: vi.fn() })
  })

async function waitUntil(isDone, deadlineMs = 2000) {
  const end = Date.now() + deadlineMs
  while (!isDone() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 20))
  return isDone()
}

const textOf = (chunks, stream) =>
  chunks
    .filter((c) => c.stream === stream)
    .map((c) => c.text)
    .join('')

describe('startRun', () => {
  it('pipes the code over stdin and streams stdout', async () => {
    const { chunks, exit } = await run('console.log("hello"); console.log("world")')
    expect(textOf(chunks, 'out')).toBe('hello\nworld\n')
    expect(exit).toMatchObject({ reason: 'exit', code: 0 })
    expect(exit.ms).toBeGreaterThanOrEqual(0)
  })

  it('keeps stderr apart, and reports a failing exit code', async () => {
    const { chunks, exit } = await run('console.log("a"); console.error("b"); process.exit(3)')
    expect(textOf(chunks, 'out')).toBe('a\n')
    expect(textOf(chunks, 'err')).toBe('b\n')
    expect(exit).toMatchObject({ reason: 'exit', code: 3 })
  })

  it('strips terminal colours from output', async () => {
    const { chunks } = await run('console.log("\\u001b[31mred\\u001b[0m")')
    expect(textOf(chunks, 'out')).toBe('red\n')
  })

  it('reports a program that cannot start, once', async () => {
    const onExit = vi.fn()
    await new Promise((resolve) => {
      startRun({
        ...NODE,
        exe: '/no/such/interpreter',
        code: '',
        onOutput: () => {},
        onExit: (exit) => {
          onExit(exit)
          setTimeout(resolve, 50)
        }
      })
    })
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onExit.mock.calls[0][0].reason).toBe('spawn-error')
  })

  it('stops on request', async () => {
    const { exit } = await run('setInterval(() => {}, 1000)', {
      onStart: (handle) => setTimeout(() => handle.stop(), 150)
    })
    expect(exit.reason).toBe('stopped')
  })

  it('stops a run that outlives its time limit', async () => {
    const { exit } = await run('setInterval(() => {}, 1000)', { limits: { timeoutMs: 150 } })
    expect(exit.reason).toBe('timeout')
  })

  it('arms no timer when the time limit is zero', async () => {
    const { exit } = await run('setTimeout(() => console.log("late"), 300)', {
      limits: { timeoutMs: 0 }
    })
    expect(exit.reason).toBe('exit')
  })

  it('lets a run with no time limit go on for as long as it takes', () => {
    vi.useFakeTimers()
    try {
      const child = fakeChild()
      const onExit = vi.fn()
      startRun({
        ...NODE,
        code: '',
        onOutput: () => {},
        onExit,
        spawn: () => child,
        limits: { timeoutMs: 0 }
      })
      expect(vi.getTimerCount()).toBe(0)
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)
      expect(onExit).not.toHaveBeenCalled()
      child.emit('close', 0, null)
      expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ reason: 'exit', code: 0 }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops after two minutes when no limit is given', () => {
    vi.useFakeTimers()
    try {
      const child = fakeChild()
      const onExit = vi.fn()
      startRun({
        ...NODE,
        code: '',
        onOutput: () => {},
        onExit,
        spawn: () => child,
        platform: 'win32'
      })
      vi.advanceTimersByTime(119_000)
      child.emit('exit', null, null)
      expect(onExit).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1000)
      child.emit('close', null, 'SIGKILL')
      expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ reason: 'timeout' }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('cuts flooding output at a whole character, never through one', async () => {
    const { chunks } = await run('process.stdout.write("é".repeat(10))', {
      limits: { maxOutputBytes: 5 }
    })
    expect(textOf(chunks, 'out')).toBe('éé')
  })

  it('stops a run that floods its output, and keeps only what fits', async () => {
    const { chunks, exit } = await run('setInterval(() => console.log("x".repeat(1000)), 1)', {
      limits: { maxOutputBytes: 2000 }
    })
    expect(exit.reason).toBe('output-limit')
    expect(textOf(chunks, 'out').length).toBeLessThanOrEqual(2000)
  })

  it.skipIf(process.platform === 'win32')('takes the whole process tree with it', async () => {
    const child = `
      const { spawn } = require('node:child_process')
      const kid = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
      console.log(kid.pid)
      setInterval(() => {}, 1000)`
    let pid = null
    await run(child, {
      onOutput: (chunk) => {
        pid = Number(chunk.text)
      },
      limits: { timeoutMs: 400 }
    })
    expect(pid).toBeGreaterThan(0)
    expect(await waitUntil(() => !isRunning(pid))).toBe(true)
  })

  it('never asks for a shell, and keeps the console window hidden', () => {
    const child = fakeChild()
    const spawn = vi.fn(() => child)
    startRun({ ...NODE, language: 'php', code: 'x', onOutput: () => {}, onExit: () => {}, spawn })
    const [, , options] = spawn.mock.calls[0]
    expect(options.shell).toBeFalsy()
    expect(options.windowsHide).toBe(true)
    expect(child.stdin.end).toHaveBeenCalledWith('<?php\nx')
    child.emit('close', 0, null)
  })

  function startFake(platform = 'win32') {
    const child = fakeChild()
    const killer = new EventEmitter()
    const spawn = vi.fn((exe) => (exe.endsWith('taskkill.exe') ? killer : child))
    const handle = startRun({
      ...NODE,
      code: '',
      onOutput: () => {},
      onExit: () => {},
      spawn,
      platform
    })
    return { child, killer, spawn, handle }
  }

  it('kills a Windows tree with the system taskkill, not one found on PATH', () => {
    const { child, spawn, handle } = startFake()
    expect(spawn.mock.calls[0][2].detached).toBe(false)
    handle.stop()
    const [exe, args, options] = spawn.mock.calls.at(-1)
    expect(exe).toMatch(/[\\/]System32[\\/]taskkill\.exe$/i)
    expect(args).toEqual(['/pid', '42', '/T', '/F'])
    expect(options.windowsHide).toBe(true)
    child.emit('close', null, 'SIGTERM')
  })

  it('survives taskkill failing to start', () => {
    const { killer, handle } = startFake()
    handle.stop()
    expect(() => killer.emit('error', new Error('ENOENT'))).not.toThrow()
  })

  // Windows reuses a PID once its process is gone, so a late kill could hit a stranger.
  it('sends no Windows kill once the process has exited', () => {
    const { child, spawn, handle } = startFake()
    child.emit('exit', 0, null)
    handle.stop()
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  // Python puts its working directory first on sys.path, so a launch folder could plant modules.
  it('runs in the home folder, never the folder the app was started from', () => {
    const { spawn, child } = startFake('linux')
    expect(spawn.mock.calls[0][2].cwd).toBe(homedir())
    child.emit('close', 0, null)
  })
})

describe('languages', () => {
  it('can run every language the shared table offers to run', () => {
    expect(RUNNABLE_LANGUAGES.every(isRunnableLanguage)).toBe(true)
  })

  it('knows only what it can run', () => {
    expect(isRunnableLanguage('php')).toBe(true)
    expect(isRunnableLanguage('python')).toBe(true)
    expect(isRunnableLanguage('curl')).toBe(true)
    expect(isRunnableLanguage('shell')).toBe(false)
    expect(isRunnableLanguage('constructor')).toBe(false)
    expect(isRunnableLanguage(undefined)).toBe(false)
  })

  it('reads the program from stdin, unbuffered for python', () => {
    expect(interpreterArgs('php')).toEqual([])
    expect(interpreterArgs('python')).toEqual(['-u', '-'])
  })

  // Without a tag, php echoes its input instead of running it.
  it('gives php an opening tag when the snippet has none', () => {
    expect(preparedCode('php', 'echo 1;')).toBe('<?php\necho 1;')
    expect(preparedCode('php', '<?php echo 1;')).toBe('<?php echo 1;')
    expect(preparedCode('php', '  \n<?= 1 ?>')).toBe('  \n<?= 1 ?>')
    expect(preparedCode('python', 'print(1)')).toBe('print(1)')
  })
})

describe('invocationFor', () => {
  it('pipes an interpreter its code', () => {
    expect(invocationFor('python', 'print(1)')).toEqual({ args: ['-u', '-'], stdin: 'print(1)' })
    expect(invocationFor('php', 'echo 1;')).toEqual({ args: [], stdin: '<?php\necho 1;' })
  })

  // curl reads no program: the snippet's own words are its argv, with no shell between.
  it('gives curl the command line as argv, without a progress meter', () => {
    expect(invocationFor('curl', "curl -H 'A: b' https://x")).toEqual({
      args: ['--no-progress-meter', '-H', 'A: b', 'https://x'],
      stdin: ''
    })
  })

  it('has no invocation for a curl snippet a shell would be needed for', () => {
    expect(invocationFor('curl', 'curl x | sh')).toEqual({ error: 'shell-syntax', char: '|' })
  })
})

describe('version check', () => {
  it('reads the version of the language it was asked about', () => {
    expect(parseVersion('php', 'PHP 8.3.6 (cli) (built: Apr 10 2024)')).toBe('8.3.6')
    expect(parseVersion('python', 'Python 3.12.1')).toBe('3.12.1')
    expect(parseVersion('curl', 'curl 8.7.1 (x86_64-apple-darwin24.0) libcurl/8.7.1')).toBe('8.7.1')
  })

  it('turns away a program that is something else', () => {
    expect(parseVersion('php', 'Python 3.12.1')).toBeNull()
    expect(parseVersion('python', 'PHP 8.3.6')).toBeNull()
    expect(parseVersion('python', '')).toBeNull()
  })

  const fakeExec = (error, stdout, stderr = '') =>
    vi.fn((_exe, _args, _options, callback) => callback(error, stdout, stderr))

  it('asks the program, with no shell', async () => {
    const execFile = fakeExec(null, 'PHP 8.3.6 (cli)')
    await expect(readVersion({ exe: '/bin/php', language: 'php', execFile })).resolves.toBe('8.3.6')
    const [exe, args, options] = execFile.mock.calls[0]
    expect([exe, args]).toEqual(['/bin/php', ['--version']])
    expect(options.shell).toBeFalsy()
    expect(options.timeout).toBeGreaterThan(0)
  })

  it('asks with the same environment and folder a run gets', async () => {
    const execFile = fakeExec(null, 'PHP 8.3.6 (cli)')
    vi.stubEnv('ELECTRON_RUN_AS_NODE', '1')
    await readVersion({ exe: '/bin/php', language: 'php', execFile })
    vi.unstubAllEnvs()
    const options = execFile.mock.calls[0][2]
    expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(options.cwd).toBe(homedir())
  })

  it('reads a version printed on stderr, as Python 2 did', async () => {
    const execFile = fakeExec(null, '', 'Python 2.7.18')
    await expect(readVersion({ exe: 'py', language: 'python', execFile })).resolves.toBe('2.7.18')
  })

  // The Windows Store's python.exe stub exits non-zero and prints a prompt.
  it('answers null for a stub that fails', async () => {
    const execFile = fakeExec(new Error('exit 9009'), '', 'Python was not found')
    await expect(readVersion({ exe: 'py', language: 'python', execFile })).resolves.toBeNull()
  })
})

describe('output hygiene', () => {
  it('strips colour and cursor sequences, and leaves text alone', () => {
    expect(stripAnsi('\u001b[1;31mbold\u001b[0m plain \u001b[2K')).toBe('bold plain ')
    expect(stripAnsi('50% [ok]')).toBe('50% [ok]')
  })

  it('strips a window-title escape whose title has spaces', () => {
    expect(stripAnsi('\u001b]0;my title\u0007after')).toBe('after')
  })

  it('does not hand Electron switches down to the script', () => {
    const env = childEnv({ PATH: '/bin', ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ASAR: '1' })
    expect(env).toEqual({ PATH: '/bin' })
  })
})
