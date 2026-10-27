// What the export save dialog suggests, decided in main: the renderer names a
// format and a display name, never an extension it can pick freely.

const FORMATS = Object.freeze(
  Object.assign(Object.create(null), {
    html: { ext: 'html', titleKey: 'export.html' },
    csv: { ext: 'csv', titleKey: 'export.csv' },
    text: { ext: null, titleKey: 'export.text' }
  })
)

// The snippet syntaxes' file extensions; anything else is saved as .txt.
const TEXT_EXTENSIONS = new Set(
  'txt md json yml yaml sql py sh php js ts xml html css go rs java mmd'.split(' ')
)

const safeName = (name, fallback) => String(name || fallback).replace(/[\\/:*?"<>|]/g, '-')

function textTarget(name) {
  const safe = safeName(name, 'snippet')
  const match = safe.match(/^(.+)\.([A-Za-z0-9]+)$/)
  const ext = match && TEXT_EXTENSIONS.has(match[2].toLowerCase()) ? match[2].toLowerCase() : 'txt'
  const stem = match ? match[1] : safe
  return { stem, ext }
}

/**
 * @param {unknown} format
 * @param {unknown} name
 * @returns {{ defaultPath: string, filters: {name: string, extensions: string[]}[], titleKey: string }|null}
 */
export function exportTarget(format, name) {
  const spec = typeof format === 'string' ? FORMATS[format] : undefined
  if (!spec) return null
  const { stem, ext } = spec.ext
    ? { stem: safeName(name, 'diff'), ext: spec.ext }
    : textTarget(name)
  return {
    defaultPath: `${stem}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    titleKey: spec.titleKey
  }
}
