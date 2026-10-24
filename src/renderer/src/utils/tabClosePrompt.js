import { isSnippetTab } from './tabs'

/** @param {object[]} risky the unsaved tabs being closed @returns {{titleKey: string, bodyKey: string}} */
export function closePromptKeys(risky) {
  const hasSnippet = risky.some(isSnippetTab)
  if (risky.length > 1) {
    return hasSnippet
      ? { titleKey: 'tabCloseDialog.closeTabs', bodyKey: 'tabCloseDialog.closingManyTabs' }
      : { titleKey: 'tabCloseDialog.closeComparisons', bodyKey: 'tabCloseDialog.closingMany' }
  }
  return hasSnippet
    ? { titleKey: 'tabCloseDialog.closeSnippet', bodyKey: 'tabCloseDialog.closingOneSnippet' }
    : { titleKey: 'tabCloseDialog.closeComparison', bodyKey: 'tabCloseDialog.closingOne' }
}
