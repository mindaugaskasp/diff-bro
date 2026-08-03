// Two structural ratchets over src/:
//   1. import cycles — a new one fails, a baselined one that disappears fails
//      as stale so the baseline cannot outlive the tangle it recorded
//   2. LEGACY_SIZE entries whose file has dropped under its cap
// Cores live in lib/structure.mjs; this file supplies the tree.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { loadESLint } from 'eslint'
import { buildGraph, cycleKey, findCycles, staleEntries } from './lib/structure.mjs'
import { LEGACY_SIZE } from './lib/legacySize.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const BASELINE = 'scripts/structure-baseline.json'
const LEGACY_FILE = 'scripts/lib/legacySize.mjs'
const EXTS = ['.js', '.mjs', '.vue']

const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`
    if (statSync(join(root, rel)).isDirectory()) return walk(rel)
    return EXTS.some((e) => name.endsWith(e)) ? [rel] : []
  })

const readBaseline = () => {
  try {
    return JSON.parse(readFileSync(join(root, BASELINE), 'utf8'))
  } catch {
    return { cycles: [] }
  }
}

function cycleFindings(cycles, baseline) {
  const found = new Map(cycles.map((c) => [cycleKey(c), c]))
  const known = new Set(baseline.cycles.map((c) => c.key))
  const findings = []
  for (const [key, members] of found) {
    if (!known.has(key)) findings.push(`new import cycle: ${members.join(' → ')} → ${members[0]}`)
  }
  for (const entry of baseline.cycles) {
    if (!found.has(entry.key)) {
      findings.push(`baselined cycle is gone — delete it from ${BASELINE}: ${entry.key}`)
    }
  }
  return findings
}

// Function length comes from ESLint rather than a second implementation of
// "how long is this function", which would drift from the rule it guards.
async function measure(files) {
  const measured = {}
  for (const file of files) {
    // trimEnd: a newline-terminated file splits into a phantom empty last
    // element, and counting it writes caps one line looser than the rule they
    // guard — so "not one line more" would have been "not two".
    const text = readFileSync(join(root, file), 'utf8').trimEnd()
    measured[file] = { fn: 0, file: text ? text.split('\n').length : 0 }
  }
  if (!files.length) return measured

  const ESLint = await loadESLint({ useFlatConfig: true })
  const results = await new ESLint({
    cwd: root,
    overrideConfig: {
      rules: { 'max-lines-per-function': ['error', { max: 1, skipBlankLines: false }] }
    }
  }).lintFiles(files)

  for (const result of results) {
    const rel = result.filePath.replace(root, '')
    for (const m of result.messages) {
      if (m.ruleId !== 'max-lines-per-function') continue
      const lines = Number(m.message.match(/\((\d+)\)/)?.[1] ?? 0)
      measured[rel].fn = Math.max(measured[rel].fn, lines)
    }
  }
  return measured
}

const sizeFindings = (measured) =>
  staleEntries(LEGACY_SIZE, measured).map(({ file, kind, cap, actual }) =>
    kind === 'gone'
      ? `LEGACY_SIZE names a file that no longer exists: ${file}`
      : `${file} beat its ${kind} cap (${actual} < ${cap}) — delete the entry from scripts/lib/legacySize.mjs`
  )

const files = walk('src')
const cycles = findCycles(buildGraph(files, (f) => readFileSync(join(root, f), 'utf8')))

if (process.argv.includes('--write-baseline')) {
  const cycleEntries = cycles.map((members) => ({ key: cycleKey(members), members }))
  writeFileSync(join(root, BASELINE), `${JSON.stringify({ cycles: cycleEntries }, null, 2)}\n`)
  console.log(`wrote ${BASELINE} with ${cycles.length} cycles`)
  process.exit(0)
}

// Rewrites beaten caps DOWN to what the files now measure, and drops entries
// that cleared both caps. It cannot raise a number or add an entry — growing
// past a cap has to be dealt with, not recorded.
if (process.argv.includes('--retighten')) {
  const measured = await measure(Object.keys(LEGACY_SIZE))
  const tightened = {}
  for (const [file, caps] of Object.entries(LEGACY_SIZE)) {
    const now = measured[file]
    if (!now) continue
    const kept = {}
    if (caps.fn && now.fn > 60) kept.fn = Math.min(caps.fn, now.fn)
    if (caps.file && now.file > 250) kept.file = Math.min(caps.file, now.file)
    if (Object.keys(kept).length) tightened[file] = kept
  }
  const rows = Object.keys(tightened)
    .sort()
    .map((f) => {
      const caps = tightened[f]
      const parts = [caps.fn && `fn: ${caps.fn}`, caps.file && `file: ${caps.file}`].filter(Boolean)
      return `  '${f}': { ${parts.join(', ')} }`
    })
  const src = readFileSync(join(root, LEGACY_FILE), 'utf8')
  writeFileSync(
    join(root, LEGACY_FILE),
    src.replace(
      /export const LEGACY_SIZE = \{[\s\S]*?\n\}/,
      `export const LEGACY_SIZE = {\n${rows.join(',\n')}\n}`
    )
  )
  console.log(`retightened: ${Object.keys(LEGACY_SIZE).length} → ${rows.length} entries`)
  process.exit(0)
}

const findings = [
  ...cycleFindings(cycles, readBaseline()),
  ...sizeFindings(await measure(Object.keys(LEGACY_SIZE)))
]

if (findings.length) {
  console.error(`\nstructure: ${findings.length} finding(s)\n`)
  for (const f of findings) console.error(`  ✗ ${f}`)
  console.error('')
  process.exit(1)
}

console.log(
  `structure: ${files.length} files, ${cycles.length} baselined cycles, ` +
    `${Object.keys(LEGACY_SIZE).length} legacy size entries — clean`
)
