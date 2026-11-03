import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOutputBatch, createRuns, refusalFor } from '../../src/main/runnerRuns'

const ENABLED = { languages: { php: { enabled: true, path: '/bin/php', version: '8.3.6' } } }
const request = (over = {}) => ({
  language: 'php',
  code: 'echo 1;',
  snippetId: null,
  config: ENABLED,
  store: { entries: [{ id: 'mine' }, { id: 'hush', secret: true }] },
  ...over
})

describe('refusalFor', () => {
  it('lets an enabled language run', () => {
    expect(refusalFor(request())).toBeNull()
    expect(refusalFor(request({ snippetId: 'mine' }))).toBeNull()
  })

  it.each([
    ['a language it cannot run', { language: 'shell' }],
    ['a language named by the prototype chain', { language: 'constructor' }],
    ['code that is not text', { code: 42 }],
    ['code past the size cap', { code: 'x'.repeat(8 * 1024 * 1024 + 1) }]
  ])('calls %s a bad request', (_name, over) => {
    expect(refusalFor(request(over))).toBe('bad-request')
  })

  it('refuses a language that is not enabled', () => {
    const config = { languages: { php: { enabled: false, path: '/bin/php' } } }
    expect(refusalFor(request({ config }))).toBe('not-enabled')
    expect(refusalFor(request({ language: 'python' }))).toBe('not-enabled')
  })

  it('refuses a secret snippet', () => {
    expect(refusalFor(request({ snippetId: 'hush' }))).toBe('secret')
  })

  it('tolerates a store it cannot read', () => {
    expect(refusalFor(request({ snippetId: 'mine', store: null }))).toBeNull()
  })
})

describe('createRuns', () => {
  function harness() {
    const handles = []
    const start = vi.fn((options) => {
      const handle = { options, stop: vi.fn() }
      handles.push(handle)
      return handle
    })
    return { handles, start, runs: createRuns({ start }) }
  }
  const begin = (runs, key = 'tab') =>
    runs.begin({ key, exe: 'x', language: 'php', code: '', onOutput: vi.fn(), onExit: vi.fn() })

  it('gives each run its own id', () => {
    const { runs } = harness()
    expect(begin(runs, 'a')).not.toBe(begin(runs, 'b'))
  })

  it('replaces a run still going in the same tab', () => {
    const { runs, handles } = harness()
    begin(runs, 'tab')
    begin(runs, 'tab')
    expect(handles[0].stop).toHaveBeenCalled()
    expect(handles[1].stop).not.toHaveBeenCalled()
  })

  it('leaves other tabs alone', () => {
    const { runs, handles } = harness()
    begin(runs, 'a')
    begin(runs, 'b')
    expect(handles[0].stop).not.toHaveBeenCalled()
  })

  it('stops by id, and ignores one it does not know', () => {
    const { runs, handles } = harness()
    const id = begin(runs)
    runs.stop('nope')
    expect(handles[0].stop).not.toHaveBeenCalled()
    runs.stop(id)
    expect(handles[0].stop).toHaveBeenCalled()
  })

  it('forgets a finished run, and passes the exit on', () => {
    const { runs, handles } = harness()
    const onExit = vi.fn()
    const id = runs.begin({
      key: 't',
      exe: 'x',
      language: 'php',
      code: '',
      onOutput: vi.fn(),
      onExit
    })
    handles[0].options.onExit({ reason: 'exit' })
    expect(onExit).toHaveBeenCalledWith({ reason: 'exit' })
    runs.stop(id)
    expect(handles[0].stop).not.toHaveBeenCalled()
  })

  const owned = (runs, owner, key = 'tab') =>
    runs.begin({
      owner,
      key,
      exe: 'x',
      language: 'php',
      code: '',
      onOutput: vi.fn(),
      onExit: vi.fn()
    })

  it('lets only the window that started a run stop it', () => {
    const { runs, handles } = harness()
    const id = owned(runs, 1)
    runs.stop(id, 2)
    expect(handles[0].stop).not.toHaveBeenCalled()
    runs.stop(id, 1)
    expect(handles[0].stop).toHaveBeenCalled()
  })

  it('keeps tabs of different windows apart, even under the same key', () => {
    const { runs, handles } = harness()
    owned(runs, 1, 'tab')
    owned(runs, 2, 'tab')
    expect(handles[0].stop).not.toHaveBeenCalled()
  })

  it('stops every run of a window that went away, and no other', () => {
    const { runs, handles } = harness()
    owned(runs, 1, 'a')
    owned(runs, 1, 'b')
    owned(runs, 2, 'a')
    runs.stopOwnedBy(1)
    expect(handles.map((h) => h.stop.mock.calls.length)).toEqual([1, 1, 0])
  })

  it('sends output it was still holding before the exit', () => {
    const { runs, handles } = harness()
    const sent = []
    runs.begin({
      key: 't',
      exe: 'x',
      language: 'php',
      code: '',
      onOutput: (c) => sent.push(['out', c.text]),
      onExit: () => sent.push(['exit'])
    })
    handles[0].options.onOutput({ stream: 'out', text: 'last words' })
    handles[0].options.onExit({ reason: 'exit' })
    expect(sent).toEqual([['out', 'last words'], ['exit']])
  })

  it('stops everything', () => {
    const { runs, handles } = harness()
    begin(runs, 'a')
    begin(runs, 'b')
    runs.stopAll()
    expect(handles.every((h) => h.stop.mock.calls.length === 1)).toBe(true)
  })
})

// A tight print loop made ~100k IPC messages and as many re-renders; output now travels in batches.
describe('createOutputBatch', () => {
  afterEach(() => vi.useRealTimers())
  function batch(options = {}) {
    vi.useFakeTimers()
    const send = vi.fn()
    return { send, push: createOutputBatch({ send, ...options }) }
  }

  it('joins chunks of one stream into one message per interval', () => {
    const { send, push } = batch({ intervalMs: 50 })
    for (let i = 0; i < 1000; i++) push.add({ stream: 'out', text: '1\n' })
    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toEqual({ stream: 'out', text: '1\n'.repeat(1000) })
  })

  it('keeps the order across streams', () => {
    const { send, push } = batch()
    push.add({ stream: 'out', text: 'a' })
    push.add({ stream: 'err', text: 'b' })
    push.add({ stream: 'out', text: 'c' })
    push.flush()
    expect(send.mock.calls.map(([c]) => c.stream + c.text)).toEqual(['outa', 'errb', 'outc'])
  })

  it('sends at once when it holds enough', () => {
    const { send, push } = batch({ maxBytes: 4 })
    push.add({ stream: 'out', text: 'abcd' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sends nothing for nothing', () => {
    const { send, push } = batch()
    push.flush()
    vi.advanceTimersByTime(1000)
    expect(send).not.toHaveBeenCalled()
  })
})
