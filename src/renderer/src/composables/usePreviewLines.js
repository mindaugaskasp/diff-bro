import { computed, ref } from 'vue'
import { miniSpans } from '../utils/miniHighlight'

// The active-line concern for the snippet preview, pulled out of useQuickLook so
// the index math (↑/↓ stepping, hover → index, single-line copy) unit-tests on
// its own. `onCopied(name)` hands the confirmation back to the launcher's copy
// feedback; the line never leaves the machine (main-process window.api.copyText).
/**
 * @param {object} o
 * @param {{ value: string }} o.snippetText          the (truncated) preview text
 * @param {{ value: 'list'|'preview' }} o.zone       highlight shows only in the preview zone
 * @param {{ value: HTMLElement|null }} o.previewEl   scroll container (line divs are its children)
 * @param {{ value: { kind: string }|null }} o.current  the selected result
 * @param {(name: string) => void} o.onCopied
 */
export function usePreviewLines({ snippetText, zone, previewEl, current, onCopied }) {
  const previewLine = ref(0)
  const snippetLines = computed(() => snippetText.value.split('\n'))
  // Coloured runs per line, for the template to paint. The launcher carries no
  // Monaco (see utils/miniHighlight), and a secret is masked rather than
  // decrypted — there is nothing there to tokenize either way.
  const snippetSpans = computed(() =>
    snippetLines.value.map((line) => miniSpans(line, current.value?.lang ?? ''))
  )
  const reset = () => (previewLine.value = 0)

  // ↑/↓ step the highlighted line and keep it in view (a long snippet scrolls as
  // the line advances). Scroll the container by the exact overflow — scrollIntoView
  // under-scrolls at the bottom because smooth-scroll lag makes 'nearest' read a
  // mid-animation position as already-visible.
  function movePreview(dir) {
    const last = snippetLines.value.length - 1
    previewLine.value = Math.max(0, Math.min(previewLine.value + dir, last))
    const el = previewEl.value
    const line = el?.children?.[previewLine.value]
    if (!el || typeof line?.getBoundingClientRect !== 'function') return
    const lr = line.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    if (lr.bottom > er.bottom) el.scrollTop += lr.bottom - er.bottom
    else if (lr.top < er.top) el.scrollTop -= er.top - lr.top
  }

  const isHot = (i) => zone.value === 'preview' && i === previewLine.value
  const lineClass = (i) => ['ql-pv-line', { hot: isHot(i) }]

  // Hover picks the copy target by delegation, so each line div stays a single
  // element (well under the template's per-line width budget).
  function hoverLine(e) {
    const line = e.target?.closest?.('.ql-pv-line')
    if (line) previewLine.value = [...line.parentElement.children].indexOf(line)
  }

  async function copyLine() {
    if (current.value?.kind !== 'snippet') return
    const line = snippetLines.value[previewLine.value]
    if (line == null) return
    const res = await window.api.copyText(line)
    if (res?.ok) onCopied(`line ${previewLine.value + 1}`)
  }

  return {
    previewLine,
    snippetLines,
    snippetSpans,
    reset,
    movePreview,
    lineClass,
    hoverLine,
    copyLine
  }
}
