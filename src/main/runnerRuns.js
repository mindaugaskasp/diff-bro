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

/** One run per key (a tab): starting another stops the one still going. */
export function createRuns({ start = startRun } = {}) {
  const going = new Map()

  function stop(runId) {
    going.get(runId)?.handle.stop()
  }
  function begin({ key, onExit, ...options }) {
    for (const [runId, run] of going) if (run.key === key) stop(runId)
    const runId = randomUUID()
    const handle = start({
      ...options,
      onExit: (exit) => {
        going.delete(runId)
        onExit(exit)
      }
    })
    going.set(runId, { key, handle })
    return runId
  }
  const stopAll = () => [...going.keys()].forEach(stop)

  return { begin, stop, stopAll }
}
