// What the app says when a tab cannot be opened or cannot come back. Kept out
// of utils/tabs.js so the tab arithmetic there stays arithmetic.

import { MAX_TABS } from './tabs'

export const tabsFullNotice = (tabs) =>
  (tabs?.length ?? 0) >= MAX_TABS
    ? `That is the most comparisons at once (${MAX_TABS})`
    : 'These comparisons already hold about as much text as one window can'

// A comparison too big for the session is one that will not come back, and
// saving it is the way to keep it.
export const droppedTabsNotice = (count) => {
  const [what, verb, it] = count === 1 ? ['comparison', 'is', 'it'] : ['comparisons', 'are', 'them']
  return `${count} open ${what} ${verb} too large to reopen next launch — save ${it} to keep ${it}.`
}
