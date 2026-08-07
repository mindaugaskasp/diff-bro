import { isMac } from '../keys'

// Hint tables hand back i18n KEY IDs: utils/ is pure, and a t() resolved at
// module load would freeze whatever locale the app started in. The key GLYPHS
// live here too — they are platform constants, not translatable copy.
const COPY = isMac ? '\u2318C' : 'Ctrl+C'
const COPY_LINE = isMac ? '\u21e7\u2318C' : 'Ctrl+Shift+C'
const SAVE = isMac ? '\u2318\u21b5' : 'Ctrl+\u21b5'
const NEW = isMac ? '\u2318N' : 'Ctrl+N'
export const copyKeyLabel = COPY

/** @returns {Array<[string, string]>} [key glyph, message id] */
export const composeHints = () => [
  [SAVE, 'quickLook.hint.save'],
  ['\u21e7Tab', 'quickLook.hint.name'],
  ['\u2190/Esc', 'quickLook.hint.cancel']
]

/** @returns {Array<[string, string]>} [key glyph, message id] */
export const previewHints = () => [
  ['↑↓', 'quickLook.hint.line'],
  ['⇧↑↓', 'quickLook.hint.selectLines'],
  [COPY_LINE, 'quickLook.hint.copyLines'],
  ['←', 'quickLook.hint.backToList'],
  ['↵', 'quickLook.hint.open'],
  ['Esc', 'quickLook.hint.back']
]

const DRILL_IN = {
  snippet: 'quickLook.hint.scrollPreview',
  command: 'quickLook.hint.openTool',
  tools: 'quickLook.hint.browseTools'
}

/**
 * @param {{kind: string|undefined, toolsOpen: boolean}} o
 * @returns {Array<[string, string]>} [key glyph, message id]
 */
export function listHints({ kind, toolsOpen }) {
  const hints = [['↑↓', 'quickLook.hint.navigate']]
  if (DRILL_IN[kind]) hints.push(['→', DRILL_IN[kind]])
  hints.push(
    ['↵', kind === 'create' ? 'quickLook.hint.create' : 'quickLook.hint.open'],
    [COPY, 'quickLook.hint.copy'],
    [NEW, 'quickLook.hint.newSnippet'],
    // ← and Esc walk the same ladder, so they share one chip rather than
    // spending two on the same action.
    ['←/Esc', toolsOpen ? 'quickLook.hint.collapse' : 'quickLook.hint.close']
  )
  return hints
}
