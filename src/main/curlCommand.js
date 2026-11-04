// A curl snippet becomes argv for execFile, never a shell command line. Not the
// shell-quote package: it expands $VARS, and here anything a shell would act on
// is refused rather than interpreted.
const SHELL_SYNTAX = new Set(['|', '&', ';', '<', '>', '(', ')', '$', '`'])
const ESCAPED_IN_DOUBLE = new Set(['"', '\\', '$', '`'])
const BLANKS = new Set([' ', '\t', '\r'])
const COMMANDS = new Set(['curl', 'curl.exe'])

const withoutContinuations = (code) => code.replace(/\\\r?\n/g, ' ')

function readSingle(text, i) {
  const end = text.indexOf("'", i + 1)
  return end === -1 ? { error: 'unclosed-quote' } : { text: text.slice(i + 1, end), next: end + 1 }
}

function readDouble(text, i) {
  let value = ''
  for (let j = i + 1; j < text.length; j++) {
    const c = text[j]
    if (c === '"') return { text: value, next: j + 1 }
    if (c === '$' || c === '`') return { error: 'shell-syntax', char: c }
    const escaped = c === '\\' && ESCAPED_IN_DOUBLE.has(text[j + 1])
    if (escaped) j++
    value += text[j]
  }
  return { error: 'unclosed-quote' }
}

function skipComment(text, i) {
  const end = text.indexOf('\n', i)
  return { gap: true, next: end === -1 ? text.length : end }
}

function stepAt(text, i, inWord) {
  const c = text[i]
  if (BLANKS.has(c)) return { gap: true, next: i + 1 }
  if (c === '\n') return { gap: true, newline: true, next: i + 1 }
  if (c === '#' && !inWord) return skipComment(text, i)
  if (c === "'") return readSingle(text, i)
  if (c === '"') return readDouble(text, i)
  if (c === '\\') return { text: text[i + 1] ?? '', next: i + 2 }
  if (SHELL_SYNTAX.has(c)) return { error: 'shell-syntax', char: c }
  return { text: c, next: i + 1 }
}

function commandsIn(text) {
  const commands = [[]]
  let word = null
  let i = 0
  while (i < text.length) {
    const step = stepAt(text, i, word !== null)
    if (step.error) return step
    if (step.gap && word !== null) commands.at(-1).push(word)
    if (step.gap) word = null
    else word = (word ?? '') + step.text
    if (step.newline && commands.at(-1).length) commands.push([])
    i = step.next
  }
  if (word !== null) commands.at(-1).push(word)
  return { commands: commands.filter((words) => words.length) }
}

/**
 * @param {string} code  the snippet: one curl command, as pasted into a terminal
 * @returns {{ args: string[] } | { error: string, char?: string }}
 */
export function parseCurlCommand(code) {
  const parsed = commandsIn(withoutContinuations(code))
  if (parsed.error) return parsed
  if (parsed.commands.length > 1) return { error: 'several-commands' }
  const [command, ...args] = parsed.commands[0] ?? []
  if (!COMMANDS.has(command) || !args.length) return { error: 'not-curl' }
  return { args }
}
