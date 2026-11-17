const OURS = /^(quick|check|packaged|e2e)\b/
const REQUIRED = ['check (ubuntu', 'check (windows', 'packaged', 'e2e (']

// Judges CI on the tagged commit itself, so nothing is assumed about how it was merged.
export function releaseVerdict(checkRuns) {
  const ours = checkRuns.filter((run) => OURS.test(run.name))
  const missing = REQUIRED.filter((prefix) => !ours.some((run) => run.name.startsWith(prefix)))
  if (missing.length) return { verified: false, why: `CI did not run: ${missing.join(', ')}` }
  const notGreen = ours.filter((run) => run.conclusion !== 'success').map((run) => run.name)
  if (notGreen.length) return { verified: false, why: `not green: ${notGreen.join(', ')}` }
  return { verified: true, why: `CI passed ${ours.length} jobs on this commit` }
}
