// The header's words after the version, as key ids: utils-style, so no locale is frozen.
const OUTCOME = {
  timeout: { key: 'runner.pane.timeout' },
  'output-limit': { key: 'runner.pane.outputLimit' },
  'spawn-error': { key: 'runner.pane.couldNotStart' }
}

function outcomeDetails({ reason, code, ms }) {
  const details = []
  if (reason === 'exit') details.push({ key: 'runner.pane.exit', params: { code } })
  else if (OUTCOME[reason]) details.push(OUTCOME[reason])
  if (ms != null) details.push({ key: 'runner.pane.ms', params: { ms } })
  return details
}

/**
 * @param {import('../../types').RunState} run
 * @param {{ elapsedSeconds?: number }} [clock]  seconds so far, while it runs
 * @returns {{ key: string, params?: object }[]}
 */
export function runDetails(run, { elapsedSeconds = 0 } = {}) {
  const scope = run.lastLine ? [{ key: 'runner.pane.upToLine', params: { n: run.lastLine } }] : []
  if (run.state === 'running') {
    return [...scope, { key: 'runner.pane.seconds', params: { seconds: elapsedSeconds } }]
  }
  return [...scope, ...outcomeDetails(run)]
}
