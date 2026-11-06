import { describe, expect, it } from 'vitest'
import { runButtonLabel, runDetails } from '../../../../src/renderer/src/features/runner/runDetails'

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
    expect(runDetails({ state: 'running', firstLine: 1, lastLine: 8 })[0]).toEqual(upToEight)
    expect(
      runDetails(ended({ reason: 'exit', code: 0, ms: 3, firstLine: 1, lastLine: 8 }))[0]
    ).toEqual(upToEight)
  })

  it('names the lines of a command that ran on its own', () => {
    expect(runDetails({ state: 'running', firstLine: 4, lastLine: 6 })[0]).toEqual({
      key: 'runner.pane.lines',
      params: { from: 4, to: 6 }
    })
    expect(runDetails({ state: 'running', firstLine: 4, lastLine: 4 })[0]).toEqual({
      key: 'runner.pane.line',
      params: { n: 4 }
    })
  })
})

describe('runButtonLabel', () => {
  it.each([
    [
      { firstLine: 1, lastLine: 5 },
      { key: 'runner.runUpToLine', params: { n: 5 } }
    ],
    [
      { firstLine: 3, lastLine: 3 },
      { key: 'runner.runLine', params: { n: 3 } }
    ],
    [
      { firstLine: 1, lastLine: 1 },
      { key: 'runner.runLine', params: { n: 1 } }
    ],
    [
      { firstLine: 3, lastLine: 5 },
      { key: 'runner.runLines', params: { from: 3, to: 5 } }
    ]
  ])('labels %o', (range, label) => {
    expect(runButtonLabel(range)).toEqual(label)
  })
})
