// What may run, and which runs are going. No Electron, so both are unit-tested.
import { randomUUID } from 'node:crypto'
import { isEnabled } from './runnerConfig'
import { invocationFor, isRunnableLanguage, startRun } from './runnerCore'
import { entriesOf, isSecretEntry } from './storeEntries'

const MAX_CODE_CHARS = 8 * 1024 * 1024

const isSecretId = (store, id) => entriesOf(store).some((e) => e.id === id && isSecretEntry(e))

/**
 * @param {object} request
 * @returns {'bad-request'|'bad-command'|'not-enabled'|'secret'|null}
 */
export function refusalFor({ language, code, snippetId, config, store }) {
  if (!isRunnableLanguage(language)) return 'bad-request'
  if (typeof code !== 'string' || code.length > MAX_CODE_CHARS) return 'bad-request'
  if (!isEnabled(config, language)) return 'not-enabled'
  // Its promise is that the contents land nowhere readable; a script can print them.
  if (snippetId && isSecretId(store, snippetId)) return 'secret'
  return invocationFor(language, code).error ? 'bad-command' : null
}

const BATCH_MS = 50
const BATCH_CHARS = 64 * 1024

/**
 * Output in batches: a tight print loop otherwise sends one IPC message, and
 * costs one re-render, per line. Order across streams is kept.
 * @param {{ send: (chunk: { stream: string, text: string }) => void, intervalMs?: number, maxChars?: number }} o
 */
export function createOutputBatch({ send, intervalMs = BATCH_MS, maxChars = BATCH_CHARS }) {
  let held = []
  let heldChars = 0
  let timer = null

  function flush() {
    clearTimeout(timer)
    timer = null
    const out = held
    held = []
    heldChars = 0
    for (const chunk of out) send(chunk)
  }
  function add({ stream, text }) {
    const last = held.at(-1)
    if (last?.stream === stream) last.text += text
    else held.push({ stream, text })
    heldChars += text.length
    if (heldChars >= maxChars) flush()
    else timer ??= setTimeout(flush, intervalMs)
  }
  return { add, flush }
}

/** One run per tab of a window: starting another stops the one still going. */
export function createRuns({ start = startRun } = {}) {
  const going = new Map()

  const stop = (runId) => going.get(runId)?.handle.stop()
  function stopWhere(matches) {
    for (const [runId, run] of going) if (matches(run)) stop(runId)
  }
  function stopIfOwner(runId, owner) {
    if (going.get(runId)?.owner === owner) stop(runId)
  }

  function begin({ owner, key, onOutput, onExit, ...options }) {
    stopWhere((run) => run.key === key && run.owner === owner)
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
  return {
    begin,
    stop,
    stopIfOwner,
    stopAll: () => stopWhere(() => true),
    stopOwnedBy: (owner) => stopWhere((run) => run.owner === owner)
  }
}
