// One Mermaid source carrying BOTH revisions, so the comparison renders through
// a single layout. Two independent renders drift — inserting one node moves
// everything below it — and a reader cannot tell drift from change.
//
// Status rides on a `:::class`, never a `classDef`: mermaid compiles a classDef
// to an inline `style="fill:… !important"`, which is a hardcoded colour no theme
// can re-tint. The classes are styled from tokens in our own CSS instead.

const HEADERS = {
  'flowchart-v2': 'flowchart TD',
  stateDiagram: 'flowchart TD',
  classDiagram: 'flowchart TD',
  er: 'flowchart TD'
}

// A label comes from the compared FILES, so it is attacker-controlled text being
// written back into Mermaid syntax (rule 6). Everything structural is neutered:
// quotes become the entity mermaid reads as a quote, and the characters that
// open a directive, a statement or a shape are stripped rather than escaped —
// there is no legitimate label that needs them, and stripping cannot be
// half-right the way an escape table can.
const safeLabel = (raw) =>
  String(raw ?? '')
    .replace(/"/g, '#quot;')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[%{}[\]()<>;|]/g, ' ')
    .replace(/-{2,}>?/g, ' ')
    .trim()
    .slice(0, 200)

// Mermaid ids are bare words; anything else would end the token.
const safeId = (raw) => String(raw ?? '').replace(/[^A-Za-z0-9_]/g, '_') || 'n'

const nodeLine = (n) => {
  const label = safeLabel(n.status === 'changed' && n.was ? `${n.label} (was: ${n.was})` : n.label)
  return `  ${safeId(n.id)}["${label}"]:::${n.status}`
}

const edgeLine = (e) => {
  const label = safeLabel(e.label)
  const arrow = label ? `-- ${label} -->` : '-->'
  return `  ${safeId(e.start)} ${arrow} ${safeId(e.end)}`
}

/**
 * @param {{nodes: object[], edges: object[]}} diff  from diffDiagrams
 * @param {string} [type]                            the parsed diagram type
 * @returns {string} a Mermaid source holding both revisions
 */
export function unionSource(diff, type) {
  const header = HEADERS[type] ?? 'flowchart TD'
  const lines = [header]
  for (const n of diff?.nodes ?? []) lines.push(nodeLine(n))
  for (const e of diff?.edges ?? []) lines.push(edgeLine(e))
  return `${lines.join('\n')}\n`
}
