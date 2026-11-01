import { describe, expect, it, vi } from 'vitest'
import { createRuns, refusalFor } from '../../src/main/runnerRuns'

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

  it('stops everything', () => {
    const { runs, handles } = harness()
    begin(runs, 'a')
    begin(runs, 'b')
    runs.stopAll()
    expect(handles.every((h) => h.stop.mock.calls.length === 1)).toBe(true)
  })
})
