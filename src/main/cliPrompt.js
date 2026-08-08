// `diffbro new snippet`, asked for a line at a time in the terminal.
//
// The reads are SYNCHRONOUS on purpose. This runs in the cold CLI path, before
// `requestSingleInstanceLock` decides whether we are the app or a messenger for
// one already running — the same slot `help` prints from — and that path cannot
// await without restructuring the launch around it.
import { readSync } from 'node:fs'

// Offered by number as well as name, because typing "mermaid" correctly at a
// prompt is a worse experience than typing "6". Anything unrecognised is
// `auto`, which is what the editor does with a snippet nobody classified.
export const SYNTAXES = [
  'plaintext',
  'json',
  'yaml',
  'xml',
  'sql',
  'markdown',
  'mermaid',
  'javascript',
  'python',
  'shell'
]

/** @param {string} [answer] */
export function syntaxFor(answer) {
  const said = String(answer ?? '')
    .trim()
    .toLowerCase()
  if (!said) return 'auto'
  if (SYNTAXES.includes(said)) return said
  const n = Number(said)
  return Number.isInteger(n) && n >= 1 && n <= SYNTAXES.length ? SYNTAXES[n - 1] : 'auto'
}

/**
 * What the answers add up to, or null when there is nothing to save.
 * @param {{ name?: string, syntax?: string, content?: string }} answers
 * @returns {{ name: string, language: string, content: string, tags: string[] }|null}
 */
export function draftFrom({ name, syntax, content }) {
  const body = String(content ?? '')
  if (!body.trim()) return null
  return {
    name: String(name ?? '').trim(),
    language: syntaxFor(syntax),
    content: body,
    // The point of the ask: a snippet made from the terminal stays findable as
    // one afterwards.
    tags: ['cli']
  }
}

const BUF = Buffer.alloc(1)

// One line from stdin, synchronously. Reading a byte at a time is the only way
// to stop at the newline without swallowing what comes after it — the content
// prompt reads many lines from the same stream.
function readLine() {
  let out = ''
  for (;;) {
    let got
    try {
      got = readSync(0, BUF, 0, 1, null)
    } catch {
      // EOF on a closed stdin, or a pipe that went away mid-answer.
      return out || null
    }
    if (!got) return out || null
    const ch = BUF.toString('utf8')
    if (ch === '\n') return out
    if (ch !== '\r') out += ch
  }
}

const ask = (question) => {
  process.stdout.write(question)
  return readLine()
}

/**
 * The whole interaction. Returns null when the reader gave up (^D) or typed no
 * body at all.
 * @returns {{ name: string, language: string, content: string, tags: string[] }|null}
 */
export function promptSnippet() {
  const name = ask('Name: ')
  if (name === null) return null
  process.stdout.write(`\nSyntax:\n${SYNTAXES.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n`)
  const syntax = ask('Choose a number or name (Enter to detect it): ')
  process.stdout.write('\nContent — finish with a line containing only a full stop:\n')

  const lines = []
  for (;;) {
    const line = readLine()
    if (line === null || line === '.') break
    lines.push(line)
  }
  return draftFrom({ name, syntax, content: lines.join('\n') })
}
