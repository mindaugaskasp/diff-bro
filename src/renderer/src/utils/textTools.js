import { formatJson, formatXml, validateJson, validateXml } from './textFormats'
import { convertUuid, validateUuid } from './uuid'
import {
  convertEpoch,
  convertUrlCode,
  decodeJwt,
  validateEpoch,
  validateJwt,
  validateUrlCode
} from './devTools'

// All format/validate tools are one dialog driven by this table: a new tool is
// an entry here + a menu accelerator, never another dialog component.
export const TEXT_TOOLS = {
  base64: {
    title: 'Base64',
    language: 'plaintext',
    // A rich panel (ToolBase64.vue): encode/decode, URL-safe, wrap, byte counts.
    panel: 'base64'
  },
  json: {
    title: 'JSON',
    language: 'json',
    // A rich panel (ToolJson.vue): pretty/minify/sort, JSONPath filter, tree.
    panel: 'json',
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
  uuid: {
    title: 'UUID',
    language: 'plaintext',
    // A rich panel (ToolUuid.vue): generate v1/v4/v5/v6/v7, inspect, convert.
    panel: 'uuid',
    validate: validateUuid,
    format: convertUuid,
    actionLabel: 'Convert',
    validLabel: 'Valid UUID',
    requiresValid: true
  },
  jwt: {
    title: 'JWT',
    language: 'json',
    // A rich panel (ToolJwt.vue): decoded header/payload + humanized claims.
    panel: 'jwt',
    validate: validateJwt,
    format: decodeJwt,
    actionLabel: 'Decode',
    validLabel: 'Valid JWT',
    requiresValid: true
  },
  epoch: {
    title: 'Epoch / Date',
    language: 'plaintext',
    // A rich panel (ToolEpoch.vue) instead of a text buffer — see TextToolDialog.
    panel: 'epoch',
    validate: validateEpoch,
    format: convertEpoch,
    actionLabel: 'Convert',
    validLabel: 'Valid timestamp / date',
    requiresValid: true
  },
  url: {
    title: 'URL',
    language: 'plaintext',
    // A rich panel (ToolUrl.vue): encode/decode + editable query-param table.
    panel: 'url',
    validate: validateUrlCode,
    format: convertUrlCode,
    actionLabel: 'Encode / Decode',
    validLabel: 'Ready',
    requiresValid: false
  },
  lines: {
    title: 'Lines',
    language: 'plaintext',
    // A rich panel (ToolLines.vue): clean up, sort, and build lists.
    panel: 'lines'
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
