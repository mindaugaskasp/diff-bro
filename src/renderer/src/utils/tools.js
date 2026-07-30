// The single tool registry. Every tool surface reads from this list — the
// sidebar shelf, the command palette's tools scope, and the launcher's Tools
// section — so a tool's icon, wording and action can never drift between them.
// `kind` is the accurate one-word action (never a blanket "Convert"); `action`
// is the menu action that opens it (see MENU_ACTIONS in stores/diffStore.js).

/**
 * @typedef {object} Tool
 * @property {string} id      stable key, also what `recent` stores
 * @property {string} name    proper-case label
 * @property {string} icon    an ICONS key (src/renderer/src/icons.js)
 * @property {string} kind    accurate one-word action
 * @property {string} action  menu action that opens it
 */

/** @type {Tool[]} */
export const TOOLS = [
  { id: 'base64', name: 'Base64', icon: 'binary', kind: 'Encode', action: 'tools-base64' },
  { id: 'json', name: 'JSON', icon: 'braces', kind: 'Format', action: 'tools-json' },
  { id: 'xml', name: 'XML', icon: 'code', kind: 'Format', action: 'tools-xml' },
  { id: 'uuid', name: 'UUID', icon: 'hash', kind: 'Generate', action: 'tools-uuid' },
  { id: 'jwt', name: 'JWT', icon: 'shield-check', kind: 'Decode', action: 'tools-jwt' },
  { id: 'epoch', name: 'Epoch', icon: 'clock', kind: 'Convert', action: 'tools-epoch' },
  { id: 'url', name: 'URL', icon: 'link', kind: 'Encode', action: 'tools-url' },
  { id: 'lines', name: 'Lines', icon: 'list', kind: 'Transform', action: 'tools-lines' },
  { id: 'crypt', name: 'Encrypt', icon: 'lock', kind: 'Encrypt', action: 'tools-crypt' },
  { id: 'patch', name: 'Patch', icon: 'file', kind: 'Apply', action: 'apply-patch' }
]

export const MAX_RECENT_TOOLS = 5

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]))

/**
 * @param {string} id
 * @returns {Tool|undefined}
 */
export const toolById = (id) => BY_ID.get(id)

// Stored ids are untrusted (hand-edited settings, a tool removed in an update),
// so unknown ids are dropped rather than rendered as a blank row.
/**
 * @param {string[]} ids  most-recent-first
 * @returns {Tool[]}
 */
export function recentTools(ids) {
  const seen = new Set()
  const out = []
  for (const id of ids || []) {
    const tool = BY_ID.get(id)
    if (!tool || seen.has(id)) continue
    seen.add(id)
    out.push(tool)
    if (out.length === MAX_RECENT_TOOLS) break
  }
  return out
}

/**
 * @param {string[]} ids  the current recents, most-recent-first
 * @param {string} id     the tool just used
 * @returns {string[]}    ids with `id` first, deduped, capped
 */
export function noteRecent(ids, id) {
  if (!BY_ID.has(id)) return (ids || []).slice(0, MAX_RECENT_TOOLS)
  return [id, ...(ids || []).filter((x) => x !== id)].slice(0, MAX_RECENT_TOOLS)
}

/**
 * Sections for the tools palette: recents on top (omitted when there are none),
 * then everything. A recent tool appears in both — it is the shortcut, not a
 * different tool.
 * @param {string[]} ids
 * @returns {{ label: string, items: Tool[] }[]}
 */
export function toolSections(ids) {
  const recent = recentTools(ids)
  const all = { label: 'All tools', items: TOOLS }
  return recent.length ? [{ label: 'Recent', items: recent }, all] : [all]
}

/**
 * The palette's unfiltered tool list: one flat array so keyboard nav stays a
 * single index, with `section` set on the row that opens each group. Filtering
 * ranks plain TOOLS instead, so a recent tool can't match twice.
 * @param {string[]} ids
 * @returns {(Tool & { section: string })[]}
 */
export function toolPaletteItems(ids) {
  const out = []
  for (const { label, items } of toolSections(ids)) {
    items.forEach((tool, i) => out.push({ ...tool, section: i === 0 ? label : '' }))
  }
  return out
}
