import { openWithTarget } from './openWithRouting'
import { tabsFullMessage } from './cliCommand'
import { MAX_TABS } from './tabCost'
import { isSnippetTab } from './tabs'
import { openedFileDraft } from './openedFileDraft'

// Finder sends one `open-file` per file, back to back, and each read is async.
// Unserialised, both ask where they go before either has landed and two files
// that should compare take two tabs — hence the chain.
let queue = Promise.resolve()

function blockedBy({ diff, tabs }, path) {
  if (tabs.canHost(false)) return false
  diff.blockedFiles = [...diff.blockedFiles, path]
  diff.cliBlocked = tabsFullMessage(diff.blockedFiles, MAX_TABS)
  return true
}

async function readOrNotify(diff, path) {
  try {
    return await window.api.readFile(path)
  } catch {
    diff.showNotice(`Could not open "${String(path).split(/[\\/]/).pop()}".`)
    return null
  }
}

async function place({ diff, tabs }, path, read = readOrNotify(diff, path)) {
  const target = openWithTarget({
    active: tabs.active,
    hasLeft: !!diff.left,
    hasRight: !!diff.right
  })
  if (target.newTab) {
    // An empty comparison is already the tab this file wants.
    if (diff.left || diff.right) {
      if (blockedBy({ diff, tabs }, path)) return
      tabs.newTab()
    }
    tabs.markActiveOpenWith(true)
  }
  diff.receive(target.side, await read)
}

const openedFileTab = (tabs) =>
  tabs.tabs.findLast((tab) => isSnippetTab(tab) && tab.snippet.initial?.openedPath)

async function compareWithOpened({ diff, tabs }, previous, file) {
  if (blockedBy({ diff, tabs }, file.path)) return
  const first = await readOrNotify(diff, previous.snippet.initial.openedPath)
  tabs.newTab()
  diff.receive('left', first)
  diff.receive('right', file)
}

async function openOne(stores, path) {
  const file = await readOrNotify(stores.diff, path)
  if (!file) return
  // Binary, unreadable, streamed or a spreadsheet: the comparison view handles it as before.
  if (typeof file.content !== 'string' || file.kind) return place(stores, path, file)
  const previous = openedFileTab(stores.tabs)
  if (previous) {
    const name = previous.title || previous.snippet.initial.initialName
    const choice = await stores.openWith.ask({ previous: name, next: file.name })
    if (choice === 'compare') return compareWithOpened(stores, previous, file)
  }
  stores.tabs.openSnippet(openedFileDraft(file), file.name)
}

/**
 * One file becomes an unsaved snippet tab; several opened together compare.
 * @param {{ diff: object, tabs: object, openWith: object }} stores
 * @param {string[]} files
 */
export function openWithFromCli(stores, files) {
  const paths = files ?? []
  const steps =
    paths.length === 1
      ? [() => openOne(stores, paths[0])]
      : paths.map((path) => () => place(stores, path))
  for (const step of steps) queue = queue.then(step).catch(() => {})
  return queue
}
