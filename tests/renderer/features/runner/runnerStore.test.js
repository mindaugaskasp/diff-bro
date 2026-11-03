import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRunnerStore } from '../../../../src/renderer/src/features/runner/runnerStore'

const OFF = { enabled: false, path: null, version: null }
const PHP = { enabled: true, path: '/bin/php', version: '8.3.6' }

beforeEach(() => {
  setActivePinia(createPinia())
  window.api = {
    runStatus: vi.fn(async () => ({ php: OFF, python: OFF })),
    runEnable: vi.fn(async () => ({ ok: true, status: { php: PHP, python: OFF } })),
    runDisable: vi.fn(async () => ({ ok: true, status: { php: OFF, python: OFF } })),
    runChange: vi.fn(async () => ({ ok: true, status: { php: PHP, python: OFF } }))
  }
})

describe('runnerStore settings', () => {
  it('loads what main holds', async () => {
    const store = useRunnerStore()
    await store.load()
    expect(store.status).toEqual({ php: OFF, python: OFF })
  })

  it('takes the status main answers after enabling', async () => {
    const store = useRunnerStore()
    await store.enable('php')
    expect(window.api.runEnable).toHaveBeenCalledWith('php')
    expect(store.status.php).toEqual(PHP)
    expect(store.errorFor('php')).toBeNull()
  })

  it('stays off when you cancel, without calling it an error', async () => {
    window.api.runEnable = vi.fn(async () => ({ canceled: true }))
    const store = useRunnerStore()
    await store.load()
    await store.enable('php')
    expect(store.status.php.enabled).toBe(false)
    expect(store.errorFor('php')).toBeNull()
  })

  it('remembers which language turned down the program', async () => {
    window.api.runChange = vi.fn(async () => ({ error: 'not-that-language' }))
    const store = useRunnerStore()
    await store.load()
    await store.change('python')
    expect(store.errorFor('python')).toBe('not-that-language')
    expect(store.errorFor('php')).toBeNull()
  })

  it('clears the error on the next try', async () => {
    window.api.runChange = vi.fn(async () => ({ error: 'not-that-language' }))
    const store = useRunnerStore()
    await store.change('php')
    window.api.runChange = vi.fn(async () => ({ ok: true, status: { php: PHP, python: OFF } }))
    await store.change('php')
    expect(store.errorFor('php')).toBeNull()
  })

  it('disables through main', async () => {
    const store = useRunnerStore()
    await store.disable('php')
    expect(window.api.runDisable).toHaveBeenCalledWith('php')
    expect(store.status.php.enabled).toBe(false)
  })
})

describe('runnerStore choosing a program', () => {
  it('picks one of the programs main found by its index', async () => {
    window.api.runChoose = vi.fn(async () => ({ ok: true, status: { php: PHP, python: OFF } }))
    const store = useRunnerStore()
    await store.choose('php', 1)
    expect(window.api.runChoose).toHaveBeenCalledWith('php', 1)
    expect(store.status.php).toEqual(PHP)
  })

  it('hands a typed path to main, and shows why it was turned away', async () => {
    window.api.runUsePath = vi.fn(async () => ({ error: 'not-absolute' }))
    const store = useRunnerStore()
    await store.usePath('python', 'python3')
    expect(window.api.runUsePath).toHaveBeenCalledWith('python', 'python3')
    expect(store.errorFor('python')).toBe('not-absolute')
  })

  it('looks again through main, keeping the status it answers with', async () => {
    const found = { ...PHP, candidates: [] }
    window.api.runFindAgain = vi.fn(async () => ({
      status: { php: found, python: OFF },
      error: 'none-found'
    }))
    const store = useRunnerStore()
    await store.findAgain('php')
    expect(window.api.runFindAgain).toHaveBeenCalledWith('php')
    expect(store.status.php).toEqual(found)
    expect(store.errorFor('php')).toBe('none-found')
  })

  it('says when enabling found another program, for that language only', async () => {
    window.api.runEnable = vi.fn(async () => ({
      ok: true,
      status: { php: PHP, python: OFF },
      notice: 'redetected'
    }))
    const store = useRunnerStore()
    await store.enable('php')
    expect(store.noticeFor('php')).toBe('redetected')
    expect(store.noticeFor('python')).toBeNull()
    await store.disable('php')
    expect(store.noticeFor('php')).toBeNull()
  })
})

describe('runnerStore isEnabled', () => {
  it('knows whether a language is turned on', async () => {
    const store = useRunnerStore()
    await store.load()
    expect(store.isEnabled('php')).toBe(false)
    window.api.runStatus = vi.fn(async () => ({ php: PHP, python: OFF }))
    await store.load()
    expect(store.isEnabled('php')).toBe(true)
    expect(store.isEnabled('shell')).toBe(false)
  })
})

describe('runnerStore runs', () => {
  let output
  let exit
  beforeEach(() => {
    window.api.onRunOutput = vi.fn((handler) => (output = handler))
    window.api.onRunExit = vi.fn((handler) => (exit = handler))
    window.api.runStart = vi.fn(async () => ({ runId: 'r1', version: '8.3.6' }))
    window.api.runStop = vi.fn()
  })
  const start = (store, key = 'tab') =>
    store.start(key, { language: 'php', code: 'x', snippetId: 'mine' })

  it('asks main to run what it was given, and shows as running', async () => {
    const store = useRunnerStore()
    await start(store)
    expect(window.api.runStart).toHaveBeenCalledWith({
      key: 'tab',
      language: 'php',
      code: 'x',
      snippetId: 'mine'
    })
    expect(store.runFor('tab')).toMatchObject({ state: 'running', version: '8.3.6' })
  })

  it('remembers the line a gutter run came from and the line it reached, sending main only code', async () => {
    const store = useRunnerStore()
    await store.start('tab', { language: 'php', code: 'x', snippetId: null, line: 4, lastLine: 6 })
    expect(store.runFor('tab')).toMatchObject({ line: 4, lastLine: 6 })
    expect(window.api.runStart).toHaveBeenCalledWith({
      key: 'tab',
      language: 'php',
      code: 'x',
      snippetId: null
    })
  })

  it('listens once, however many runs there are', async () => {
    const store = useRunnerStore()
    await start(store)
    await start(store)
    expect(window.api.onRunOutput).toHaveBeenCalledTimes(1)
  })

  it('joins output from one stream, and keeps streams apart', async () => {
    const store = useRunnerStore()
    await start(store)
    output({ key: 'tab', runId: 'r1', stream: 'out', text: 'a' })
    output({ key: 'tab', runId: 'r1', stream: 'out', text: 'b' })
    output({ key: 'tab', runId: 'r1', stream: 'err', text: 'c' })
    expect(store.runFor('tab').blocks).toEqual([
      { stream: 'out', text: 'ab' },
      { stream: 'err', text: 'c' }
    ])
    expect(store.outputText('tab')).toBe('abc')
  })

  it('keeps output that arrives before main has answered', async () => {
    let answer
    window.api.runStart = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    const store = useRunnerStore()
    const started = start(store)
    output({ key: 'tab', runId: 'r1', stream: 'out', text: 'early' })
    answer({ runId: 'r1', version: '8.3.6' })
    await started
    expect(store.outputText('tab')).toBe('early')
  })

  it('ignores output from the run this one replaced', async () => {
    const store = useRunnerStore()
    await start(store)
    output({ key: 'tab', runId: 'older', stream: 'out', text: 'stale' })
    exit({ key: 'tab', runId: 'older', reason: 'stopped' })
    expect(store.outputText('tab')).toBe('')
    expect(store.runFor('tab').state).toBe('running')
  })

  it.each([
    [{ reason: 'exit', code: 0 }, 'finished'],
    [{ reason: 'exit', code: 255 }, 'failed'],
    [{ reason: 'timeout', code: null }, 'failed'],
    [{ reason: 'output-limit', code: null }, 'failed'],
    [{ reason: 'spawn-error', code: null }, 'failed'],
    [{ reason: 'stopped', code: null }, 'stopped']
  ])('reads %j as %s', async (result, state) => {
    const store = useRunnerStore()
    await start(store)
    exit({ key: 'tab', runId: 'r1', ms: 42, ...result })
    expect(store.runFor('tab')).toMatchObject({ state, ...result, ms: 42 })
  })

  it('shows nothing when you cancel, or main refuses', async () => {
    const store = useRunnerStore()
    window.api.runStart = vi.fn(async () => ({ canceled: true }))
    await start(store)
    expect(store.runFor('tab')).toBeNull()
    window.api.runStart = vi.fn(async () => ({ error: 'not-enabled' }))
    await start(store)
    expect(store.runFor('tab')).toBeNull()
  })

  it('stops through main, and closing a running pane stops it too', async () => {
    const store = useRunnerStore()
    await start(store)
    store.stop('tab')
    expect(window.api.runStop).toHaveBeenCalledWith('r1')
    store.close('tab')
    expect(window.api.runStop).toHaveBeenCalledTimes(2)
    expect(store.runFor('tab')).toBeNull()
  })

  // runStart answers only after the first-run dialog, and a Stop can come in between.
  function deferredStart() {
    let answer
    window.api.runStart = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    return (reply = { runId: 'late', version: '8.3.6' }) => answer(reply)
  }

  it('stops a run asked to stop before main had answered', async () => {
    const store = useRunnerStore()
    const answer = deferredStart()
    const pending = start(store)
    store.stop('tab')
    expect(window.api.runStop).not.toHaveBeenCalled()
    answer()
    await pending
    expect(window.api.runStop).toHaveBeenCalledWith('late')
  })

  it('stops a run whose pane closed before main had answered, and keeps it closed', async () => {
    const store = useRunnerStore()
    const answer = deferredStart()
    const pending = start(store)
    store.close('tab')
    answer()
    await expect(pending).resolves.toBeUndefined()
    expect(window.api.runStop).toHaveBeenCalledWith('late')
    expect(store.runFor('tab')).toBeNull()
  })

  it('clears the output and keeps the pane', async () => {
    const store = useRunnerStore()
    await start(store)
    output({ key: 'tab', runId: 'r1', stream: 'out', text: 'a' })
    store.clear('tab')
    expect(store.outputText('tab')).toBe('')
    expect(store.runFor('tab')).not.toBeNull()
  })
})
