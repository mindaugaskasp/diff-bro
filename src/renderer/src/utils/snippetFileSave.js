import { snippetFile } from './copyAsFile'
import { tabContent } from './tabContent'

/**
 * Save Snippet as File: the text the tab shows now, through main's save dialog.
 * A secret or empty snippet never reaches disk.
 * @param {string} tabId
 */
export async function saveTabAsFile(tabId) {
  const tab = tabContent(tabId)
  if (!tab) return null
  const file = snippetFile({ ...tab, lang: tab.language })
  if (file.error) return file
  return window.api.exportDiffFile({ text: file.content, name: file.name, format: 'text' })
}
