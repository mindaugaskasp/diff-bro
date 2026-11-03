// The header's words after the version, as key ids: utils-style, so no locale is frozen.
const OUTCOME = {
  timeout: { key: 'runner.pane.timeout' },
  'output-limit': { key: 'runner.pane.outputLimit' },
  'spawn-error': { key: 'runner.pane.couldNotStart' }
}

/**
 * @param {{ reason?: string, code?: number|null, ms?: number }} run
 * @returns {{ key: string, params?: object }[]}
 */
export function runDetails({ reason, code, ms }) {
  const details = []
  if (reason === 'exit') details.push({ key: 'runner.pane.exit', params: { code } })
  else if (OUTCOME[reason]) details.push(OUTCOME[reason])
  if (ms != null) details.push({ key: 'runner.pane.ms', params: { ms } })
  return details
}
