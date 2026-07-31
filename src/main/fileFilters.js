// Open-dialog filters, keyed by the format ids the empty-state tiles send.
// The renderer names a format; it never supplies a filter object, so it cannot
// widen the dialog or smuggle a path pattern of its own (rule 6).

const FILTERS = {
  xlsx: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  json: [{ name: 'JSON', extensions: ['json', 'jsonc', 'json5'] }],
  xml: [{ name: 'XML', extensions: ['xml', 'xsd', 'xsl', 'svg', 'plist'] }],
  yaml: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
  csv: [{ name: 'CSV', extensions: ['csv', 'tsv'] }],
  markdown: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }]
}

const ALL = { name: 'All files', extensions: ['*'] }

/**
 * @param {unknown} format  a key of FILTERS, or anything else for no filtering
 * @returns {{name: string, extensions: string[]}[]|undefined} dialog filters
 */
export function filtersFor(format) {
  // hasOwn, not a plain lookup: 'constructor' would otherwise resolve up the
  // prototype chain and hand the dialog a function.
  const picked =
    typeof format === 'string' && Object.hasOwn(FILTERS, format) ? FILTERS[format] : null
  // "All files" stays last so the chosen type leads but nothing is unreachable.
  return picked ? [...picked, ALL] : undefined
}

export const FORMAT_IDS = Object.keys(FILTERS)
