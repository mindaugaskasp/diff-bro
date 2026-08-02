// Mermaid (~2.8 MB) is dynamically imported on first render, never in the main
// chunk. securityLevel MUST stay 'strict' — DOMPurify at that level stops a
// diagram from smuggling script into the SVG. Never lower it.
import { mermaidThemeFor, nextDiagramId, stripMermaidFence } from '../utils/mermaid'

const BASE_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  // Errors surface as a thrown error, not Mermaid's own bomb SVG in the document.
  suppressErrorRendering: true,
  // Pure-SVG labels — safe to insert without innerHTML.
  flowchart: { htmlLabels: false }
}

let mermaidPromise = null
function loadMermaid() {
  mermaidPromise ??= import('mermaid').then((mod) => {
    const mermaid = mod.default
    mermaid.initialize(BASE_CONFIG)
    return mermaid
  })
  return mermaidPromise
}

// Render `code` to an SVG string; rejects with a Mermaid parse error on bad
// syntax. `mode` is the RESOLVED 'light' | 'dark', never the app theme.
export async function renderMermaid(code, mode) {
  const mermaid = await loadMermaid()
  // Re-apply config each render so a theme flip takes effect.
  mermaid.initialize({ ...BASE_CONFIG, theme: mermaidThemeFor(mode) })
  // A fixed, off-flow measurement holder — Mermaid's default <body> node briefly
  // stretched the document and flashed a scrollbar.
  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none'
  document.body.appendChild(holder)
  try {
    const { svg } = await mermaid.render(nextDiagramId(), stripMermaidFence(code).trim(), holder)
    return svg
  } finally {
    holder.remove()
  }
}
