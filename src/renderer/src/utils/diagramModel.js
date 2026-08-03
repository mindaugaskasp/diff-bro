// A Mermaid diagram as a graph, so two of them can be compared as structure
// rather than as text. mermaid's own parser does the work — hand-writing one
// would duplicate the grammar and drift on every release — and `db.getData()`
// returns the same {nodes, edges} shape for the four types below, which is what
// makes one extractor enough.
//
// Nothing here renders: getDiagramFromText parses only, so this stays a pure
// unit that runs under vitest.

import { MERMAID_BASE_CONFIG } from './mermaid'

/** The types whose db exposes getData(). Everything else needs its own extractor. */
export const SUPPORTED_DIAGRAMS = ['flowchart-v2', 'stateDiagram', 'classDiagram', 'er']

// An ER node's id carries the order it was parsed in (entity-CUSTOMER-0), so
// inserting an entity above renumbers every one below and the whole diagram
// reads as rewritten. The name between the fixed prefix and that counter is the
// stable identity.
const ER_ID = /^entity-(.+)-\d+$/

const semanticId = (raw) => ER_ID.exec(String(raw ?? ''))?.[1] ?? String(raw ?? '')

const nodeOf = (n) => ({
  id: semanticId(n.id),
  label: String(n.label ?? n.text ?? ''),
  shape: n.shape ?? null,
  isGroup: n.isGroup === true,
  parentId: n.parentId ? semanticId(n.parentId) : null
})

const edgeOf = (e) => ({
  start: semanticId(e.start),
  end: semanticId(e.end),
  label: String(e.label ?? '')
})

/**
 * Parse `text` into a comparable graph.
 * @param {string} text
 * @returns {Promise<{type: string, nodes: object[], edges: object[]}
 *                   | {error: string} | null>}
 *   null when the diagram is of a type this does not model.
 */
export async function modelFrom(text) {
  const parsed = await parse(text)
  if (parsed.error) return parsed
  const data = graphData(parsed.diagram)
  if (!data) return null
  return {
    type: parsed.diagram.type ?? parsed.diagram.db.type ?? 'unknown',
    nodes: data.nodes.map(nodeOf),
    edges: data.edges.map(edgeOf)
  }
}

// null for a type with no shared model — sequence, gantt, pie and the rest each
// expose a bespoke db (getActors/getSections/getCommits) and need their own
// extractor rather than a coerced one.
function graphData(diagram) {
  if (typeof diagram?.db?.getData !== 'function') return null
  const data = diagram.db.getData()
  return Array.isArray(data?.nodes) && Array.isArray(data?.edges) ? data : null
}

async function parse(text) {
  const mermaid = (await import('mermaid')).default
  // getDiagramFromText resolves the type against the registered config, so an
  // uninitialised mermaid reports every diagram as "no type detected".
  mermaid.initialize(MERMAID_BASE_CONFIG)
  try {
    return { diagram: await mermaid.mermaidAPI.getDiagramFromText(String(text ?? '')) }
  } catch (e) {
    return { error: cleanError(e) }
  }
}

const cleanError = (e) =>
  String(e?.message ?? e)
    .replace(/^error:\s*/i, '')
    .trim()
    .slice(0, 400) || 'Could not read this diagram.'
