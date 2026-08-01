// The sidebar's tag filter. Several tags can be active at once, and picking two
// means "either" — the rows carrying alpha OR beta. Requiring both would hide a
// row tagged only alpha, which is the opposite of what picking alpha asked for.

/**
 * @param {string[]} [entryTags] the tags on one row
 * @param {string[]} [active]    the tags currently selected in the sidebar
 * @returns {boolean}
 */
export function matchesTags(entryTags, active) {
  if (!active?.length) return true
  const has = new Set(entryTags ?? [])
  return active.some((t) => has.has(t))
}

/**
 * Add or remove one tag from the selection, returned as a new array so callers
 * stay reactive.
 * @param {string[]} [active]
 * @param {string} name
 * @returns {string[]}
 */
export function toggleTag(active, name) {
  const list = active ?? []
  return list.includes(name) ? list.filter((t) => t !== name) : [...list, name]
}
