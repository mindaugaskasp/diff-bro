// `diffbro new snippet`, asked for a line at a time in the terminal.
//
// It runs in the cold CLI path, before `requestSingleInstanceLock` decides
// whether we are the app or a messenger for one already running — the same slot
// `help` prints from — so the launch is sequenced around it.
//
// Prompts go to STDERR. stdout is for output, so `diffbro new snippet > out`
// must not capture the questions.
import { createInterface } from 'node:readline/promises'
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

// Vim's own meanings, because the spelling borrows vim's muscle memory: :wq
// and :x WRITE and quit, :q quits WITHOUT writing. Reading :q as save was
// backwards for exactly the readers the notation was chosen for. Matched only
// as a whole line, so `echo ":wq"` stays content.
//
// Ctrl+C is NOT offered:
// Electron's main process swallows SIGINT, and neither a process handler nor
// readline's own SIGINT event settles the pending question — the command hangs.
// Ctrl+D (end of input) is the signal-free way out, and it works.
export const BODY_SAVE = [':wq', ':x']
export const BODY_ABORT = [':q', ':a']

/**
 * @param {Array<string|null>} lines  as read; null is end of input
 * @returns {{ content: string, cancelled: boolean }}
 */
export function bodyFrom(lines) {
  const out = []
  for (const line of lines) {
    if (line === null) break
    const said = line.trim()
    if (BODY_ABORT.includes(said)) return { content: '', cancelled: true }
    if (BODY_SAVE.includes(said)) break
    out.push(line)
  }
  return { content: out.join('\n'), cancelled: false }
}

// An unnamed snippet from the terminal says so, and when. The store's own
// fallback is "Untitled <date>", which loses where it came from.
export const cliSnippetName = (now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`
  return `${stamp} - cli snippet`
}

/**
 * What the answers add up to, or null when there is nothing to save.
 * @param {{ name?: string, syntax?: string, content?: string, tags?: string[] }} answers
 * @returns {{ name: string, language: string, content: string, tags: string[] }|null}
 */
export function draftFrom({ name, syntax, content, tags = [], now = new Date() }) {
  const body = String(content ?? '')
  if (!body.trim()) return null
  return {
    name: String(name ?? '').trim() || cliSnippetName(now),
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

/**
 * Everything the conversation touches outside itself, injectable for tests.
 *
 * `readline` rather than a synchronous read of fd 0. The sync version could not
 * be interrupted: Electron installs its own SIGINT handler that posts to the UI
 * thread, and that thread was the one blocked in the read — so Ctrl+C at a
 * prompt hung the process until it was killed. readline turns the event loop,
 * so the signal lands; it also brings the line editing the raw alternative
 * would have cost.
 * @returns {{ isTty: boolean, ask: (q: string) => Promise<string|null>,
 *             readAll: () => Promise<string>, write: (t: string) => void,
 *             close: () => void, term: { colour: boolean, width: number } }}
 */
export function defaultIo() {
  let rl = null
  let cancelled = false
  // Built on FIRST ASK, never up front: a piped run asks nothing, and an
  // interface created there consumes stdin out from under readAll and keeps the
  // event loop alive — the command never exited.
  // An AbortController, not just rl.close(): a pending question() never settles
  // when the interface closes under it, so Ctrl+C hung the command instead of
  // cancelling it. Aborting is what rejects the promise we are waiting on.
  const stop = new AbortController()
  const reader = () => {
    if (rl) return rl
    rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true })
    rl.on('SIGINT', () => {
      cancelled = true
      stop.abort()
      rl.close()
    })
    return rl
  }
  return {
    isTty: !!process.stdin.isTTY,
    // null means "give up" — end of input, or Ctrl+C.
    ask: async (question) => {
      if (cancelled) return null
      const answer = await reader()
        .question(question, { signal: stop.signal })
        .catch(() => null)
      return cancelled ? null : answer
    },
    readAll: async () => {
      const chunks = []
      for await (const chunk of process.stdin) chunks.push(chunk)
      return Buffer.concat(chunks).toString('utf8').replace(/\n$/, '')
    },
    // stdout is for output, so the questions go to stderr — a redirect must
    // capture the confirmation and not the conversation.
    write: (text) => process.stderr.write(text),
    close: () => rl?.close(),
    term: termFrom()
  }
}

async function ask(io, label, hint) {
  const { term } = io
  const q = `${paint('cyan', label, term)} ${paint('dim', hint, term)} ${paint('dim', '>', term)} `
  return io.ask(q)
}

// Asked only for what the flags did not already answer.
async function collect(io, flags) {
  const name = flags.name ?? (await ask(io, 'Name', '(optional)'))
  if (name === null) return null
  let syntax = flags.syntax
  if (syntax === undefined) {
    // Before the question, not after it: the reader has to see the list they
    // are being asked to pick from.
    io.write(`${syntaxHelp(SYNTAXES, io.term.width, io.term).join('\n')}\n`)
    syntax = await ask(io, 'Syntax', `[1-${SYNTAXES.length}, name, or enter to detect]`)
    if (syntax === null) return null
  }
  return { name, syntax }
}

async function readBody(io) {
  const how = `— ${BODY_SAVE.join(' / ')} saves · ${BODY_ABORT.join(' / ')} discards · ^D quits`
  io.write(`\n${paint('cyan', 'Content', io.term)} ${paint('dim', how, io.term)}\n`)
  const lines = []
  for (;;) {
    const line = await io.ask('')
    lines.push(line)
    const said = line?.trim()
    if (line === null || BODY_ABORT.includes(said) || BODY_SAVE.includes(said)) break
  }
  return bodyFrom(lines)
}

/**
 * The whole interaction. Returns null when the reader abandoned it, cancelled
 * with Ctrl+C, or gave an empty body twice.
 * @param {{ name?: string, syntax?: string, tag?: string[] }} [flags]
 * @returns {Promise<object|null>}
 */
export async function promptSnippet(flags = {}, io = defaultIo()) {
  try {
    // Not a terminal: the whole of stdin is the body. Piped input has seen no
    // prompt, so reading it as answers is how `cat f.sql | diffbro …` saved the
    // wrong thing.
    if (!io.isTty) return draftFrom({ ...flags, content: await io.readAll(), tags: flags.tag })

    const asked = await collect(io, flags)
    if (!asked) return null
    // Twice, then give up: an empty body used to exit and take the name and
    // syntax already typed with it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { content, cancelled } = await readBody(io)
      if (cancelled) return null
      const draft = draftFrom({ ...asked, content, tags: flags.tag })
      if (draft) return draft
      if (attempt === 0) {
        io.write(paint('amber', '  Nothing typed — try again, or :q to discard.\n', io.term))
      }
    }
    return null
  } finally {
    io.close?.()
  }
}

// Asked of STDOUT, because that is where it is written: judging by stderr meant
// `diffbro new snippet > out.txt` from a terminal wrote escape codes into the
// file — the exact noise the colour check exists to prevent.
export const handoffLine = (draft) => handedOver(draft, termFrom(process.env, process.stdout))
