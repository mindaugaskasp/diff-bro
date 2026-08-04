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
// Scroll the container by the exact overflow — scrollIntoView under-scrolls at
// the bottom, because smooth-scroll lag makes 'nearest' read a mid-animation
// position as already-visible.
function keepInView(el, index) {
  const line = el?.children?.[index]
  if (!el || typeof line?.getBoundingClientRect !== 'function') return
  const lr = line.getBoundingClientRect()
  const er = el.getBoundingClientRect()
  if (lr.bottom > er.bottom) el.scrollTop += lr.bottom - er.bottom
  else if (lr.top < er.top) el.scrollTop -= er.top - lr.top
}

// The inclusive span the cursor covers — one line, or back to the Shift anchor
// whichever way it was dragged — and how each line paints. `cursor` is the line
// the arrows move; `hot` is everything selected, so a range reads as one block
// with a head.
function useLineRange({ previewLine, anchor, zone }) {
  const range = computed(() => {
    const from = anchor.value ?? previewLine.value
    return { start: Math.min(from, previewLine.value), end: Math.max(from, previewLine.value) }
  })
  const lineClass = (i) => [
    'ql-pv-line',
    {
      hot: zone.value === 'preview' && i >= range.value.start && i <= range.value.end,
      cursor: zone.value === 'preview' && i === previewLine.value
    }
  ]
  return { range, lineClass }
}

// Copies the RANGE, which is one line until Shift+Arrow grows it. The text
// never leaves the machine — window.api.copyText is the main-process clipboard.
async function copyRange({ current, snippetLines, range, onCopied }) {
  if (current.value?.kind !== 'snippet') return
  const { start, end } = range.value
  const lines = snippetLines.value.slice(start, end + 1)
  if (!lines.length) return
  const res = await window.api.copyText(lines.join('\n'))
  if (res?.ok) onCopied(start === end ? `line ${start + 1}` : `lines ${start + 1}–${end + 1}`)
}

export function usePreviewLines({ snippetText, zone, previewEl, current, onCopied }) {
  const previewLine = ref(0)
  // Where a Shift+Arrow range started. null means the cursor is a single line,
  // which is also what a plain arrow collapses it back to.
  const anchor = ref(null)
  const snippetLines = computed(() => snippetText.value.split('\n'))
  // Coloured runs per line, for the template to paint. The launcher carries no
  // Monaco (see utils/miniHighlight), and a secret is masked rather than
  // decrypted — there is nothing there to tokenize either way.
  const snippetSpans = computed(() =>
    snippetLines.value.map((line) => miniSpans(line, current.value?.lang ?? ''))
  )
  const reset = () => {
    previewLine.value = 0
    anchor.value = null
  }

  const { range, lineClass } = useLineRange({ previewLine, anchor, zone })

  /**
   * ↑/↓ step the line; Shift keeps the anchor so the step grows a range.
   * @param {1|-1} dir
   * @param {boolean} [extend]
   */
  function movePreview(dir, extend = false) {
    if (!extend) anchor.value = null
    else if (anchor.value === null) anchor.value = previewLine.value
    const last = snippetLines.value.length - 1
    previewLine.value = Math.max(0, Math.min(previewLine.value + dir, last))
    keepInView(previewEl.value, previewLine.value)
  }

  // Hover picks the copy target by delegation, so each line div stays a single
  // element (well under the template's per-line width budget).
  // A Shift+Arrow range is a deliberate selection, so incidental mouse movement
  // must not move or destroy it — that is what editors do, and wiping it on
  // hover made the selection vanish the moment the pointer drifted.
  // A plain arrow or a click collapses it; the mouse alone does not.
  function hoverLine(e) {
    if (anchor.value !== null) return
    const line = e.target?.closest?.('.ql-pv-line')
    if (line) previewLine.value = [...line.parentElement.children].indexOf(line)
  }

  return {
    previewLine,
    anchor,
    range,
    snippetLines,
    snippetSpans,
    reset,
    movePreview,
    lineClass,
    hoverLine,
    copyLine: () => copyRange({ current, snippetLines, range, onCopied })
  }
}
