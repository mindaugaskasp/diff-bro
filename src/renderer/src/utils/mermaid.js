// Pure Mermaid helpers — no `mermaid` import, so this stays unit-testable and
// adds nothing to the bundle. The heavy library is loaded lazily elsewhere
// (composables/useMermaid.js), only once a diagram is actually rendered.
import { isDarkTheme } from './themes'

// The leading keyword of every Mermaid diagram type we recognize for
// auto-detection. Matched against the first non-empty, non-directive line so a
// pasted diagram is offered the Mermaid syntax without the user picking it.
export const MERMAID_KEYWORDS = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'quadrantChart',
  'requirementDiagram',
  'gitGraph',
  'mindmap',
  'timeline',
  'zenuml',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
  'architecture-beta',
  'kanban',
  'radar-beta',
  'C4Context'
]
const KEYWORD_RE = new RegExp(`^(?:${MERMAID_KEYWORDS.join('|')})\\b`)

const FENCE_OPEN_RE = /^```[ \t]*([\w-]*)[ \t]*$/
const FENCE_CLOSE_RE = /^```[ \t]*$/

// Index range of the non-blank lines, so surrounding blank lines never decide
// whether something is fenced.
function trimmedRange(lines) {
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start++
  while (end > start && !lines[end - 1].trim()) end--
  return [start, end]
}

const opensMermaidFence = (line) => {
  const m = line?.trim().match(FENCE_OPEN_RE)
  return !!m && (!m[1] || m[1].toLowerCase() === 'mermaid')
}

// Diagrams are usually copied out of chat or docs wrapped in a Markdown code
// fence. Mermaid treats the fence lines as diagram text and fails to parse, so
// a wrapping ```mermaid (or bare ```) block is peeled off before detection and
// rendering. Anything else — including a fence tagged for another language — is
// returned untouched.
export function stripMermaidFence(text) {
  const src = String(text ?? '')
  const lines = src.split('\n')
  const [start, end] = trimmedRange(lines)
  if (!opensMermaidFence(lines[start])) return src
  if (end - 1 <= start || !FENCE_CLOSE_RE.test(lines[end - 1].trim())) return src
  return lines.slice(start + 1, end - 1).join('\n')
}

// True when `text` opens like a Mermaid diagram. Skips a leading YAML
// frontmatter block (`---`) and `%%` directives/comments, matching only the
// first real content line so it stays a cheap, false-positive-averse heuristic.
export function looksLikeMermaid(text) {
  const lines = stripMermaidFence(text).split('\n')
  let i = 0
  // Optional --- frontmatter --- block.
  if (lines[i]?.trim() === '---') {
    i++
    while (i < lines.length && lines[i].trim() !== '---') i++
    i++ // past the closing ---
  }
  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('%%')) continue // blank or directive/comment
    return KEYWORD_RE.test(line)
  }
  return false
}

// Diagram theme paired to the app theme: dark-ground themes get Mermaid's dark
// theme, light-ground ones its clean default — so diagram text never blends into
// the canvas. Callers re-render when the app theme flips.
export function mermaidThemeFor(appTheme) {
  return isDarkTheme(appTheme) ? 'dark' : 'default'
}

// Per-render DOM id. Mermaid needs a unique, CSS-selector-safe id for the
// temporary node it measures against; a monotonic counter keeps them distinct
// within a session.
let seq = 0
export function nextDiagramId() {
  seq += 1
  return `mermaid-${seq}`
}
