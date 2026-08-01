// The `diffbro` terminal command. A second launch never becomes a second app:
// Electron's single-instance lock hands its argv to the running one, which is
// what routes these — no socket, no port, nothing that could reach the network.
//
// Parsing is pure so it can be unit-tested without Electron, and so the same
// function serves both entry points: the argv of a cold launch and the argv
// forwarded by `second-instance`.

// One list, so `help` can never drift from what parseCli actually accepts.
export const COMMANDS = [
  {
    topic: 'compare',
    usage: 'diffbro compare <file> [<file>]',
    summary: 'open one or two files in a comparison tab',
    detail: `Opens the files in the running Diff Bro, or starts it first.

  One file fills the left side and waits for the right; two open a full
  comparison. Paths are resolved against the directory you run this in.

  Comparisons open in a new tab, never over the one on screen. With every
  tab in use, Diff Bro says so and opens nothing — close a tab and repeat.`
  },
  {
    topic: 'difftool',
    usage: 'diffbro difftool <file> <file>',
    summary: 'open a comparison git handed over',
    detail: `What \`git difftool\` and \`git mergetool\` run. Same as compare,
  except the two files are known to be throwaway copies git made.

  Because they are throwaway, a merge with more conflicts than there are
  tabs reuses the oldest of them instead of running out — \`git mergetool\`
  walks the whole conflict list without waiting for anyone.`
  },
  {
    topic: 'create',
    usage: 'diffbro create snippet',
    summary: 'open a new snippet in the editor',
    detail: `Raises the main window with an empty snippet in the editor.

  This is the full editor, not the quick look-up bar, so it has the name
  field, syntax picker and tags.`
  },
  {
    topic: 'cb',
    usage: 'diffbro cb save',
    summary: 'save the clipboard as a snippet',
    detail: `Saves whatever is on the clipboard as a snippet named
  "Clipboard - <date> <time>", guesses the syntax from the content, and
  opens it in the editor so it can be renamed or tagged.

  An empty clipboard saves nothing and says so.`
  },
  {
    topic: 'help',
    usage: 'diffbro help [<command>]',
    summary: 'list the commands, or explain one',
    detail: 'Prints this list. With a command name, explains that command.'
  }
]

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length))
const WIDTH = Math.max(...COMMANDS.map((c) => c.usage.length)) + 3

export const CLI_USAGE = [
  'diffbro — offline diff viewer',
  '',
  ...COMMANDS.map((c) => `  ${pad(c.usage, WIDTH)}${c.summary}`),
  '',
  '  diffbro help <command> explains one of them.'
].join('\n')

/**
 * @param {string} [topic]
 * @returns {{ text: string, ok: boolean }}
 */
export function helpText(topic) {
  if (!topic) return { text: CLI_USAGE, ok: true }
  const cmd = COMMANDS.find((c) => c.topic === topic)
  if (!cmd) return { text: `No help for "${topic}".\n\n${CLI_USAGE}`, ok: false }
  return { text: `${cmd.usage}\n\n  ${cmd.detail}`, ok: true }
}

// Electron argv is not a stable shape: packaged it is [exe, ...args], from a dev
// run it is [electron, ., ...args], and Chromium switches can appear anywhere.
const isSwitch = (a) => a.startsWith('-')
const ENTRY = /(electron|diffbro|diff bro|\.|main\/index\.js)$/i

/**
 * The user-supplied words of a launch, with the executable, the entry point and
 * any Chromium switches stripped.
 * @param {string[]} argv
 * @returns {string[]}
 */
export function cliWords(argv) {
  const words = (argv ?? []).filter((a) => typeof a === 'string' && !isSwitch(a))
  let i = 0
  while (i < words.length && (i === 0 || ENTRY.test(words[i]))) i++
  return words.slice(i)
}

/**
 * @typedef {object} CliCommand
 * @property {'compare'|'create-snippet'|'clipboard-save'} name
 * @property {string[]} [files]  absolute paths, for `compare`
 */

// A verb returns null when its own arguments are wrong, so the caller reports
// the whole thing as unknown rather than half-accepting it.
const VERBS = {
  compare: (rest, resolve) => parseCompare(rest, resolve),
  difftool: (rest, resolve) => parseCompare(rest, resolve, true),
  create: (rest) =>
    rest[0] === 'snippet' ? { command: { name: 'create-snippet' }, error: null } : null,
  cb: (rest) => (rest[0] === 'save' ? { command: { name: 'clipboard-save' }, error: null } : null),
  help: (rest) => ({ command: { name: 'help', topic: rest[0] ?? null }, error: null })
}

function parseCompare(rest, resolve, transient = false) {
  // An empty word is not a path — resolving it would silently mean the cwd.
  const paths = rest.filter((p) => p.trim())
  if (!paths.length) return { command: null, error: 'compare needs a file path.' }
  if (paths.length > 2) return { command: null, error: 'compare takes at most two files.' }
  return { command: { name: 'compare', files: paths.map(resolve), transient }, error: null }
}

/**
 * @param {string[]} argv          the raw process argv of the launch
 * @param {(p: string) => string} [resolve]  cwd-relative → absolute
 * @returns {{ command: CliCommand|null, error: string|null }}
 */
export function parseCli(argv, resolve = (p) => p) {
  const words = cliWords(argv)
  // --help/-h read as Chromium switches, so cliWords drops them; they have to
  // be spotted in the raw argv or the convention silently does nothing.
  if ((argv ?? []).some((a) => a === '--help' || a === '-h')) {
    return { command: { name: 'help', topic: words[0] ?? null }, error: null }
  }
  const [verb, ...rest] = words
  if (!verb) return { command: null, error: null }
  const parsed = VERBS[verb]?.(rest, resolve)
  return parsed ?? { command: null, error: `Unknown command: ${[verb, ...rest].join(' ')}` }
}
