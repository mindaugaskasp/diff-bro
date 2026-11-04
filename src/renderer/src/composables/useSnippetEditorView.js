import { nextTick, ref, watch } from 'vue'

// Which of the editor's two views is on screen. Both relayouts below are bugs
// that already happened: Monaco measures zero while hidden and comes back blank.

/**
 * @param {object} o
 * @param {() => void} o.layout        Monaco's relayout
 * @param {() => void} o.toggleReveal  un-masks a secret snippet
 * @returns {{ plain: import('vue').Ref<boolean>, revealAndLayout: () => void }}
 */
export function useSnippetEditorView({ layout, toggleReveal }) {
  const plain = ref(false)

  watch(plain, (isPlain) => {
    if (isPlain) nextTick(layout)
  })

  function revealAndLayout() {
    toggleReveal()
    nextTick(layout)
  }

  return { plain, revealAndLayout }
}
