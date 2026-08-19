import { nextTick, ref, watch } from 'vue'

// Which of the editor's two views is on screen. Both relayouts below are bugs
// that already happened: Monaco measures zero while hidden and comes back blank.

/**
 * @param {object} o
 * @param {import('vue').Ref<boolean>} o.editMode
 * @param {() => void} o.layout        Monaco's relayout
 * @param {() => void} o.toggleReveal  un-masks a secret snippet
 * @returns {{ plain: import('vue').Ref<boolean>, revealAndLayout: () => void }}
 */
export function useSnippetEditorView({ editMode, layout, toggleReveal }) {
  // A new Jira/Markdown snippet opens on the raw editor (it starts in edit
  // mode); viewing an existing one opens on the rendered view.
  const plain = ref(editMode.value)

  watch(plain, (isPlain) => {
    if (isPlain) nextTick(layout)
  })

  function revealAndLayout() {
    toggleReveal()
    nextTick(layout)
  }

  return { plain, revealAndLayout }
}
