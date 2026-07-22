import { formatJson, formatXml, validateJson, validateXml } from './textFormats'
import { formatSql, validateSql } from './sqlFormat'

// The format/validate tools are one dialog driven by this table: they differ
// only in their syntax, their two pure functions, and their wording. Adding a
// tool means adding an entry here plus its menu accelerator — never another
// near-identical dialog component.
//
//   language      Monaco language id (also the syntax a snippet is saved as)
//   validate      (text) => { valid, error?, line?, column? }
//   format        (text) => string
//   validLabel    status line when the input parses
//   requiresValid Format only makes sense on parseable input
//   note          optional caveat shown above the actions
export const TEXT_TOOLS = {
  json: {
    title: 'JSON Format / Validate',
    language: 'json',
    validate: validateJson,
    format: formatJson,
    validLabel: 'Valid JSON',
    requiresValid: true
  },
  xml: {
    title: 'XML Format / Validate',
    language: 'xml',
    validate: validateXml,
    format: formatXml,
    validLabel: 'Valid XML',
    requiresValid: true
  },
  sql: {
    title: 'SQL Format / Validate',
    language: 'sql',
    validate: validateSql,
    format: formatSql,
    validLabel: 'Looks valid',
    // The SQL formatter is best-effort, so it stays useful on input the
    // validator can't vouch for.
    requiresValid: false,
    note:
      'Best-effort formatting/validation — not a full SQL parser, so treat "looks valid" as a ' +
      'smoke test, not a guarantee.'
  }
}

// One status line for every tool: the tool's own "valid" wording, or the error
// with a location when the validator could pin one down.
/**
 * @param {import('../types').TextTool} tool
 * @param {import('../types').ValidationResult|null} status
 * @returns {string} the status line, '' before anything is typed
 */
export function toolStatusText(tool, status) {
  if (!status) return ''
  if (status.valid) return tool.validLabel
  const loc = status.line ? ` (line ${status.line}, column ${status.column})` : ''
  return `Invalid${loc}: ${status.error}`
}
