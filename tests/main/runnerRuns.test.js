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

  it('refuses a curl snippet that is not one curl command', () => {
    const config = { languages: { curl: { enabled: true, path: '/usr/bin/curl' } } }
    expect(refusalFor(request({ language: 'curl', code: 'curl x', config }))).toBeNull()
    expect(refusalFor(request({ language: 'curl', code: 'curl x | sh', config }))).toBe(
      'bad-command'
    )
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
    return { handles, runs: createRuns({ start }) }
  }
  const begin = (runs, { key = 'tab', owner, onOutput = vi.fn(), onExit = vi.fn() } = {}) =>
    runs.begin({ owner, key, exe: 'x', language: 'php', code: '', onOutput, onExit })
  const stopCounts = (handles) => handles.map((h) => h.stop.mock.calls.length)

  it('gives each run its own id', () => {
    const { runs } = harness()
    expect(begin(runs, { key: 'a' })).not.toBe(begin(runs, { key: 'b' }))
  })

  it('replaces a run still going in the same tab, and leaves other tabs alone', () => {
    const { runs, handles } = harness()
    begin(runs, { key: 'a' })
    begin(runs, { key: 'b' })
    begin(runs, { key: 'a' })
    expect(stopCounts(handles)).toEqual([1, 0, 0])
  })

  it('stops by id, and ignores one it does not know', () => {
    const { runs, handles } = harness()
    const id = begin(runs)
    runs.stop('nope')
    expect(stopCounts(handles)).toEqual([0])
    runs.stop(id)
    expect(stopCounts(handles)).toEqual([1])
  })

  it('forgets a finished run, and passes the exit on', () => {
    const { runs, handles } = harness()
    const onExit = vi.fn()
    const id = begin(runs, { onExit })
    handles[0].options.onExit({ reason: 'exit' })
    expect(onExit).toHaveBeenCalledWith({ reason: 'exit' })
    runs.stop(id)
    expect(stopCounts(handles)).toEqual([0])
  })

  it('lets only the window that started a run stop it', () => {
    const { runs, handles } = harness()
    const id = begin(runs, { owner: 1 })
    runs.stopIfOwner(id, 2)
    expect(stopCounts(handles)).toEqual([0])
    runs.stopIfOwner(id, 1)
    expect(stopCounts(handles)).toEqual([1])
  })

  it('keeps tabs of different windows apart, even under the same key', () => {
    const { runs, handles } = harness()
    begin(runs, { owner: 1 })
    begin(runs, { owner: 2 })
    expect(stopCounts(handles)).toEqual([0, 0])
  })

  it('stops every run of a window that went away, and no other', () => {
    const { runs, handles } = harness()
    begin(runs, { owner: 1, key: 'a' })
    begin(runs, { owner: 1, key: 'b' })
    begin(runs, { owner: 2, key: 'a' })
    runs.stopOwnedBy(1)
    expect(stopCounts(handles)).toEqual([1, 1, 0])
  })

  it('sends output it was still holding before the exit', () => {
    const { runs, handles } = harness()
    const sent = []
    begin(runs, {
      onOutput: (chunk) => sent.push(['out', chunk.text]),
      onExit: () => sent.push(['exit'])
    })
    handles[0].options.onOutput({ stream: 'out', text: 'last words' })
    handles[0].options.onExit({ reason: 'exit' })
    expect(sent).toEqual([['out', 'last words'], ['exit']])
  })

  it('stops everything', () => {
    const { runs, handles } = harness()
    begin(runs, { key: 'a' })
    begin(runs, { key: 'b' })
    runs.stopAll()
    expect(stopCounts(handles)).toEqual([1, 1])
  })
})

// One message per interval, not per printed line: each message costs the window a re-render.
describe('createOutputBatch', () => {
  afterEach(() => vi.useRealTimers())
  function batcherFor(options = {}) {
    vi.useFakeTimers()
    const send = vi.fn()
    return { send, batcher: createOutputBatch({ send, ...options }) }
  }

  it('joins chunks of one stream into one message per interval', () => {
    const { send, batcher } = batcherFor({ intervalMs: 50 })
    for (let i = 0; i < 1000; i++) batcher.add({ stream: 'out', text: '1\n' })
    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(send.mock.calls).toEqual([[{ stream: 'out', text: '1\n'.repeat(1000) }]])
  })

  it('keeps the order across streams', () => {
    const { send, batcher } = batcherFor()
    batcher.add({ stream: 'out', text: 'a' })
    batcher.add({ stream: 'err', text: 'b' })
    batcher.add({ stream: 'out', text: 'c' })
    batcher.flush()
    expect(send.mock.calls.map(([c]) => c.stream + c.text)).toEqual(['outa', 'errb', 'outc'])
  })

  it('sends at once when it holds enough', () => {
    const { send, batcher } = batcherFor({ maxChars: 4 })
    batcher.add({ stream: 'out', text: 'abcd' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sends nothing for nothing', () => {
    const { send, batcher } = batcherFor()
    batcher.flush()
    vi.advanceTimersByTime(1000)
    expect(send).not.toHaveBeenCalled()
  })
})
