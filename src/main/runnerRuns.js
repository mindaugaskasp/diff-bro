// What may run, and which runs are going. No Electron, so both are unit-tested.
import { randomUUID } from 'node:crypto'
import { isRunnableLanguage, startRun } from './runnerCore'

const MAX_CODE_CHARS = 8 * 1024 * 1024

const isSecret = (store, id) =>
  Array.isArray(store?.entries) && store.entries.some((e) => e.id === id && e.secret === true)

/**
 * @param {object} request
 * @returns {'bad-request'|'not-enabled'|'secret'|null}
 */
export function refusalFor({ language, code, snippetId, config, store }) {
  if (!isRunnableLanguage(language)) return 'bad-request'
  if (typeof code !== 'string' || code.length > MAX_CODE_CHARS) return 'bad-request'
  if (config.languages[language]?.enabled !== true) return 'not-enabled'
  // Its promise is that the contents land nowhere readable; a script can print them.
  if (snippetId && isSecret(store, snippetId)) return 'secret'
  return null
}

const BATCH_MS = 50
const BATCH_BYTES = 64 * 1024

/**
 * Output in batches: a tight print loop otherwise sends one IPC message, and
 * costs one re-render, per line. Order across streams is kept.
 * @param {{ send: (chunk: { stream: string, text: string }) => void, intervalMs?: number, maxBytes?: number }} o
 */
export function createOutputBatch({ send, intervalMs = BATCH_MS, maxBytes = BATCH_BYTES }) {
  let held = []
  let bytes = 0
  let timer = null

  function flush() {
    clearTimeout(timer)
    timer = null
    const out = held
    held = []
    bytes = 0
    out.forEach(send)
  }
  function add({ stream, text }) {
    const last = held.at(-1)
    if (last?.stream === stream) last.text += text
    else held.push({ stream, text })
    bytes += text.length
    if (bytes >= maxBytes) flush()
    else timer ??= setTimeout(flush, intervalMs)
  }
  return { add, flush }
}

/** One run per tab of a window: starting another stops the one still going. */
export function createRuns({ start = startRun } = {}) {
  const going = new Map()

  // An owner, when given, must match: a window stops only its own runs.
  function stop(runId, owner) {
    const run = going.get(runId)
    if (run && (owner === undefined || run.owner === owner)) run.handle.stop()
  }
  function begin({ owner, key, onOutput, onExit, ...options }) {
    for (const [runId, run] of going) if (run.key === key && run.owner === owner) stop(runId)
    const runId = randomUUID()
    const batch = createOutputBatch({ send: onOutput })
    const handle = start({
      ...options,
      onOutput: batch.add,
      onExit: (exit) => {
        batch.flush()
        going.delete(runId)
        onExit(exit)
      }
    })
    going.set(runId, { owner, key, handle })
    return runId
  }
  const stopAll = () => [...going.keys()].forEach((runId) => stop(runId))
  const stopOwnedBy = (owner) =>
    [...going].filter(([, run]) => run.owner === owner).forEach(([runId]) => stop(runId))

  return { begin, stop, stopAll, stopOwnedBy }
}
