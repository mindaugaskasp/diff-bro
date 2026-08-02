#!/usr/bin/env node
// Totals the Claude token usage recorded for this repo between two timestamps,
// for the `Claude tokens used` row in specs/<slug>/plan.md.
//
// Reads Claude Code's own session transcripts (~/.claude/projects/*/*.jsonl) —
// no dependency, no network, nothing to install. A feature usually spans
// several sessions, so every transcript whose `cwd` is inside this repo is
// scanned and the --since window does the scoping.
//
// Dedupe is not optional: a streamed assistant message is written to the
// transcript up to four times, each copy carrying the SAME usage object and
// requestId. Summing lines instead of requests overcounts by up to 4x.
//
//   node .claude/skills/implement/token-usage.mjs --since 2026-08-02T07:00:00Z
//   node .claude/skills/implement/token-usage.mjs --since <iso> --until <iso> --json
import { readFileSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}

const since = flag('--since')
const until = flag('--until')
const asJson = args.includes('--json')
const root = flag('--root') || process.cwd()

if (!since) {
  console.error('usage: token-usage.mjs --since <iso-timestamp> [--until <iso>] [--json]')
  console.error('  --since is the baseline recorded in the plan header when the build started.')
  process.exit(2)
}

const sinceMs = Date.parse(since)
const untilMs = until ? Date.parse(until) : Infinity
if (Number.isNaN(sinceMs) || Number.isNaN(untilMs)) {
  console.error('error: --since/--until must be parseable ISO timestamps')
  process.exit(2)
}

const projectsDir = join(homedir(), '.claude', 'projects')

function transcripts() {
  const out = []
  for (const entry of readdirSync(projectsDir)) {
    const dir = join(projectsDir, entry)
    if (!statSync(dir).isDirectory()) continue
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.jsonl')) out.push(join(dir, name))
    }
  }
  return out
}

const inRepo = (cwd) => cwd === root || (cwd || '').startsWith(root + '/')

const zero = () => ({
  input: 0,
  output: 0,
  cacheCreate: 0,
  cacheRead: 0,
  requests: 0
})

const totals = zero()
const bySidechain = { main: zero(), subagent: zero() }
const byModel = new Map()
const seen = new Set()
let firstTs = null
let lastTs = null

function add(bucket, u) {
  bucket.input += u.input_tokens || 0
  bucket.output += u.output_tokens || 0
  bucket.cacheCreate += u.cache_creation_input_tokens || 0
  bucket.cacheRead += u.cache_read_input_tokens || 0
  bucket.requests += 1
}

for (const file of transcripts()) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const line of text.split('\n')) {
    if (!line) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    const usage = rec.message?.usage
    if (!usage || !inRepo(rec.cwd)) continue

    const ts = Date.parse(rec.timestamp)
    if (Number.isNaN(ts) || ts < sinceMs || ts > untilMs) continue

    const key = rec.requestId || rec.message?.id
    if (key) {
      if (seen.has(key)) continue
      seen.add(key)
    }

    add(totals, usage)
    add(rec.isSidechain ? bySidechain.subagent : bySidechain.main, usage)

    const model = rec.message?.model || 'unknown'
    if (!byModel.has(model)) byModel.set(model, zero())
    add(byModel.get(model), usage)

    if (firstTs === null || ts < firstTs) firstTs = ts
    if (lastTs === null || ts > lastTs) lastTs = ts
  }
}

const sum = (b) => b.input + b.output + b.cacheCreate + b.cacheRead
const n = (v) => v.toLocaleString('en-US')

if (asJson) {
  console.log(
    JSON.stringify(
      {
        since,
        until: until || null,
        firstActivity: firstTs && new Date(firstTs).toISOString(),
        lastActivity: lastTs && new Date(lastTs).toISOString(),
        totals: { ...totals, total: sum(totals) },
        main: { ...bySidechain.main, total: sum(bySidechain.main) },
        subagent: { ...bySidechain.subagent, total: sum(bySidechain.subagent) },
        byModel: Object.fromEntries([...byModel].map(([k, v]) => [k, { ...v, total: sum(v) }]))
      },
      null,
      2
    )
  )
  process.exit(0)
}

if (totals.requests === 0) {
  console.log(`No usage recorded for ${root} since ${since}.`)
  console.log('Check the baseline timestamp — it may be later than the work.')
  process.exit(0)
}

console.log(`Window   ${since} → ${until || 'now'}`)
console.log(`Activity ${new Date(firstTs).toISOString()} → ${new Date(lastTs).toISOString()}`)
console.log(`Requests ${n(totals.requests)}\n`)
console.log('| category | tokens |')
console.log('|---|---:|')
console.log(`| input | ${n(totals.input)} |`)
console.log(`| output | ${n(totals.output)} |`)
console.log(`| cache write | ${n(totals.cacheCreate)} |`)
console.log(`| cache read | ${n(totals.cacheRead)} |`)
console.log(`| **total** | **${n(sum(totals))}** |`)

if (bySidechain.subagent.requests > 0) {
  console.log(
    `\nmain ${n(sum(bySidechain.main))} · subagents ${n(sum(bySidechain.subagent))} ` +
      `(${bySidechain.subagent.requests} requests)`
  )
}
if (byModel.size > 1) {
  console.log('\nby model:')
  for (const [model, b] of byModel) console.log(`  ${model}  ${n(sum(b))}`)
}
