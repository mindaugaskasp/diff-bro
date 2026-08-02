// Monaco's token types → the five colours the snippet preview paints with.
// Pure: Monaco hands over {offset, type} per line and this turns it into spans
// the template renders through interpolation, so no markup is ever generated
// and rule 8 stays intact.

/** The palette, matching the --syn-* tokens in themes.css. */
export const SYNTAX_ROLES = ['keyword', 'string', 'number', 'property', 'comment']

// Monaco namespaces a type as `root.detail.language` (string.key.json), so the
// root picks the role and the detail refines it. Anything unlisted stays plain:
// identifiers and punctuation are most of a line, and colouring them is what
// stops the rest from standing out.
const BY_ROOT = {
  keyword: 'keyword',
  string: 'string',
  number: 'number',
  constant: 'number',
  comment: 'comment',
  tag: 'property',
  type: 'property',
  attribute: 'property'
}

/**
 * @param {string} type  a Monaco token type
 * @returns {''|'keyword'|'string'|'number'|'property'|'comment'}
 */
export function roleOf(type) {
  const parts = String(type ?? '').split('.')
  const role = BY_ROOT[parts[0]]
  if (!role) return ''
  // A JSON key and an attribute's value are both `string`/`attribute` to Monaco
  // but not to a reader: the key names a field, the value carries data.
  if (parts[0] === 'string') return parts[1] === 'key' ? 'property' : 'string'
  if (parts[0] === 'attribute') return parts[1] === 'value' ? 'string' : 'property'
  return role
}

/**
 * One line as coloured runs. Always covers the whole line, so joining the spans
 * gives the line back unchanged.
 * @param {string} line
 * @param {{ offset: number, type: string }[]} [tokens]
 * @returns {{ text: string, role: string }[]}
 */
export function spansFor(line, tokens) {
  const text = String(line ?? '')
  const list = tokens ?? []
  if (!list.length) return [{ text, role: '' }]
  const spans = []
  for (let i = 0; i < list.length; i++) {
    const start = Math.min(list[i].offset, text.length)
    const end = Math.min(list[i + 1]?.offset ?? text.length, text.length)
    if (end <= start) continue
    spans.push({ text: text.slice(start, end), role: roleOf(list[i].type) })
  }
  return spans.length ? spans : [{ text, role: '' }]
}
