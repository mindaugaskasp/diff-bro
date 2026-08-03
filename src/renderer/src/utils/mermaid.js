// securityLevel MUST stay 'strict' — DOMPurify at that level stops a diagram
// from smuggling script into the SVG. Shared by the renderer and the model
// extractor so the two can never disagree about how source is parsed.
export const MERMAID_BASE_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  // Errors surface as a thrown error, not Mermaid's own bomb SVG in the document.
  suppressErrorRendering: true,
  // Pure-SVG labels — safe to insert without innerHTML.
  flowchart: { htmlLabels: false }
}

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

// What a copy/paste does to a diagram — never its grammar. Every rule maps a
// character back to the one that replaced it, which is why they are safe to run
// unasked-for on someone's text; a diagram that was simply wrong stays wrong.
const ZERO_WIDTH = /[\u200b-\u200d\ufeff]/g
const ODD_SPACE = /[\u00a0\u2002-\u200a\u202f]/g
// Only arrow-SHAPED dashes. An em dash inside a label is the author's writing;
// `—>` never is.
const DASH_ARROW = /[\u2014\u2013](?=>)/g
const DASH_ARROW_BACK = /(?<=<)[\u2014\u2013]/g

/**
 * Undo the damage rich-text tooling does to pasted Mermaid.
 * @param {unknown} text
 * @returns {string}
 */
export function repairMermaid(text) {
  const src = String(text ?? '')
    .replace(ZERO_WIDTH, '')
    .replace(/\r\n?/g, '\n')
  return stripMermaidFence(src)
    .replace(ODD_SPACE, ' ')
    .replace(DASH_ARROW, '--')
    .replace(DASH_ARROW_BACK, '--')
    .replace(/\u2192/g, '-->')
    .replace(/\u2190/g, '<--')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[ \t]+$/gm, '')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/(?:\n[ \t]*)+$/, '')
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

// The one-of-N choice behind settings.diagramTheme, shared by both controls.
export const DIAGRAM_THEME_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

/** @param {unknown} value @returns {boolean} */
export const isDiagramTheme = (value) => DIAGRAM_THEME_OPTIONS.some((o) => o.value === value)

/**
 * Which of Mermaid's two themes a resolved mode renders in.
 * @param {'light'|'dark'} mode
 * @returns {'default'|'dark'}
 */
export function mermaidThemeFor(mode) {
  return mode === 'dark' ? 'dark' : 'default'
}

/**
 * The mode a diagram actually renders in. `auto` pairs it to the app's ground so
 * diagram text never blends into the canvas; light/dark override that.
 * @param {string} appTheme
 * @param {'auto'|'light'|'dark'} [pref]
 * @returns {'light'|'dark'}
 */
export function effectiveDiagramMode(appTheme, pref) {
  if (pref === 'light' || pref === 'dark') return pref
  return isDarkTheme(appTheme) ? 'dark' : 'light'
}

/**
 * The ground an overridden diagram has to bring with it, or '' to keep the app
 * surface. Mermaid's themes are drawn for their own ground, so a light diagram
 * left on a dark --bg is dark text on a dark wall.
 * @param {string} appTheme
 * @param {'auto'|'light'|'dark'} [pref]
 * @returns {''|'light'|'dark'}
 */
export function diagramPaperFor(appTheme, pref) {
  const mode = effectiveDiagramMode(appTheme, pref)
  return mode === effectiveDiagramMode(appTheme, 'auto') ? '' : mode
}

// Per-render DOM id. Mermaid needs a unique, CSS-selector-safe id for the
// temporary node it measures against; a monotonic counter keeps them distinct
// within a session.
let seq = 0
export function nextDiagramId() {
  seq += 1
  return `mermaid-${seq}`
}
