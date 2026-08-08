import { COMMANDS } from '../shared/cliCommands'
import { t } from './i18n'
// The `diffbro` terminal command. A second launch never becomes a second app:
// Electron's single-instance lock hands its argv to the running one, which is
// what routes these — no socket, no port, nothing that could reach the network.
//
// Parsing is pure so it can be unit-tested without Electron, and so the same
// function serves both entry points: the argv of a cold launch and the argv
// forwarded by `second-instance`.

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length))
// The catalogue holds the prose flush left — indentation there is a source
// artifact, which tests/shared/i18n guards against. Terminal layout is the
// printer's job, so it is added here.
const indented = (text) =>
  text
    .split('\n')
    .map((line) => (line ? `  ${line}` : line))
    .join('\n')
const WIDTH = Math.max(...COMMANDS.map((c) => c.usage.length)) + 3

export const CLI_USAGE = () =>
  [
    'diffbro — offline diff viewer',
    '',
    ...COMMANDS.map((c) => `  ${pad(c.usage, WIDTH)}${t(c.summaryKey)}`),
    '',
    '  diffbro help <command> explains one of them.'
  ].join('\n')

/**
 * @param {string} [topic]
 * @returns {{ text: string, ok: boolean }}
 */
export function helpText(topic) {
  if (!topic) return { text: CLI_USAGE(), ok: true }
  const cmd = COMMANDS.find((c) => c.topic === topic)
  if (!cmd) return { text: t('cli.noHelpFor', { topic, usage: CLI_USAGE() }), ok: false }
  return { text: `${cmd.usage}\n\n${indented(t(cmd.detailKey))}`, ok: true }
}

// Electron argv is not a stable shape: packaged it is [exe, ...args], from a dev
// run it is [electron, ., ...args], and Chromium switches can appear anywhere.
// Our own flags, known BY NAME — the one place a name rather than a shape
// decides, because argv is shared with Chromium and its switch list is open
// ended. Anything else dash-prefixed is still stripped as theirs.
const FLAGS = new Set(['--name', '--syntax', '--tag'])
const isOurFlag = (a) => FLAGS.has(a.split('=')[0])
const isSwitch = (a) => a.startsWith('-') && !isOurFlag(a)
// Structural, not by name: an entry point is a PATH, and every command is a bare
// word. Matching on names instead meant any clone directory not called exactly
// `diffbro` was read as a command, which exits before a window exists.
const isPath = (a) => a === '.' || a.includes('/') || a.includes('\\')

/**
 * The user-supplied words of a launch, with the executable, the entry point and
 * any Chromium switches stripped.
 * @param {string[]} argv
 * @returns {string[]}
 */
export function cliWords(argv) {
  const words = (argv ?? []).filter((a) => typeof a === 'string' && !isSwitch(a))
  // argv[0] is always the binary; at most one entry path may follow it.
  let i = words.length ? 1 : 0
  if (i < words.length && isPath(words[i])) i++
  return words.slice(i)
}

/**
 * @typedef {object} CliCommand
 * @property {'compare'|'create-snippet'|'clipboard-save'|'raise'|'backup'} name
 * @property {string[]} [files]  absolute paths, for `compare`
 * @property {string} [path]     absolute destination, for `backup`
 */

// A verb returns null when its own arguments are wrong, so the caller reports
// the whole thing as unknown rather than half-accepting it.
/**
 * `--name X`, `--name=X`, and `--tag` repeated. A flag with no value is an
 * error rather than a silent swallow of whatever word came next.
 * @param {string[]} words
 */
function newSnippet(words) {
  const flags = {}
  for (let i = 0; i < words.length; i++) {
    const [flag, inline] = words[i].split(/=(.*)/s)
    if (!isOurFlag(flag)) continue
    const value = inline ?? words[++i]
    if (value === undefined) return { command: null, error: `${flag} needs a value.` }
    const key = flag.slice(2)
    if (key === 'tag') (flags.tag ??= []).push(value)
    else flags[key] = value
  }
  return { command: { name: 'new-snippet', flags }, error: null }
}

const VERBS = {
  compare: (rest, resolve) => parseCompare(rest, resolve),
  difftool: (rest, resolve) => parseCompare(rest, resolve, true),
  open: (rest, resolve) => parseOpen(rest, resolve),
  backup: (rest, resolve) => parseBackup(rest, resolve),
  create: (rest) =>
    rest[0] === 'snippet' ? { command: { name: 'create-snippet' }, error: null } : null,
  new: (rest) => (rest[0] === 'snippet' ? newSnippet(rest.slice(1)) : null),
  clipboard: (rest) =>
    rest[0] === 'save' ? { command: { name: 'clipboard-save' }, error: null } : null,
  help: (rest) => ({ command: { name: 'help', topic: rest[0] ?? null }, error: null })
}

// No path is the whole point of `open`: raise what is already there. One path is
// `compare`'s single-file behaviour, reused rather than re-implemented.
function parseOpen(rest, resolve) {
  const paths = rest.filter((p) => p.trim())
  if (!paths.length) return { command: { name: 'raise' }, error: null }
  if (paths.length > 1) return { command: null, error: 'open takes one file — try compare.' }
  return parseCompare(paths, resolve)
}

function parseBackup(rest, resolve) {
  const paths = rest.filter((p) => p.trim())
  if (!paths.length) return { command: null, error: 'backup needs a path to write to.' }
  if (paths.length > 1) return { command: null, error: 'backup takes one path.' }
  return { command: { name: 'backup', path: resolve(paths[0]) }, error: null }
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
