// The one list every tool surface reads — sidebar shelf, palette tools scope,
// launcher — so their icons and wording cannot drift apart.

/**
 * @typedef {object} Tool
 * @property {string} id      stable key, also what `recent` stores
 * @property {string} nameKey catalogue key for its proper-case label
 * @property {string} icon    an ICONS key (src/renderer/src/icons.js)
 * @property {string} kindKey catalogue key for its one-word action
 * @property {string} descKey catalogue key for its one-line description
 * @property {string} action  menu action that opens it
 */

/** @type {Tool[]} */
export const TOOLS = [
  {
    id: 'base64',
    nameKey: 'tools.base64.name',
    icon: 'binary',
    kindKey: 'tools.base64.kind',
    descKey: 'tools.base64.desc',
    action: 'tools-base64'
  },
  {
    id: 'json',
    nameKey: 'tools.json.name',
    icon: 'braces',
    kindKey: 'tools.json.kind',
    descKey: 'tools.json.desc',
    action: 'tools-json'
  },
  {
    id: 'xml',
    nameKey: 'tools.xml.name',
    icon: 'code',
    kindKey: 'tools.xml.kind',
    descKey: 'tools.xml.desc',
    action: 'tools-xml'
  },
  {
    id: 'uuid',
    nameKey: 'tools.uuid.name',
    icon: 'hash',
    kindKey: 'tools.uuid.kind',
    descKey: 'tools.uuid.desc',
    action: 'tools-uuid'
  },
  {
    id: 'jwt',
    nameKey: 'tools.jwt.name',
    icon: 'shield-check',
    kindKey: 'tools.jwt.kind',
    descKey: 'tools.jwt.desc',
    action: 'tools-jwt'
  },
  {
    id: 'epoch',
    nameKey: 'tools.epoch.name',
    icon: 'clock',
    kindKey: 'tools.epoch.kind',
    descKey: 'tools.epoch.desc',
    action: 'tools-epoch'
  },
  {
    id: 'url',
    nameKey: 'tools.url.name',
    icon: 'link',
    kindKey: 'tools.url.kind',
    descKey: 'tools.url.desc',
    action: 'tools-url'
  },
  {
    id: 'lines',
    nameKey: 'tools.lines.name',
    icon: 'list',
    kindKey: 'tools.lines.kind',
    descKey: 'tools.lines.desc',
    action: 'tools-lines'
  },
  {
    id: 'hash',
    nameKey: 'tools.hash.name',
    icon: 'fingerprint',
    kindKey: 'tools.hash.kind',
    descKey: 'tools.hash.desc',
    action: 'tools-hash'
  },
  {
    id: 'regex',
    nameKey: 'tools.regex.name',
    icon: 'regex',
    kindKey: 'tools.regex.kind',
    descKey: 'tools.regex.desc',
    action: 'tools-regex'
  },
  {
    id: 'crypt',
    nameKey: 'tools.crypt.name',
    icon: 'lock',
    kindKey: 'tools.crypt.kind',
    descKey: 'tools.crypt.desc',
    action: 'tools-crypt'
  },
  {
    id: 'patch',
    nameKey: 'tools.patch.name',
    icon: 'file',
    kindKey: 'tools.patch.kind',
    descKey: 'tools.patch.desc',
    action: 'apply-patch'
  }
]

// How many the palette's "Recent" section remembers. Most-recent-first, so it
// rotates with what you actually reach for rather than accumulating. Recency
// decides MEMBERSHIP of that section only — never the position of a row in the
// sidebar or the rail, which order by pins (see toolRows).
export const MAX_RECENT_TOOLS = 9

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]))

/**
 * @param {string} id
 * @returns {Tool|undefined}
 */
export const toolById = (id) => BY_ID.get(id)

// Stored ids outlive the registry (hand-edited settings, a removed tool).
/**
 * @param {string[]} ids  most-recent-first
 * @param {number} [limit]  how many this surface has room for
 * @returns {Tool[]}
 */
export function recentTools(ids, limit = MAX_RECENT_TOOLS) {
  const seen = new Set()
  const out = []
  for (const id of ids || []) {
    const tool = BY_ID.get(id)
    if (!tool || seen.has(id)) continue
    seen.add(id)
    out.push(tool)
    if (out.length === limit) break
  }
  return out
}

/**
 * Row order for the sidebar section and the rail: pinned first, then the rest,
 * BOTH in registry order. Recency decides membership in the palette; it never
 * decides position here, so a row cannot move as a side effect of being used —
 * which is what the recents shelf did on every click.
 * @param {string[]} pinnedIds  ids the user pinned, in any order
 * @param {number} [limit]      how many the surface has room for
 * @returns {(Tool & { pinned: boolean })[]}
 */
export function toolRows(pinnedIds, limit = TOOLS.length) {
  const pinned = new Set((pinnedIds || []).filter((id) => BY_ID.has(id)))
  const rows = TOOLS.map((tool) => ({ ...tool, pinned: pinned.has(tool.id) }))
  return [...rows.filter((t) => t.pinned), ...rows.filter((t) => !t.pinned)].slice(0, limit)
}

/**
 * Resolve a row's `nameKey`/`kindKey` into the `name`/`kind` every surface
 * renders and SEARCHES on. The translator is passed in rather than imported:
 * utils/ may not touch Vue, and doing it once here keeps the two names from
 * being resolved differently by each caller — the launcher ranks on `name`, so
 * a missed one silently stops matching.
 *
 * @param {Tool[]} rows
 * @param {(key: string) => string} translate
 * @returns {(Tool & { name: string, kind: string })[]}
 */
export const namedTools = (rows, translate) =>
  rows.map((tool) => ({ ...tool, name: translate(tool.nameKey), kind: translate(tool.kindKey) }))

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
 * @returns {{ labelKey: string, items: Tool[] }[]}
 */
export function toolSections(ids) {
  const recent = recentTools(ids)
  if (!recent.length) return [{ labelKey: 'tools.section.all', items: TOOLS }]
  const recentIds = new Set(recent.map((t) => t.id))
  return [
    { labelKey: 'tools.section.recent', items: recent },
    { labelKey: 'tools.section.other', items: TOOLS.filter((t) => !recentIds.has(t.id)) }
  ]
}

/**
 * The palette's unfiltered tool list: one flat array so keyboard nav stays a
 * single index, with `section` set on the row that opens each group. Filtering
 * ranks plain TOOLS instead, so a recent tool can't match twice.
 * @param {string[]} ids
 * @returns {(Tool & { sectionKey: string })[]}
 */
export function toolPaletteItems(ids) {
  const out = []
  for (const { labelKey, items } of toolSections(ids)) {
    items.forEach((tool, i) => out.push({ ...tool, sectionKey: i === 0 ? labelKey : '' }))
  }
  return out
}
