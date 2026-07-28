// Pure Mermaid helpers (no `mermaid` import; the library loads lazily in
// composables/useMermaid.js).
import { isDarkTheme } from './themes'

// Leading keyword of each recognized diagram type, matched against the first
// real line for auto-detection.
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

// Peel off a wrapping ```mermaid (or bare ```) fence, which Mermaid would
// otherwise fail to parse. Anything else is returned untouched.
export function stripMermaidFence(text) {
  const src = String(text ?? '')
  const lines = src.split('\n')
  const [start, end] = trimmedRange(lines)
  if (!opensMermaidFence(lines[start])) return src
  if (end - 1 <= start || !FENCE_CLOSE_RE.test(lines[end - 1].trim())) return src
  return lines.slice(start + 1, end - 1).join('\n')
}

// True when the first real line (past `---` frontmatter and `%%` directives)
// starts with a Mermaid keyword.
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
