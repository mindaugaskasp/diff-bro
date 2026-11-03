import { describe, expect, it } from 'vitest'
import { runDetails } from '../../../../src/renderer/src/features/runner/runDetails'

describe('runDetails', () => {
  it('gives the exit code and the time', () => {
    expect(runDetails({ reason: 'exit', code: 0, ms: 42 })).toEqual([
      { key: 'runner.pane.exit', params: { code: 0 } },
      { key: 'runner.pane.ms', params: { ms: 42 } }
    ])
  })

  it.each([
    ['timeout', 'runner.pane.timeout'],
    ['output-limit', 'runner.pane.outputLimit'],
    ['spawn-error', 'runner.pane.couldNotStart']
  ])('says why a %s run ended', (reason, key) => {
    expect(runDetails({ reason, code: null, ms: 5 })[0]).toEqual({ key })
  })

  it('has only the time for a stopped run', () => {
    expect(runDetails({ reason: 'stopped', code: null, ms: 5 })).toEqual([
      { key: 'runner.pane.ms', params: { ms: 5 } }
    ])
  })

  it('leads with the last line a gutter run reached', () => {
    expect(runDetails({ reason: 'exit', code: 0, ms: 3, upTo: 8 })[0]).toEqual({
      key: 'runner.pane.upToLine',
      params: { n: 8 }
    })
  })

  it('names the line while the run is still going', () => {
    expect(runDetails({ upTo: 8 })).toEqual([{ key: 'runner.pane.upToLine', params: { n: 8 } }])
  })

  it('has nothing before a run has ended', () => {
    expect(runDetails({})).toEqual([])
  })
})
