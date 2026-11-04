// Plain module state: a mounted SnippetDocument registers its reader and writer by tab id.

/**
 * @typedef {object} TabContent
 * @property {string} name
 * @property {string} content     what the tab shows now, unsaved edits included
 * @property {string} language
 * @property {boolean} secret
 * @property {string|null} snippetId  set only while the tab matches the saved snippet
 */

/** @type {Map<string, { read: () => TabContent, write?: (text: string) => void }>} */
const readers = new Map()

/**
 * @param {string} tabId
 * @param {() => TabContent} read
 * @param {(text: string) => void} [write]  replaces what the tab shows
 */
export const registerTabContent = (tabId, read, write) => void readers.set(tabId, { read, write })
/** @param {string} tabId */
export const unregisterTabContent = (tabId) => void readers.delete(tabId)
/** @param {string} tabId @returns {TabContent|null} */
export const tabContent = (tabId) => readers.get(tabId)?.read() ?? null

/** @param {string} tabId @param {string} text @returns {boolean} whether a tab took it */
export function writeTabContent(tabId, text) {
  const write = readers.get(tabId)?.write
  if (!write) return false
  write(text)
  return true
}

/**
 * The comparison side an open snippet tab becomes, or null when it is gone or secret.
 * @param {string} tabId
 */
export function tabSnippetSource(tabId) {
  const tab = tabContent(tabId)
  if (!tab || tab.secret) return null
  return { path: null, name: tab.name, content: tab.content, snippetId: tab.snippetId }
}
