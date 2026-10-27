import { onBeforeUnmount } from 'vue'
import { TAB_DRAG_TYPE } from '../utils/snippetSource'
import { useTabsStore } from '../stores/tabsStore'

/**
 * @typedef {object} TabContent
 * @property {string} name
 * @property {string} content     what the tab shows now, unsaved edits included
 * @property {boolean} secret
 * @property {string|null} snippetId  set only while the tab matches the saved snippet
 */

/** @type {Map<string, () => TabContent>} */
const readers = new Map()

/** @param {string} tabId @param {() => TabContent} read */
export const registerTabContent = (tabId, read) => void readers.set(tabId, read)
/** @param {string} tabId */
export const unregisterTabContent = (tabId) => void readers.delete(tabId)

/**
 * The comparison side an open snippet tab becomes, or null when it is gone or secret.
 * @param {string} tabId
 */
export function tabSnippetSource(tabId) {
  const tab = readers.get(tabId)?.()
  if (!tab || tab.secret) return null
  return { path: null, name: tab.name, content: tab.content, snippetId: tab.snippetId }
}

/**
 * Drag start for a snippet tab: the id only, and never for a secret one.
 * @param {DragEvent} e
 * @param {string} tabId
 */
export function startTabDrag(e, tabId) {
  if (!tabSnippetSource(tabId)) {
    e.preventDefault()
    return
  }
  e.dataTransfer.setData(TAB_DRAG_TYPE, tabId)
}

/**
 * Registers a mounted snippet document for as long as it lives. The snippet id
 * rides along only while the tab matches what is saved, so the side stays live.
 * @param {{ id: string, title?: string }} tab
 * @param {{ name: import('vue').Ref<string>, content: import('vue').Ref<string>,
 *   secret: import('vue').Ref<boolean>, editing: { id: string|null } }} draft
 */
export function useTabContent(tab, { name, content, secret, editing }) {
  const tabs = useTabsStore()
  registerTabContent(tab.id, () => ({
    name: name.value.trim() || tab.title || '',
    content: content.value,
    secret: secret.value,
    snippetId: editing.id && !tabs.unsaved(tab) ? editing.id : null
  }))
  onBeforeUnmount(() => unregisterTabContent(tab.id))
}
