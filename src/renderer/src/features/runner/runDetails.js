// The header's words after the version, as key ids: utils-style, so no locale is frozen.
const OUTCOME = {
  'output-limit': { key: 'runner.pane.outputLimit' },
  'spawn-error': { key: 'runner.pane.couldNotStart' }
}

function outcomeDetails({ reason, code, ms, stopAfterMinutes }) {
  const details = []
  if (reason === 'exit') details.push({ key: 'runner.pane.exit', params: { code } })
  else if (reason === 'timeout') {
    details.push({ key: 'runner.pane.timeout', params: { minutes: stopAfterMinutes } })
  } else if (OUTCOME[reason]) details.push(OUTCOME[reason])
  if (ms != null) details.push({ key: 'runner.pane.ms', params: { ms } })
  return details
}

const PANE_SCOPE = {
  one: 'runner.pane.line',
  upTo: 'runner.pane.upToLine',
  span: 'runner.pane.lines'
}
const BUTTON_SCOPE = { one: 'runner.runLine', upTo: 'runner.runUpToLine', span: 'runner.runLines' }

function scopeOf(keys, { firstLine, lastLine }) {
  if (firstLine === lastLine) return { key: keys.one, params: { n: lastLine } }
  if (firstLine === 1) return { key: keys.upTo, params: { n: lastLine } }
  return { key: keys.span, params: { from: firstLine, to: lastLine } }
}

/**
 * @param {import('../../types').LineRange} range
 * @returns {{ key: string, params: object }}
 */
export const runButtonLabel = (range) => scopeOf(BUTTON_SCOPE, range)

/**
 * @param {import('../../types').RunState} run
 * @param {{ elapsedSeconds?: number }} [clock]  seconds so far, while it runs
 * @returns {{ key: string, params?: object }[]}
 */
export function runDetails(run, { elapsedSeconds = 0 } = {}) {
  const scope = run.lastLine ? [scopeOf(PANE_SCOPE, run)] : []
  if (run.state === 'running') {
    return [...scope, { key: 'runner.pane.seconds', params: { seconds: elapsedSeconds } }]
  }
  return [...scope, ...outcomeDetails(run)]
}
