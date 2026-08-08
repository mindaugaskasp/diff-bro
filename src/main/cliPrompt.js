// `diffbro new snippet`, asked for a line at a time in the terminal.
//
// The reads are SYNCHRONOUS on purpose. This runs in the cold CLI path, before
// `requestSingleInstanceLock` decides whether we are the app or a messenger for
// one already running — the same slot `help` prints from — and that path cannot
// await without restructuring the launch around it.
//
// Prompts go to STDERR. stdout is for output, so `diffbro new snippet > out`
// must not capture the questions.
import { readSync } from 'node:fs'
import { handedOver, paint, syntaxHelp } from './cliTerm'

// Offered by number as well as name, because typing "mermaid" correctly at a
// prompt is a worse experience than typing "7". Anything unrecognised is
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

// End markers that cannot appear in a body by accident, matched only as the
// WHOLE line. `:wq` and `:x` as well as `:q`, because the spelling invites vim
// muscle memory and that is what it types; `:a` abandons, so giving up needs no
// reach for Ctrl+C.
export const BODY_SAVE = [':q', ':wq', ':x']
export const BODY_ABORT = ':a'

/**
 * @param {Array<string|null>} lines  as read; null is end of input
 * @returns {{ content: string, cancelled: boolean }}
 */
export function bodyFrom(lines) {
  const out = []
  for (const line of lines) {
    if (line === null) break
    const said = line.trim()
    if (said === BODY_ABORT) return { content: '', cancelled: true }
    if (BODY_SAVE.includes(said)) break
    out.push(line)
  }
  return { content: out.join('\n'), cancelled: false }
}

/**
 * What the answers add up to, or null when there is nothing to save.
 * @param {{ name?: string, syntax?: string, content?: string, tags?: string[] }} answers
 * @returns {{ name: string, language: string, content: string, tags: string[] }|null}
 */
export function draftFrom({ name, syntax, content, tags = [] }) {
  const body = String(content ?? '')
  if (!body.trim()) return null
  return {
    name: String(name ?? '').trim(),
    language: syntaxFor(syntax),
    content: body,
    // The point of the ask: a snippet made from the terminal stays findable as
    // one afterwards. Any --tag the reader gave joins it.
    tags: ['cli', ...(tags ?? []).map((t) => String(t).trim()).filter(Boolean)]
  }
}

/**
 * How this terminal wants to be written to. NO_COLOR is a convention, not a
 * preference to weigh — https://no-color.org.
 * @returns {{ colour: boolean, width: number }}
 */
export const termFrom = (env = process.env, stream = process.stderr) => ({
  colour: !!stream.isTTY && !env.NO_COLOR,
  width: stream.columns || 80
})

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

// Everything stdin has, for the piped case.
function readAll() {
  const chunks = []
  for (;;) {
    const buf = Buffer.alloc(65536)
    let got
    try {
      got = readSync(0, buf, 0, buf.length, null)
    } catch {
      break
    }
    if (!got) break
    chunks.push(buf.subarray(0, got))
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\n$/, '')
}

/**
 * Everything the conversation touches outside itself. Injectable because a
 * pipe is not a TTY: an e2e driving stdin can only ever exercise the PIPED
 * path, so the interactive one is only testable if its IO can be handed in.
 * @returns {{ isTty: boolean, readLine: () => string|null, readAll: () => string,
 *             write: (text: string) => void, term: { colour: boolean, width: number } }}
 */
export const defaultIo = () => ({
  isTty: !!process.stdin.isTTY,
  readLine,
  readAll,
  // stdout is for output, so the questions go to stderr — a redirect must
  // capture the confirmation and not the conversation.
  write: (text) => process.stderr.write(text),
  term: termFrom()
})

function ask(io, label, hint) {
  const { term } = io
  io.write(`${paint('cyan', label, term)} ${paint('dim', hint, term)} ${paint('dim', '>', term)} `)
  return io.readLine()
}

// Asked only for what the flags did not already answer.
function collect(io, flags) {
  const name = flags.name ?? ask(io, 'Name', '(optional)')
  if (name === null) return null
  let syntax = flags.syntax
  if (syntax === undefined) {
    syntax = ask(io, 'Syntax', `[1-${SYNTAXES.length}, name, or enter to detect]`)
    io.write(`${syntaxHelp(SYNTAXES, io.term.width, io.term).join('\n')}\n`)
  }
  return { name, syntax }
}

function readBody(io) {
  const how = `— ${BODY_SAVE.join(' / ')} saves · ${BODY_ABORT} abandons · ^C cancels`
  io.write(`\n${paint('cyan', 'Content', io.term)} ${paint('dim', how, io.term)}\n`)
  const lines = []
  for (;;) {
    const line = io.readLine()
    lines.push(line)
    const said = line?.trim()
    if (line === null || said === BODY_ABORT || BODY_SAVE.includes(said)) break
  }
  return bodyFrom(lines)
}

/**
 * The whole interaction. Returns null when the reader abandoned it, or gave an
 * empty body twice.
 * @param {{ name?: string, syntax?: string, tag?: string[] }} [flags]
 * @returns {{ name: string, language: string, content: string, tags: string[] }|null}
 */
export function promptSnippet(flags = {}, io = defaultIo()) {
  // Not a terminal: the whole of stdin is the body. Piped input has seen no
  // prompt, so reading it as answers is how `cat f.sql | diffbro …` saved the
  // wrong thing.
  if (!io.isTty) return draftFrom({ ...flags, content: io.readAll(), tags: flags.tag })

  const asked = collect(io, flags)
  if (!asked) return null
  // Twice, then give up: an empty body used to exit and take the name and
  // syntax already typed with it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, cancelled } = readBody(io)
    if (cancelled) return null
    const draft = draftFrom({ ...asked, content, tags: flags.tag })
    if (draft) return draft
    if (attempt === 0) {
      io.write(paint('amber', '  Nothing typed — try again, or :a to abandon.\n', io.term))
    }
  }
  return null
}

/** What to print once the draft is on its way. */
export const handoffLine = (draft) => handedOver(draft, termFrom())
