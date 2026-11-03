// Each language's own convention; code that already has an indent keeps it (Monaco's detectIndentation).
const TWO_SPACES = new Set(['yaml', 'json', 'javascript', 'typescript', 'html', 'xml', 'css', 'mermaid'])
const TABS = new Set(['go'])

/**
 * @param {string} language
 * @returns {{ insertSpaces: boolean, tabSize: number }}
 */
export function indentStyleFor(language) {
  if (TABS.has(language)) return { insertSpaces: false, tabSize: 4 }
  return { insertSpaces: true, tabSize: TWO_SPACES.has(language) ? 2 : 4 }
}
