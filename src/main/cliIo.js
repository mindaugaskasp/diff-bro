// Everything the `create snippet` conversation touches outside itself, kept
// apart from the conversation so a real readline can be driven in a test.
//
// `readline` rather than a synchronous read of fd 0. The sync version could not
// be interrupted: Electron installs its own SIGINT handler that posts to the UI
// thread, and that thread was the one blocked in the read — so Ctrl+C at a
// prompt hung until the process was killed. readline turns the event loop, so
// the signal lands; it also brings the line editing the raw alternative cost.
import { createInterface } from 'node:readline/promises'
import { nameCompleter } from './cliNames'
import { termFrom } from './cliTerm'

// Decoded whole rather than chunk by chunk: a multi-byte character split across
// two reads became U+FFFD, and the mojibake was saved silently.
async function readAll(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8').replace(/\n$/, '')
}

/**
 * @param {{ names?: () => string[], input?: object, output?: object }} [opts]
 *   `names` is a thunk: reading it parses the whole encrypted library, and a
 *   piped run never asks the question that needs it.
 * @returns {{ isTty: boolean, hasNames: () => boolean,
 *             ask: (q: string, o?: { completes?: boolean }) => Promise<string|null>,
 *             readAll: () => Promise<string>, write: (t: string) => void,
 *             close: () => void, term: { colour: boolean, width: number } }}
 */
export function defaultIo({ names = () => [], input = process.stdin, output = process.stderr } = {}) {
  let rl = null
  let cancelled = false
  let library = null
  const readNames = () => (library ??= names())
  // Built on FIRST ASK, never up front: a piped run asks nothing, and an
  // interface created there consumes stdin out from under readAll and keeps the
  // event loop alive — the command never exited.
  // An AbortController, not just rl.close(): a pending question() never settles
  // when the interface closes under it, so Ctrl+C hung the command instead of
  // cancelling it. Aborting is what rejects the promise we are waiting on.
  const stop = new AbortController()
  const reader = () => {
    if (rl) return rl
    rl = createInterface({ input, output, terminal: true })
    rl.on('SIGINT', () => {
      cancelled = true
      stop.abort()
      rl.close()
    })
    return rl
  }
  return {
    isTty: !!input.isTTY,
    hasNames: () => readNames().length > 0,
    // null means "give up" — end of input, or Ctrl+C.
    ask: async (question, opts) => {
      if (cancelled) return null
      const r = reader()
      // INSTALLED per question and removed after, never gated inside a
      // permanent one: readline inserts a literal Tab only when there is no
      // completer at all, so leaving one in place ate every tab typed into a
      // snippet body. The 1-argument shape is the contract readline/promises
      // awaits — a callback completer returns undefined and never completes.
      r.completer = opts?.completes ? nameCompleter(readNames()) : undefined
      try {
        // RACED against close, because a pending question() never settles when
        // the interface closes under it — Ctrl+C hung the command rather than
        // cancelling it, and neither an abort signal nor a process SIGINT
        // handler resolved that on its own.
        const answer = await Promise.race([
          r.question(question, { signal: stop.signal }).catch(() => null),
          new Promise((resolve) => r.once('close', () => resolve(null)))
        ])
        return cancelled ? null : answer
      } finally {
        r.completer = undefined
      }
    },
    readAll: () => readAll(input),
    // stdout is for output, so the questions go to stderr — a redirect must
    // capture the confirmation and not the conversation.
    write: (text) => output.write(text),
    close: () => rl?.close(),
    term: termFrom(process.env, output)
  }
}
