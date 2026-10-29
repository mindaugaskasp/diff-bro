// Tags as a tree (#121): a tag written `a/b/c` is a section nested three deep.
// Pure, so the shape is testable without a component.

import { MAX_TAG_DEPTH, tagPath } from '../../../shared/tagPath'

export { MAX_TAG_DEPTH, isTagTooDeep, tagPath } from '../../../shared/tagPath'

const byLabel = (a, b) => a.label.localeCompare(b.label)

function nodeAt(level, parts) {
  let nodes = level
  let node = null
  parts.forEach((label, i) => {
    const path = parts.slice(0, i + 1).join('/')
    node = nodes.get(path)
    if (!node) {
      node = { path, label, items: [], children: new Map(), all: new Set() }
      nodes.set(path, node)
    }
    nodes = node.children
  })
  return node
}

function place(roots, entry, tag) {
  const parts = tagPath(tag).slice(0, MAX_TAG_DEPTH)
  if (!parts.length) return false
  const leaf = nodeAt(roots, parts)
  if (!leaf.items.includes(entry)) leaf.items.push(entry)
  let nodes = roots
  for (let i = 0; i < parts.length; i++) {
    const node = nodes.get(parts.slice(0, i + 1).join('/'))
    node.all.add(entry)
    nodes = node.children
  }
  return true
}

function finish(nodes) {
  return [...nodes.values()]
    .map(({ path, label, items, children, all }) => ({
      path,
      label,
      items,
      count: all.size,
      children: finish(children)
    }))
    .sort(byLabel)
}

/**
 * Starred items sit in Favorites only; the rest under every tag they carry, in
 * the order given; anything with no tag in Untagged. `within` (the # scope)
 * keeps one branch: an item is placed only under its tags inside it. `tagsOf`
 * picks which of an item's tags place it (a snippet's format tag does not).
 * @template {{ tags?: string[], favorite?: boolean }} T
 * @param {T[]} items
 * @param {{ within?: string, tagsOf?: (item: T) => string[] }} [opts]
 * @returns {{ favorites: T[], sections: object[], untagged: T[] }}
 */
export function buildTagTree(items, { within = '', tagsOf = (e) => e.tags ?? [] } = {}) {
  const roots = new Map()
  const favorites = []
  const untagged = []
  const inScope = (tag) => {
    const path = tagPath(tag).join('/')
    return !within || path === within || path.startsWith(`${within}/`)
  }
  for (const entry of items) {
    if (entry.favorite) {
      favorites.push(entry)
      continue
    }
    const placed = tagsOf(entry)
      .filter(inScope)
      .map((tag) => place(roots, entry, tag))
    if (!within && !placed.some(Boolean)) untagged.push(entry)
  }
  return { favorites, sections: finish(roots), untagged }
}

/**
 * What `#` in the search box offers: each tag, and each of its parents.
 * @param {string[]} tags every tag in the list
 * @param {string} typed what follows the `#`
 * @returns {string[]}
 */
export function scopeOptions(tags, typed) {
  const paths = new Set()
  for (const tag of tags) {
    const parts = tagPath(tag).slice(0, MAX_TAG_DEPTH)
    parts.forEach((_, i) => paths.add(parts.slice(0, i + 1).join('/')))
  }
  const needle = typed.trim().toLowerCase()
  return [...paths].filter((p) => p.toLowerCase().includes(needle)).sort()
}
