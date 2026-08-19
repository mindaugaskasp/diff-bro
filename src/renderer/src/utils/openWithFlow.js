import { openWithTarget } from './openWithRouting'
import { tabsFullMessage } from './cliCommand'
import { MAX_TABS } from './tabCost'

// Finder sends one `open-file` per file, back to back, and each read is async.
// Unserialised, both ask where they go before either has landed and two files
// that should compare take two tabs — hence the chain.
let queue = Promise.resolve()

async function place({ diff, tabs }, path) {
  const target = openWithTarget({
    active: tabs.active,
    hasLeft: !!diff.left,
    hasRight: !!diff.right
  })
  if (target.newTab) {
    // An empty comparison is already the tab this file wants.
    if (diff.left || diff.right) {
      if (!tabs.canHost(false)) {
        diff.blockedFiles = [...diff.blockedFiles, path]
        diff.cliBlocked = tabsFullMessage(diff.blockedFiles, MAX_TABS)
        return
      }
      tabs.newTab()
    }
    tabs.markActiveOpenWith(true)
  }
  try {
    diff.receive(target.side, await window.api.readFile(path))
  } catch {
    diff.showNotice(`Could not open "${String(path).split(/[\\/]/).pop()}".`)
  }
}

/**
 * @param {{ diff: object, tabs: object }} stores
 * @param {string[]} files
 */
export function openWithFromCli(stores, files) {
  for (const path of files ?? []) {
    queue = queue.then(() => place(stores, path)).catch(() => {})
  }
  return queue
}
