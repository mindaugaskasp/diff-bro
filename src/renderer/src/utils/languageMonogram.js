// Maps a resolved language / diff-format id to a short monogram + a family tint,
// so every sidebar row (snippet or diff) can lead with a recognizable type
// anchor instead of relying on tag colour alone. Pure and Vue-free: the tint is
// a raw palette value returned to the component, which binds it as an inline
// style (kept out of the token-checked component stylesheets on purpose, the
// same way tag colours are).

// Semantic family tints — grouped by what the data IS, not per theme. Used only
// as a 2px underline accent; the achromatic letters carry recognition, so a weak
// tint on a pale ground never hides a row.
export const MONOGRAM_FAMILIES = {
  data: '#4c8dff',
  db: '#d29922',
  diagram: '#a371f7',
  code: '#3fb950',
  docs: '#8b949e',
  ai: '#d97757'
}

// language/format id → [label, family]. Ids come from languageOf() (snippets)
// and diffFormatTag() (diffs); both are lowercase Monaco/format names.
const MAP = {
  claude: ['CL', 'ai'],
  url: ['URL', 'web'],
  mermaid: ['MMD', 'diagram'],
  sql: ['SQL', 'db'],
  json: ['JSON', 'data'],
  yaml: ['YAML', 'data'],
  xml: ['XML', 'data'],
  html: ['HTML', 'data'],
  toml: ['TOML', 'data'],
  ini: ['INI', 'data'],
  csv: ['CSV', 'data'],
  excel: ['XLSX', 'data'],
  css: ['CSS', 'code'],
  typescript: ['TS', 'code'],
  javascript: ['JS', 'code'],
  python: ['PY', 'code'],
  go: ['GO', 'code'],
  rust: ['RS', 'code'],
  java: ['JAVA', 'code'],
  cpp: ['C++', 'code'],
  csharp: ['C#', 'code'],
  php: ['PHP', 'code'],
  ruby: ['RB', 'code'],
  shell: ['SH', 'code'],
  dockerfile: ['DKR', 'code'],
  markdown: ['MD', 'docs'],
  plaintext: ['TXT', 'docs']
}

/**
 * @param {string|null|undefined} lang resolved language / format id
 * @returns {{ label: string, family: string }} monogram label + tint (hex)
 */
export function languageMonogram(lang) {
  const key = String(lang ?? '')
    .trim()
    .toLowerCase()
  const hit = MAP[key]
  const [label, family] = hit ?? [key ? key.slice(0, 4).toUpperCase() : 'TXT', 'docs']
  return { label, family: MONOGRAM_FAMILIES[family] }
}

// True when the id has a real monogram (not the TXT fallback). Lets a diff row
// recover its type from an existing format tag when the explicit `format` field
// is absent (entries saved before the field existed).
export function isMappedLanguage(id) {
  return Object.prototype.hasOwnProperty.call(
    MAP,
    String(id ?? '')
      .trim()
      .toLowerCase()
  )
}
