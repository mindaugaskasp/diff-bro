// The `diffbro` terminal command. A second launch never becomes a second app:
// Electron's single-instance lock hands its argv to the running one, which is
// what routes these — no socket, no port, nothing that could reach the network.
//
// Parsing is pure so it can be unit-tested without Electron, and so the same
// function serves both entry points: the argv of a cold launch and the argv
// forwarded by `second-instance`.

export const CLI_USAGE = `diffbro — offline diff viewer

  diffbro compare <file> [<file>]   open one or two files in a comparison tab
  diffbro create snippet            open a new snippet in the editor
  diffbro cb save                   save the clipboard as a snippet`

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

/**
 * @param {string[]} argv          the raw process argv of the launch
 * @param {(p: string) => string} [resolve]  cwd-relative → absolute
 * @returns {{ command: CliCommand|null, error: string|null }}
 */
export function parseCli(argv, resolve = (p) => p) {
  const [verb, ...rest] = cliWords(argv)
  if (!verb) return { command: null, error: null }

  if (verb === 'compare') {
    const files = rest.slice(0, 2).map(resolve)
    if (!files.length) return { command: null, error: 'compare needs a file path.' }
    if (rest.length > 2) return { command: null, error: 'compare takes at most two files.' }
    return { command: { name: 'compare', files }, error: null }
  }
  if (verb === 'create' && rest[0] === 'snippet') {
    return { command: { name: 'create-snippet' }, error: null }
  }
  if (verb === 'cb' && rest[0] === 'save') {
    return { command: { name: 'clipboard-save' }, error: null }
  }
  return { command: null, error: `Unknown command: ${[verb, ...rest].join(' ')}` }
}
