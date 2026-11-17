// Release gate: waits for CI on the tagged commit, then prints verified=true only if every job passed.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { releaseVerdict } from './lib/releaseVerified.mjs'

const WAIT_MS = 25 * 60 * 1000
const POLL_MS = 30 * 1000
const repo = process.env.GITHUB_REPOSITORY
const sha = process.env.GITHUB_SHA
const api = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }))
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function finishedCiRun() {
  for (const deadline = Date.now() + WAIT_MS; Date.now() < deadline; await sleep(POLL_MS)) {
    const { workflow_runs: runs } = api(
      `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}`
    )
    if (!runs.length) return null
    if (runs.every((run) => run.status === 'completed')) return runs
  }
  return null
}

let verdict
try {
  const runs = await finishedCiRun()
  verdict = runs
    ? releaseVerdict(api(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).check_runs)
    : { verified: false, why: 'no finished CI run on this commit' }
} catch (err) {
  verdict = { verified: false, why: `could not read CI: ${err.message}` }
}
console.log(`${verdict.verified ? 'reusing' : 'retesting'}: ${verdict.why}`)
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `verified=${verdict.verified}\n`)
