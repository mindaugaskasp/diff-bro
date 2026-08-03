#!/usr/bin/env node
// Guards the design system: component stylesheets must resolve colors, type
// sizes and radii through the tokens in src/renderer/src/styles/tokens.css
// instead of restating literals. Literal values are how two panels end up with
// two slightly different buttons — the exact drift ui.css exists to prevent.
//
// Deliberately a small script rather than a stylelint dependency: this repo
// keeps its dependency surface minimal (docs/standards.md), and the rule set is tiny.
//
// Escape hatches, used sparingly and with a reason:
//   * a `/* token-exempt: why */` comment on the line before the declaration
//   * files listed in EXEMPT_FILES below
import { readFileSync, readdirSync } from 'fs'
import { featureStyleDirs } from './lib/featureDirs.mjs'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// A slice keeps its CSS beside its components; without this line that CSS
// leaves the guard silently.
const STYLE_DIRS = ['src/renderer/src/components/styles', ...featureStyleDirs()]
// tokens.css defines the palette, so it is the one place literals belong.
// base.css and ui.css are the system itself.
const EXEMPT_FILES = new Set(['DiffViewer.global.css'])

const RULES = [
  {
    name: 'color',
    // #rgb / #rrggbb / rgb()/rgba()/hsl() literals
    re: /(?:^|[\s:(,])(#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^)]*\))/,
    hint: 'use a color token from tokens.css (var(--…))'
  },
  {
    name: 'font-size',
    re: /font-size:\s*[\d.]+(px|rem|em)\b/,
    hint: 'use var(--font-xs|sm|md|lg)'
  },
  {
    name: 'border-radius',
    re: /border-radius:\s*[\d.]+px/,
    hint: 'use var(--radius-sm|radius|radius-lg|radius-pill)'
  }
]

// Shadows and overlay scrims are intentionally raw rgba(): they are effects,
// not palette colors, and both themes want the same translucent black. Same for
// gradients — their colour stops are a spectrum, not palette tokens.
const ALLOWED_LINE = /box-shadow|text-shadow|backdrop-filter|color-mix|linear-gradient/

function filesToCheck() {
  const out = []
  for (const dir of STYLE_DIRS) {
    for (const name of readdirSync(join(root, dir))) {
      if (name.endsWith('.css') && !EXEMPT_FILES.has(name)) out.push(join(dir, name))
    }
  }
  return out
}

// Comment bodies are blanked, not removed, so reported line numbers still point
// at the real line. A comment explaining WHY a colour was chosen would otherwise
// be reported as the hardcoded colour it is describing.
// token-exempt comments survive: they are the mechanism this file reads, and
// blanking one silently withdraws an exemption someone deliberately wrote.
const blankComments = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.includes('token-exempt') ? m : m.replace(/[^\n]/g, ' ')
  )

function violations(file) {
  const lines = blankComments(readFileSync(join(root, file), 'utf8')).split('\n')
  const found = []
  // Prettier wraps a long allowed declaration (e.g. a multi-stop
  // linear-gradient) across several lines, leaving the colour stops on their own
  // lines with no `linear-gradient` text to match. An allowed declaration exempts
  // ALL of its lines, so once one opens without terminating (`;`) we skip through
  // to the line that closes it.
  let inAllowedBlock = false
  lines.forEach((line, i) => {
    if (inAllowedBlock) {
      if (line.includes(';')) inAllowedBlock = false
      return
    }
    if (ALLOWED_LINE.test(line)) {
      if (!line.includes(';')) inAllowedBlock = true
      return
    }
    if (/token-exempt/.test(lines[i - 1] ?? '')) return
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        found.push({ file, line: i + 1, text: line.trim(), rule })
        break
      }
    }
  })
  return found
}

const all = filesToCheck().flatMap(violations)
if (all.length) {
  console.error(`\nHardcoded style values (${all.length}) — these must go through tokens.css:\n`)
  for (const v of all) {
    console.error(`  ${relative('.', v.file)}:${v.line}  ${v.text}`)
    console.error(`      ${v.rule.name}: ${v.rule.hint}`)
  }
  console.error('\nIf a literal is genuinely right, put `/* token-exempt: reason */` above it.\n')
  process.exit(1)
}
console.log(`style tokens ok (${filesToCheck().length} stylesheets)`)
