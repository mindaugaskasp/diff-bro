import { t } from './i18n'
// What the terminal SEES: colour, the folded syntax list, and the line printed
// once the draft is on its way. Pure — the reading and writing stay in
// cliPrompt, so everything that decides what a reader ends up looking at can be
// tested without a terminal.

/**
 * How this terminal wants to be written to. NO_COLOR is a convention, not a
 * preference to weigh — https://no-color.org.
 * @returns {{ colour: boolean, width: number }}
 */
export const termFrom = (env = process.env, stream = process.stderr) => ({
  colour: !!stream.isTTY && !env.NO_COLOR,
  width: stream.columns || 80
})

const ESC = String.fromCharCode(27)
const CODES = { dim: 2, bold: 1, cyan: 36, green: 32, red: 31, amber: 33 }

/**
 * @param {keyof CODES} name
 * @param {string} text
 * @param {{ colour: boolean }} term
 */
export const paint = (name, text, term) =>
  term.colour && CODES[name] ? `${ESC}[${CODES[name]}m${text}${ESC}[0m` : text

/**
 * The syntax list as help under the prompt rather than a menu above it. Ten
 * names one per line was a third of an 80x24 screen for a question most people
 * answer with Enter.
 * @param {string[]} names
 * @param {number} width
 * @param {{ colour: boolean }} term
 * @returns {string[]} rows, already indented and coloured
 */
export function syntaxHelp(names, width, term) {
  const room = Math.max(1, width - 2)
  const rows = []
  let row = ''
  for (const name of names) {
    // A name longer than the terminal still gets its own row rather than being
    // dropped or looping — narrow is a bad experience, not a broken one.
    if (row && `${row} ${name}`.length > room) {
      rows.push(row)
      row = name
    } else {
      row = row ? `${row} ${name}` : name
    }
  }
  if (row) rows.push(row)
  return rows.map((r) => paint('dim', `  ${r}`, term))
}

/**
 * What this process can honestly say once the draft is away.
 *
 * NOT "saved": with the app already running, the draft crosses through the
 * single-instance lock — one-way by design, the same decision that keeps the
 * app off the network — so the process that asked the questions never learns
 * whether the one that saves succeeded. It reports what it knows instead.
 * @param {{ name: string, language: string, content: string, tags: string[] }} draft
 * @param {{ colour: boolean }} term
 */
export function handoffText(draft, term) {
  const lines = draft.content === '' ? 0 : draft.content.split('\n').length
  // The store names an unnamed snippet, and this process cannot ask it what it
  // chose — so it says the name is coming rather than printing an empty one.
  const name = draft.name || t('cliPrompt.unnamed')
  const syntax = draft.language === 'auto' ? t('cliPrompt.detected') : draft.language
  const dot = paint('dim', ' · ', term)
  const facts = [
    paint('bold', name, term),
    syntax,
    t('cliPrompt.lineCount', lines, { named: { n: lines } }),
    t('cliPrompt.taggedWith', { tags: paint('amber', draft.tags.join(' '), term) })
  ].join(dot)
  return `${paint('green', '✓', term)} ${t('cliPrompt.handedOver')}\n  ${facts}`
}
