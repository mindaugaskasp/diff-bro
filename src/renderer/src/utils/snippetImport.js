// Parse an imported file into snippet drafts ({ name, content, language, tags }).
// This is an UNTRUSTED input surface (CLAUDE.md #6): everything is size-capped
// and shape-validated here, and the caller re-encrypts each draft through the
// vault before it is ever stored. Pure, so it's unit-tested.
//
// A VS Code snippets `.json` (an object of { prefix?, body, scope? } defs)
// becomes one snippet per entry; anything else (including a `.json` that isn't
// that shape) is imported verbatim as a single snippet named after the file.

export const MAX_IMPORT_BYTES = 1_000_000

const cleanName = (n) =>
  String(n ?? '')
    .trim()
    .slice(0, 200) || 'Imported snippet'
const baseName = (f) =>
  String(f ?? '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.[^.]+$/, '') || 'Imported snippet'

function vsCodeDraft(name, def) {
  if (!def || typeof def !== 'object' || def.body == null) return null
  const content = Array.isArray(def.body) ? def.body.join('\n') : String(def.body)
  return { name: cleanName(name), content, language: 'auto', tags: ['imported'] }
}

function parseVsCode(text) {
  let obj
  try {
    obj = JSON.parse(text)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const out = []
  for (const [name, def] of Object.entries(obj)) {
    const draft = vsCodeDraft(name, def)
    if (draft) out.push(draft)
  }
  return out.length ? out : null
}

/**
 * @param {string} text     the file's text
 * @param {string} [filename]
 * @returns {{ snippets: Array<{name:string,content:string,language:string,tags:string[]}> } | { error: string }}
 */
export function parseSnippetImport(text, filename = '') {
  if (typeof text !== 'string') return { error: 'bad-input' }
  if (text.length > MAX_IMPORT_BYTES) return { error: 'too-large' }
  if (/\.json$/i.test(filename)) {
    const vs = parseVsCode(text)
    if (vs) return { snippets: vs }
  }
  if (!text.trim()) return { snippets: [] }
  return {
    snippets: [{ name: baseName(filename), content: text, language: 'auto', tags: ['imported'] }]
  }
}
