import { describe, expect, it } from 'vitest'
import { runDetails } from '../../../../src/renderer/src/features/runner/runDetails'

const ended = (over) => ({ state: 'finished', lastLine: null, ...over })

describe('runDetails', () => {
  it('gives the exit code and the time', () => {
    expect(runDetails(ended({ reason: 'exit', code: 0, ms: 42 }))).toEqual([
      { key: 'runner.pane.exit', params: { code: 0 } },
      { key: 'runner.pane.ms', params: { ms: 42 } }
    ])
  })

  it('says after how many minutes a run was stopped', () => {
    const run = ended({
      state: 'failed',
      reason: 'timeout',
      code: null,
      ms: 5,
      stopAfterMinutes: 5
    })
    expect(runDetails(run)[0]).toEqual({ key: 'runner.pane.timeout', params: { minutes: 5 } })
  })

  it.each([
    ['output-limit', 'runner.pane.outputLimit'],
    ['spawn-error', 'runner.pane.couldNotStart']
  ])('says why a %s run ended', (reason, key) => {
    expect(runDetails(ended({ state: 'failed', reason, code: null, ms: 5 }))[0]).toEqual({ key })
  })

  it('has only the time for a stopped run', () => {
    expect(runDetails(ended({ state: 'stopped', reason: 'stopped', code: null, ms: 5 }))).toEqual([
      { key: 'runner.pane.ms', params: { ms: 5 } }
    ])
  })

  it('counts the seconds while it runs', () => {
    expect(runDetails({ state: 'running', lastLine: null }, { elapsedSeconds: 3 })).toEqual([
      { key: 'runner.pane.seconds', params: { seconds: 3 } }
    ])
  })

  it('leads with the last line a gutter run reaches, running or ended', () => {
    const upToEight = { key: 'runner.pane.upToLine', params: { n: 8 } }
    expect(runDetails({ state: 'running', lastLine: 8 })[0]).toEqual(upToEight)
    expect(runDetails(ended({ reason: 'exit', code: 0, ms: 3, lastLine: 8 }))[0]).toEqual(upToEight)
  })
})
