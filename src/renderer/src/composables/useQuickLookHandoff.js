import { ref } from 'vue'
import { useCopyFeedback } from './useCopyFeedback'

// "Take it and get out of the way" — the launcher's whole reason to exist. The
// copy and the dismissal are one concern because every copy ends in one: the
// card fades (the window is transparent) before the OS hide, so it vanishes
// smoothly instead of blinking out.

const CLOSE_ANIM_MS = 160
const HIDE_AFTER_COPY_MS = 900

/**
 * @param {object} o
 * @param {{ load: (id: string) => Promise<string|null> }} o.snippets  the snippet store
 * @param {{ value: object[] }} o.results  the launcher's rows
 * @returns {object}
 */
export function useQuickLookHandoff({ snippets, results }) {
  const closing = ref(false)
  const { copied, flash } = useCopyFeedback()
  // The just-copied snippet's name + its row index, so the confirmation names
  // what was taken and the "Copied" cue can animate on that exact row.
  const copiedName = ref('')
  const copiedIndex = ref(-1)

  function animateOut() {
    if (closing.value) return
    closing.value = true
    setTimeout(() => {
      window.api.quickLookHide()
      closing.value = false
    }, CLOSE_ANIM_MS)
  }

  function confirm(name, index) {
    copiedName.value = name
    copiedIndex.value = index
    flash()
    setTimeout(animateOut, HIDE_AFTER_COPY_MS)
  }

  // Full contents (the preview is truncated), via the main process —
  // navigator.clipboard is blocked by the deny-all permission handler.
  async function copy(i) {
    const it = results.value[i]
    if (it?.kind !== 'snippet') return
    const text = await snippets.load(it.id)
    if (typeof text !== 'string') return
    const res = await window.api.copyText(text)
    if (!res?.ok) return
    confirm(it.name, i)
  }

  function reset() {
    copiedName.value = ''
    copiedIndex.value = -1
    closing.value = false
  }

  // A preview-line copy names the range instead of the snippet, so it has no row.
  const confirmLine = (name) => confirm(name, -1)

  return { closing, copied, copiedName, copiedIndex, copy, confirmLine, animateOut, reset }
}
