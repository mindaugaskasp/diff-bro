// What each open snippet tab shows now, keyed by tab id. Plain module state: a
// mounted SnippetDocument registers a reader and removes it on unmount.

/**
 * @typedef {object} TabContent
 * @property {string} name
 * @property {string} content     what the tab shows now, unsaved edits included
 * @property {string} language
 * @property {boolean} secret
 * @property {string|null} snippetId  set only while the tab matches the saved snippet
 */

/** @type {Map<string, () => TabContent>} */
const readers = new Map()

/** @param {string} tabId @param {() => TabContent} read */
export const registerTabContent = (tabId, read) => void readers.set(tabId, read)
/** @param {string} tabId */
export const unregisterTabContent = (tabId) => void readers.delete(tabId)
/** @param {string} tabId @returns {TabContent|null} */
export const tabContent = (tabId) => readers.get(tabId)?.() ?? null

/**
 * The comparison side an open snippet tab becomes, or null when it is gone or secret.
 * @param {string} tabId
 */
export function tabSnippetSource(tabId) {
  const tab = tabContent(tabId)
  if (!tab || tab.secret) return null
  return { path: null, name: tab.name, content: tab.content, snippetId: tab.snippetId }
}
