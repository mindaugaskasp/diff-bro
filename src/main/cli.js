import { COMMANDS } from '../shared/cliCommands'
import { splitRevisionArg } from './gitRevisionArg'
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
const indent = (text) =>
  text
    .split('\n')
    .map((line) => (line ? `  ${line}` : line))
    .join('\n')
const WIDTH = Math.max(...COMMANDS.map((c) => c.usage.length)) + 3

export const cliUsage = () =>
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
  if (!topic) return { text: cliUsage(), ok: true }
  const cmd = COMMANDS.find((c) => c.topic === topic)
  if (!cmd) return { text: t('cli.noHelpFor', { topic, usage: cliUsage() }), ok: false }
  return { text: `${cmd.usage}\n\n${indent(t(cmd.detailKey))}`, ok: true }
}

// Electron argv is not a stable shape: packaged it is [exe, ...args], from a dev
// run it is [electron, ., ...args], and Chromium switches can appear anywhere.
const isSwitch = (a) => a.startsWith('-')
// `new snippet`'s own flags. They are read from the RAW tail after the verb,
// never carved out of the global switch strip: argv is shared with Chromium,
// whose switch list is open ended, and treating any `--x` as ours turned a
// bare launch carrying one into "Unknown command" — which exits before a
// window exists, so the app simply refused to start.
const FLAGS = new Set(['--name', '--syntax', '--tag'])
const REPEATABLE = new Set(['--tag'])
const isOurFlag = (a) => FLAGS.has(String(a).split('=')[0])
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
 * `--name X`, `--name=X`, and `--tag` repeated. A flag whose value is missing,
 * empty, or another flag is an ERROR — swallowing the next word named a
 * snippet `--syntax` and dropped the value that followed it.
 * @param {string[]} words  the raw tail after `new snippet`
 */
// The words after `new snippet` in the UNFILTERED argv — cliWords has already
// stripped every dash-prefixed argument, ours included, by the time a verb runs.
export function afterVerb(argv) {
  const words = (argv ?? []).filter((a) => typeof a === 'string')
  const at = words.findIndex((w, i) => w === 'create' && words[i + 1] === 'snippet')
  return at === -1 ? [] : words.slice(at + 2)
}

const isInteractive = (a) => a === '--interactive' || a === '-i'

export function parseNewSnippet(words) {
  const flags = {}
  const fail = (m) => ({ command: null, error: m })
  for (let i = 0; i < words.length; i++) {
    const [flag, inline] = words[i].split(/=(.*)/s)
    if (!isOurFlag(flag)) continue
    const next = inline ?? words[i + 1]
    if (inline === undefined) i++
    if (!next || isOurFlag(next)) return fail(t('cliPrompt.flagNeedsValue', { flag }))
    const key = flag.slice(2)
    if (REPEATABLE.has(flag)) (flags.tag ??= []).push(next)
    else if (key in flags) return fail(t('cliPrompt.flagTwice', { flag }))
    else flags[key] = next
  }
  return { command: { name: 'new-snippet', flags }, error: null }
}

const VERBS = {
  compare: (rest, resolve) => parseCompare(rest, resolve),
  difftool: (rest, resolve) => parseCompare(rest, resolve, true),
  // git hands a mergetool four paths in a fixed order: LOCAL REMOTE MERGED
  // BASE. MERGED is the file in the repo — the one with the markers in it, and
  // the one this run may write back.
  mergetool: (rest, resolve) => {
    const paths = rest.filter((p) => p.trim()).map(resolve)
    if (paths.length < 3) return { command: null, error: 'mergetool needs LOCAL REMOTE MERGED.' }
    const [local, remote, merged] = paths
    return { command: { name: 'merge', local, remote, merged }, error: null }
  },
  open: (rest, resolve) => parseOpen(rest, resolve),
  backup: (rest, resolve) => parseBackup(rest, resolve),
  // One verb. `--interactive` asks in the terminal and saves; without it the
  // empty editor opens, as it always did. Two near-identical verbs sitting
  // side by side in --help read as a mistake.
  create: (rest, _resolve, argv) => {
    if (rest[0] !== 'snippet') return null
    const tail = afterVerb(argv)
    return tail.some(isInteractive)
      ? parseNewSnippet(tail.filter((a) => !isInteractive(a)))
      : { command: { name: 'create-snippet' }, error: null }
  },

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

// A side is either a path to resolve against the shell's cwd, or the
// `revision:path` pair naming a file inside the repository as it stood then —
// which main reads later, because only main may talk to git.
const sideOf = (word, resolve) => splitRevisionArg(word) ?? resolve(word)

function parseCompare(rest, resolve, transient = false) {
  // An empty word is not a path — resolving it would silently mean the cwd.
  const paths = rest.filter((p) => p.trim())
  if (!paths.length) return { command: null, error: 'compare needs a file path.' }
  if (paths.length > 2) return { command: null, error: 'compare takes at most two files.' }
  return {
    command: { name: 'compare', files: paths.map((p) => sideOf(p, resolve)), transient },
    error: null
  }
}

/**
 * An OS "Open with" launch: paths, no verb.
 *
 * Beside parseCli, never inside it. cliWords strips argv[0] and then one more
 * path-shaped word as the entry point — the exact slot the OS uses, so one file
 * was discarded silently and two made the second read as a verb and exit(1)
 * before a window existed. That strip is load-bearing for every other verb.
 *
 * Decides on SHAPE only; allowCliPath and the read settle the rest.
 *
 * @param {string[]} argv
 * @param {{ entryPath?: string }} [options]  the app directory, for a dev run
 * @returns {{ name: 'open-with', files: string[] }|null}
 */
export function parseOpenWith(argv, { entryPath } = {}) {
  const words = (argv ?? []).filter((a) => typeof a === 'string' && !isSwitch(a))
  const rest = words.slice(1).filter((w) => w !== entryPath && w !== '.')
  if (!rest.length) return null
  // Any bare word is a verb, so the launch belongs to the CLI and not here.
  if (!rest.every(isPath)) return null
  return { name: 'open-with', files: rest }
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
  const parsed = VERBS[verb]?.(rest, resolve, argv)
  return parsed ?? { command: null, error: `Unknown command: ${[verb, ...rest].join(' ')}` }
}
