// The hue is a glyph-well identity (ui.css [data-hue]), never ink.
export const TOOL_GROUPS = [
  { hue: 'encode', labelKey: 'toolGroups.encode', ids: ['base64', 'url'] },
  { hue: 'format', labelKey: 'toolGroups.format', ids: ['json', 'xml', 'lines'] },
  { hue: 'generate', labelKey: 'toolGroups.generate', ids: ['uuid', 'epoch', 'hash'] },
  { hue: 'inspect', labelKey: 'toolGroups.inspect', ids: ['jwt', 'regex'] },
  { hue: 'secure', labelKey: 'toolGroups.secure', ids: ['crypt', 'patch'] }
]

const HUE_OF = new Map(TOOL_GROUPS.flatMap((g) => g.ids.map((id) => [id, g.hue])))

/**
 * @param {string} id tool id
 * @returns {string} the group hue, `format` for an unknown id
 */
export const toolHue = (id) => HUE_OF.get(id) ?? 'format'
