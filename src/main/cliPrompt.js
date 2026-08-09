// `diffbro create snippet --interactive`, asked for a line at a time. It runs
// in the cold CLI path, before `requestSingleInstanceLock` decides whether we
// are the app or a messenger for one already running — the same slot `help`
// prints from — so the launch is sequenced around it. Prompts go to STDERR:
// stdout is for output, so `diffbro create snippet > out` must not capture the
// questions.
import { handoffText, paint, syntaxHelp, termFrom } from './cliTerm'
import { EXPLICIT_LANGUAGES } from '../shared/snippetLanguages'
import { t } from './i18n'

// Offered by number as well as name, because typing "mermaid" correctly at a
// prompt is a worse experience than typing "7". Anything unrecognised is
// `auto`, which is what the editor does with a snippet nobody classified. The
// editor's own list, not a subset: a hand-kept one left php unofferable, so
// `php` here fell back to auto in silence.
export const SYNTAXES = EXPLICIT_LANGUAGES

/**
 * @param {string} [answer]
 * @param {{ numbered?: boolean }} [opts] a number means "the row I can see", so
 *   it is read only at the prompt that printed the rows. As a --syntax value it
 *   would silently re-point every time the list grew.
 */
export function syntaxFor(answer, { numbered = true } = {}) {
  const said = String(answer ?? '')
    .trim()
    .toLowerCase()
  if (!said) return 'auto'
  if (SYNTAXES.includes(said)) return said
  const n = Number(said)
  return numbered && Number.isInteger(n) && n >= 1 && n <= SYNTAXES.length
    ? SYNTAXES[n - 1]
    : 'auto'
}

// Vim's own meanings, because the spelling borrows vim's muscle memory: :wq
// and :x WRITE and quit, :q quits WITHOUT writing. Reading :q as save was
// backwards for exactly the readers the notation was chosen for. Matched only
// as a whole line, so `echo ":wq"` stays content.
//
// Ctrl+C cancels: readline raises its own SIGINT on the ^C byte, which the
// reader turns into a null answer. It could NOT under the synchronous reader
// this replaced — the thread was blocked, so no handler ever ran.
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
  return t('cliPrompt.cliSnippetName', { stamp })
}

/**
 * What the answers add up to, or null when there is nothing to save.
 * @param {{ name?: string, syntax?: string, content?: string, tags?: string[],
 *   numbered?: boolean }} answers  `numbered` only for a syntax typed AT the
 *   prompt that printed the list; a --syntax value is read by name alone.
 * @returns {{ name: string, language: string, content: string, tags: string[] }|null}
 */
export function draftFrom({ name, syntax, content, tags = [], numbered = false, now = new Date() }) {
  const body = String(content ?? '')
  if (!body.trim()) return null
  return {
    name: String(name ?? '').trim() || cliSnippetName(now),
    language: syntaxFor(syntax, { numbered }),
    content: body,
    // The point of the ask: a snippet made from the terminal stays findable as
    // one afterwards. Any --tag the reader gave joins it.
    tags: ['cli', ...(tags ?? []).map((t) => String(t).trim()).filter(Boolean)]
  }
}

async function ask(io, label, hint, opts) {
  const { term } = io
  const q = `${paint('cyan', label, term)} ${paint('dim', hint, term)} ${paint('dim', '>', term)} `
  return io.ask(q, opts)
}

// Asked only for what the flags did not already answer. The name hint only
// advertises Tab when there is a library behind it to complete against.
async function askedFor(io, flags) {
  const nameHint = io.hasNames() ? t('cliPrompt.nameHintCompletes') : t('cliPrompt.nameHint')
  const name = flags.name ?? (await ask(io, t('cliPrompt.name'), nameHint, { completes: true }))
  if (name === null) return null
  let syntax = flags.syntax
  if (syntax === undefined) {
    // Before the question, not after it: the reader has to see the list they
    // are being asked to pick from.
    io.write(`${syntaxHelp(SYNTAXES, io.term.width, io.term).join('\n')}\n`)
    syntax = await ask(io, t('cliPrompt.syntax'), t('cliPrompt.syntaxHint', { n: SYNTAXES.length }))
    if (syntax === null) return null
    return { name, syntax, numbered: true }
  }
  return { name, syntax }
}

async function readBody(io) {
  const how = t('cliPrompt.contentHint', {
    save: BODY_SAVE.join(' / '),
    discard: BODY_ABORT.join(' / ')
  })
  io.write(`\n${paint('cyan', t('cliPrompt.content'), io.term)} ${paint('dim', how, io.term)}\n`)
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
 * @param {{ name?: string, syntax?: string, tag?: string[] }} flags
 * @param {object} io  see cliIo.defaultIo
 * @returns {Promise<object|null>}
 */
export async function promptSnippet(flags, io) {
  try {
    // Not a terminal: the whole of stdin is the body. Piped input has seen no
    // prompt, so reading it as answers is how `cat f.sql | diffbro …` saved the
    // wrong thing.
    if (!io.isTty) return draftFrom({ ...flags, content: await io.readAll(), tags: flags.tag })

    const asked = await askedFor(io, flags)
    if (!asked) return null
    // Twice, then give up: an empty body used to exit and take the name and
    // syntax already typed with it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { content, cancelled } = await readBody(io)
      if (cancelled) return null
      const draft = draftFrom({ ...asked, content, tags: flags.tag })
      if (draft) return draft
      if (attempt === 0) {
        io.write(paint('amber', `${t('cliPrompt.nothingTyped')}\n`, io.term))
      }
    }
    return null
  } finally {
    io.close?.()
  }
}

// Asked of STDOUT, because that is where it is written: judging by stderr meant
// `diffbro create snippet > out.txt` from a terminal wrote escape codes into
// the file — the exact noise the colour check exists to prevent.
export const handoffLine = (draft) => handoffText(draft, termFrom(process.env, process.stdout))
