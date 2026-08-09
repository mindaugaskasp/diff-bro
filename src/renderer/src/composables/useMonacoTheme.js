import * as monaco from 'monaco-editor'
import { isDarkTheme } from '../utils/themes'
import { MONACO_TOKENS, monacoThemeData } from '../utils/monacoTheme'

// One name, redefined on every change: Monaco keys a theme by name, so
// redefining and re-setting the same one is what re-tints a live editor.
export const MONACO_THEME = 'diffbro'

// A PROBE element, not getComputedStyle(:root).getPropertyValue: an unregistered
// custom property comes back as its unevaluated token stream, so --diff-add-line
// would arrive as the literal `color-mix(…)` string that Monaco cannot parse.
// Assigning it to `color` forces the resolution and hands back an rgb().
function resolvedPalette() {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const out = {}
  try {
    for (const token of MONACO_TOKENS) {
      probe.style.color = ''
      probe.style.color = `var(${token})`
      out[token] = getComputedStyle(probe).color
    }
  } finally {
    probe.remove()
  }
  return out
}

/**
 * Re-reads the live palette and re-tints every Monaco editor. Call it AFTER
 * data-theme is on the document — a watcher has to be `flush: 'post'`, or the
 * probe reads the palette the app is leaving.
 * @param {string} theme
 */
export function applyMonacoTheme(theme) {
  const dark = isDarkTheme(theme)
  try {
    monaco.editor.defineTheme(MONACO_THEME, monacoThemeData(resolvedPalette(), { dark }))
    monaco.editor.setTheme(MONACO_THEME)
  } catch {
    // A palette Monaco refuses is not worth taking the editor down for; the
    // stock base stays, which is what shipped before this existed.
    monaco.editor.setTheme(dark ? 'vs-dark' : 'vs')
  }
}
