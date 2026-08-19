import { watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useTabsStore } from '../stores/tabsStore'

// Long enough that typing in the paste panes doesn't seal a session per
// keystroke, short enough that quitting straight after an edit still keeps it.
const SAVE_DELAY = 500

/**
 * Keep the stored session in step with what is open. Writes are debounced and
 * driven by the fields packSession actually reads — a deep watcher would walk a
 * spreadsheet's whole grid every time a toast appeared.
 * @param {{ delay?: number }} [opts]
 * @returns {{ flush: () => Promise<void>, stop: () => void }}
 */
export function useSessionPersistence({ delay = SAVE_DELAY } = {}) {
  const tabs = useTabsStore()
  const diff = useDiffStore()
  let timer = null

  const flush = () => {
    clearTimeout(timer)
    timer = null
    return tabs.saveSession()
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(flush, delay)
  }

  // A tab's own snapshot is not watched: it only changes when tabs switch, and
  // activeId changes with it. The live document is what moves under us.
  const stopWatch = watch(
    () => [
      tabs.activeId,
      tabs.tabs.map((t) => `${t.id}\u0000${t.customTitle ?? ''}`).join('\u0001'),
      diff.mode,
      diff.left,
      diff.right,
      diff.pasteLeft,
      diff.pasteRight,
      diff.pasteLeftFile,
      diff.pasteRightFile,
      diff.pasteLeftName,
      diff.pasteRightName,
      diff.renderSideBySide,
      diff.ignoreTrimWhitespace,
      diff.semanticView,
      diff.diffSaved
    ],
    schedule
  )

  // Best effort on the way out: a write started here normally lands before the
  // process goes, and the debounce is short enough that little rides on it.
  const onUnload = () => {
    if (timer) flush()
  }
  window.addEventListener('beforeunload', onUnload)

  const stop = () => {
    clearTimeout(timer)
    stopWatch()
    window.removeEventListener('beforeunload', onUnload)
  }
  return { flush, stop }
}
