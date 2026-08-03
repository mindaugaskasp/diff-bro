// Keeps a comparison built from snippets honest while it is on screen: edit the
// snippet and the pane follows. A pasted copy is dead the moment the snippet
// moves on, and a comparison that silently disagrees with the library is worse
// than one that was never linked.

import { watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { snippetSource } from '../utils/snippetSource'

const SIDES = ['left', 'right']

export function useSnippetDiffSync() {
  const diff = useDiffStore()
  const snippets = useSnippetStore()

  // Keyed on the ciphertext, not on `updatedAt`: a timestamp has millisecond
  // granularity, so a snippet edited in the same millisecond it was created
  // leaves the key unchanged and the pane silently stale. The iv is fresh on
  // every re-encrypt, so it changes exactly when the content did. The name rides
  // along because it is the side's label.
  const stamps = () =>
    SIDES.map((side) => {
      const id = diff[side]?.snippetId
      if (!id) return ''
      const entry = snippets.entries.find((e) => e.id === id)
      // A deleted snippet leaves the comparison standing: the content is already
      // loaded and it is the reader's until they clear it.
      return entry ? `${id}:${entry.iv}:${entry.name}` : ''
    }).join('|')

  watch(stamps, async () => {
    for (const side of SIDES) {
      const id = diff[side]?.snippetId
      if (!id) continue
      const entry = snippets.entries.find((e) => e.id === id)
      if (!entry) continue
      const source = snippetSource(entry, await snippets.load(id))
      // receive() sets diffSaved = false, which is what makes an edit re-dirty a
      // comparison rather than leaving it claiming to match what was saved.
      if (source) diff.receive(side, source)
    }
  })
}
