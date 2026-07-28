import { formatJson, formatXml, validateJson, validateXml } from './textFormats'
import { formatSql, validateSql } from './sqlFormat'
import { convertUuid, validateUuid } from './uuid'

// All format/validate tools are one dialog driven by this table: a new tool is
// an entry here + a menu accelerator, never another dialog component.
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
  },
  uuid: {
    title: 'UUID Convert',
    language: 'plaintext',
    validate: validateUuid,
    format: convertUuid,
    actionLabel: 'Convert',
    validLabel: 'Valid UUID',
    requiresValid: true,
    note: 'Converts a canonical 8-4-4-4-12 UUID to its 32-hex (BINARY(16)) form and back.'
  }
}

// The tool's "valid" wording, or the error with a location when known.
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
