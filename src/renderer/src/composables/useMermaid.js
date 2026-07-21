// Lazy access to the Mermaid library. Mermaid is ~2.8 MB, so it is dynamically
// imported the first time a diagram renders and never pulled into the main
// renderer chunk. It runs entirely offline under the app's strict CSP (no
// unsafe-eval) — verified against every diagram type before adoption.
//
// securityLevel MUST stay 'strict': Mermaid runs its output through DOMPurify
// at that level, so a diagram authored from imported/shared text can't smuggle
// script or event handlers into the SVG. Never lower it to 'loose'/'antiscript'.
import { mermaidThemeFor, nextDiagramId } from '../utils/mermaid'

const BASE_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  // Pure-SVG labels (no <foreignObject>/HTML), which render crisply and keep
  // the output trivially safe to insert without innerHTML.
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

// Render `code` to an SVG string, themed to match the app. Rejects with a
// Mermaid parse error (message shown to the user) when the syntax is invalid.
export async function renderMermaid(code, appTheme) {
  const mermaid = await loadMermaid()
  // Re-apply config each render so a theme flip takes effect (initialize is the
  // supported way to change the active theme).
  mermaid.initialize({ ...BASE_CONFIG, theme: mermaidThemeFor(appTheme) })
  const { svg } = await mermaid.render(nextDiagramId(), code)
  return svg
}
