// A tag written `a/b/c` is a section nested three deep (#121); main refuses deeper at the MCP input check.

export const MAX_TAG_DEPTH = 3

/** @param {string} tag @returns {string[]} */
export const tagPath = (tag) =>
  String(tag)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)

/** @param {string} tag */
export const isTagTooDeep = (tag) => tagPath(tag).length > MAX_TAG_DEPTH
