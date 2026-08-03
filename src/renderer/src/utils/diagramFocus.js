// Narrow a diff to what changed plus a ring of context. On a large diagram every
// node is on screen and none of them is the answer; this keeps the change and
// enough around it to place the change, and reports exactly how much it hid.

const CHANGED = new Set(['added', 'removed', 'changed', 'renamed'])

/**
 * @param {{nodes: object[], edges: object[]}} diff
 * @param {number} [radius] hops of context to keep around each change
 * @returns {{nodes: object[], edges: object[], hidden: number}}
 */
export function focusDiff(diff, radius = 1) {
  const nodes = diff?.nodes ?? []
  const edges = diff?.edges ?? []
  const changed = nodes.filter((n) => CHANGED.has(n.status)).map((n) => n.id)
  // Nothing changed: hiding the whole diagram would answer a question nobody
  // asked. Show it as it is.
  if (!changed.length) return { nodes, edges, hidden: 0 }

  const keep = new Set(changed)
  // Each hop expands from the set as it stood at the START of that hop. Adding
  // to `keep` mid-pass would let one hop cascade the length of a chain, which is
  // "radius" meaning nothing.
  for (let hop = 0; hop < Math.max(0, radius); hop++) {
    const frontier = new Set()
    for (const e of edges) {
      if (keep.has(e.start)) frontier.add(e.end)
      if (keep.has(e.end)) frontier.add(e.start)
    }
    for (const id of frontier) keep.add(id)
  }
  const kept = nodes.filter((n) => keep.has(n.id))
  return {
    nodes: kept,
    edges: edges.filter((e) => keep.has(e.start) && keep.has(e.end)),
    hidden: nodes.length - kept.length
  }
}
