// The palette, in the shape monaco.editor.defineTheme wants. Pure: the caller
// resolves the tokens (a computed custom property comes back as `rgb(…)`) and
// this maps them onto Monaco's colour keys.
//
// `inherit: true` and a stock base, because the syntax rules are the only part
// of vs/vs-dark worth keeping — monaco-jira and monaco-mermaid both map their
// tokens through it.

/** Every token the theme needs, so one probe can read them in a single pass. */
export const MONACO_TOKENS = [
  '--bg',
  '--text',
  '--text-dim',
  '--border',
  '--accent',
  '--diff-add-line',
  '--diff-del-line',
  '--diff-add-text',
  '--diff-del-text'
]

const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

// Monaco throws out of defineTheme on a colour it cannot parse, which would
// take the viewer down with it — so anything unreadable is left out instead.
function hexOf(value) {
  const said = String(value ?? '').trim()
  const hex = said.match(HEX)
  if (hex) {
    const d = hex[1]
    return `#${(d.length === 3 ? [...d].map((c) => c + c).join('') : d).toLowerCase()}`
  }
  const rgb = said.match(RGB)
  if (!rgb) return null
  return `#${rgb
    .slice(1, 4)
    .map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * @param {Record<string, string>} resolved  token → computed value
 * @param {{ dark: boolean }} opts
 * @returns {{ base: string, inherit: boolean, rules: Array, colors: Record<string, string> }}
 */
export function monacoThemeData(resolved, { dark }) {
  const paint = {
    'editor.background': '--bg',
    'editor.foreground': '--text',
    'editorGutter.background': '--bg',
    'editorLineNumber.foreground': '--text-dim',
    'editorLineNumber.activeForeground': '--text',
    'editorIndentGuide.background': '--border',
    'editorWhitespace.foreground': '--border',
    'editorCursor.foreground': '--accent',
    'diffEditor.insertedLineBackground': '--diff-add-line',
    'diffEditor.removedLineBackground': '--diff-del-line',
    'diffEditor.insertedTextBackground': '--diff-add-text',
    'diffEditor.removedTextBackground': '--diff-del-text',
    'diffEditorGutter.insertedLineBackground': '--diff-add-line',
    'diffEditorGutter.removedLineBackground': '--diff-del-line',
    'diffEditorOverview.insertedForeground': '--diff-add-text',
    'diffEditorOverview.removedForeground': '--diff-del-text'
  }
  const colors = {}
  for (const [key, token] of Object.entries(paint)) {
    const hex = hexOf(resolved[token])
    if (hex) colors[key] = hex
  }
  return { base: dark ? 'vs-dark' : 'vs', inherit: true, rules: [], colors }
}
