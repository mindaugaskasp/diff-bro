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

/**
 * The Tools panel's sections: Pinned first in pin order, then each job group
 * without its pinned tools. Groups the search emptied are dropped.
 * @template {{ id: string }} T
 * @param {T[]} tools  the tools the search left
 * @param {string[]} pinnedIds  in pin order
 * @returns {{ key: string, labelKey: string, tools: T[] }[]}
 */
export function toolTileGroups(tools, pinnedIds) {
  const byId = new Map(tools.map((tool) => [tool.id, tool]))
  const pinned = new Set(pinnedIds)
  const sections = [
    {
      key: 'pinned',
      labelKey: 'toolGroups.pinned',
      tools: pinnedIds.map((id) => byId.get(id)).filter(Boolean)
    },
    ...TOOL_GROUPS.map((group) => ({
      key: group.hue,
      labelKey: group.labelKey,
      tools: group.ids
        .filter((id) => !pinned.has(id))
        .map((id) => byId.get(id))
        .filter(Boolean)
    }))
  ]
  return sections.filter((section) => section.tools.length)
}
