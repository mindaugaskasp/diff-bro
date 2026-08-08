#!/usr/bin/env node
// Counts the raw strings still hardcoded in templates AND in <script setup>
// label tables, and holds the number to a
// committed baseline, which is now 0 — every string is in the catalogue.
//
// It stays a baseline rather than a bare `=== 0` because that is what carried
// the migration from 193 down, and because a future surface that genuinely
// cannot be extracted gets one reviewed line rather than a disabled rule.
//
//   node scripts/check-raw-text.mjs             fail if the count rose
//   node scripts/check-raw-text.mjs --retighten lower the baseline to today's
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eslintJsonCommand } from './lib/eslintRun.mjs'

const BASELINE = fileURLToPath(new URL('./lib/rawTextBaseline.json', import.meta.url))
const root = fileURLToPath(new URL('..', import.meta.url))

const { command, args } = eslintJsonCommand({
  config: 'eslint.i18n.mjs',
  targets: ['src/renderer/src']
})

let report
try {
  report = JSON.parse(
    execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  )
} catch (err) {
  // eslint exits non-zero when it reports errors; the JSON is still on stdout.
  // A SPAWN failure has no stdout at all, and reading it blindly turned that
  // into `JSON.parse(undefined)` — say what actually went wrong instead.
  if (typeof err.stdout !== 'string') {
    throw new Error(`could not run eslint: ${err.message}`, { cause: err })
  }
  report = JSON.parse(err.stdout)
}

// eslint-plugin-vue-i18n's no-raw-text only sees TEMPLATE TEXT. Two whole
// classes of UI copy sit outside it: a string in <script setup>, and a string
// inside an ATTRIBUTE EXPRESSION (`:data-tip="`Format: ${x}`"`). The first
// version of this scan looked for `'Capital word followed by lowercase ones'`
// in the script block alone and reported zero while 65 strings were live — a
// ratchet whose blind spot is unmeasured is not a ratchet. This one reads the
// whole file.
const COPY = /(['"])((?:[A-Z]|\$\{)[^'"`\n\\]*?)\1/g
// Backticks get their own pass: a template literal may legitimately contain a
// quote (`${xs.join(', ')}`), and stopping at one hid the longest strings here.
const TEMPLATE = /`((?:[A-Z]|\$\{)[^`\n]*?)`/g
// The one thing that starts with a capital, holds a space and is not prose.
const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz][\d\s.,-]/
// A template literal can open on its interpolation and still be prose — the
// `${n} placeholders you're asked to fill` in SnippetRow survived the first
// version of this check for exactly that reason. Two prose words is the bar.
const PROSE_AFTER_SLOT = /\}[^${]*[a-z]{2,}\s+[a-z]{2,}/
const isCopy = (v) =>
  /\s/.test(v) && !SVG_PATH.test(v) && (!v.startsWith('${') || PROSE_AFTER_SLOT.test(v))

function vueFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...vueFiles(p))
    else if (e.name.endsWith('.vue')) out.push(p)
  }
  return out
}

const isComment = (line) => /^(\/\/|\*|<!--)/.test(line.trimStart())

function copyInScript(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, i) =>
      isComment(line)
        ? []
        : [...line.matchAll(COPY), ...line.matchAll(TEMPLATE)]
            .map((m) => m[m.length - 1])
            .filter(isCopy)
            .map((v) => `${relative(root, file)}:${i + 1}  ${v}`)
    )
}

const scriptRawText = () => vueFiles(join(root, 'src/renderer/src')).flatMap(copyInScript)

const inScript = scriptRawText()
if (inScript.length) {
  console.error(`raw UI copy in <script setup> (must be a catalogue key): ${inScript.length}`)
  for (const hit of inScript) console.error(`  ${hit}`)
  process.exit(1)
}

const count = report.reduce(
  (n, f) => n + f.messages.filter((m) => m.ruleId?.endsWith('no-raw-text')).length,
  0
)
const { max } = JSON.parse(readFileSync(BASELINE, 'utf8'))

if (process.argv.includes('--retighten')) {
  if (count < max) {
    writeFileSync(BASELINE, `${JSON.stringify({ max: count }, null, 2)}\n`)
    console.log(`raw text: baseline lowered ${max} → ${count}`)
  } else {
    console.log(`raw text: ${count} — baseline ${max} already tight`)
  }
  process.exit(0)
}

if (count > max) {
  console.error(`raw text: ${count} hardcoded strings, baseline is ${max} — extract, don't add.`)
  console.error('  Offenders: npx eslint --no-config-lookup -c eslint.i18n.mjs src/renderer/src')
  process.exit(1)
}
if (count < max) {
  console.error(`raw text: ${count} < baseline ${max} — run --retighten to lock the win in.`)
  process.exit(1)
}
console.log(`raw text: ${count} still hardcoded, held at the baseline`)
