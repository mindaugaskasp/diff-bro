// {{variable}} placeholders in a snippet (used by Claude prompt snippets). Pure
// so it stays unit-testable; the fill UI and copy flow build on it.

// A placeholder is {{ name }} where name is word chars, dot or dash. Whitespace
// inside the braces is tolerated and ignored.
const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g

/**
 * Distinct placeholder names, in first-seen order.
 * @param {string} text
 * @returns {string[]}
 */
export function parseTemplateVars(text) {
  const seen = []
  for (const m of String(text ?? '').matchAll(VAR_RE)) {
    if (!seen.includes(m[1])) seen.push(m[1])
  }
  return seen
}

/**
 * Substitute the provided values. A placeholder with no value is left intact, so
 * a partial fill is visible rather than silently blanked.
 * @param {string} text
 * @param {Record<string,string>} values
 * @returns {string}
 */
export function fillTemplate(text, values) {
  return String(text ?? '').replace(VAR_RE, (whole, name) => {
    const v = values?.[name]
    return v == null || v === '' ? whole : v
  })
}
