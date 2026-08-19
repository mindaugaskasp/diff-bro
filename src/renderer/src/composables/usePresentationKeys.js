import { onBeforeUnmount, onMounted } from 'vue'
import { useUiStore } from '../stores/uiStore'

// Escape out of presentation mode — the only exit, since presentation hides the
// chrome that would offer one. Two owners claim it first: a dialog over the
// presentation, and Monaco's find widget.
const claimedElsewhere = (event) =>
  !!document.querySelector('.dialog-backdrop') || !!event.target?.closest?.('.monaco-editor')

/**
 * @param {KeyboardEvent} event
 * @param {{ presenting: { value: boolean }, exit: () => void }} o
 */
export function presentationKeydown(event, { presenting, exit }) {
  if (!presenting.value || event.key !== 'Escape') return
  if (claimedElsewhere(event)) return
  event.preventDefault()
  exit()
}

export function usePresentationKeys() {
  const ui = useUiStore()
  const onKeydown = (event) =>
    presentationKeydown(event, {
      presenting: {
        get value() {
          return ui.presenting
        }
      },
      exit: () => ui.exitPresenting()
    })
  // Capture: Monaco and the dialogs stop propagation on keys they handle.
  onMounted(() => window.addEventListener('keydown', onKeydown, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
}
