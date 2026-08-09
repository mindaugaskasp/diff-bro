import { ref } from 'vue'

// The history dialog's selected diff pair. Each selection awaits two decrypts,
// so a slow load can land AFTER a newer click — and pair.after is what "Copy
// this version" serves. Only the latest selection may assign the pair.
/**
 * @param {(index: number) => Promise<string>} textAt  decrypt one version; -1 is current
 */
export function useVersionPair(textAt) {
  const selected = ref(-1)
  const pair = ref({ before: '', after: '' })

  async function select(index, prevIndex) {
    selected.value = index
    const next = {
      before: prevIndex < 0 ? '' : await textAt(prevIndex),
      after: await textAt(index)
    }
    if (selected.value === index) pair.value = next
  }

  return { selected, pair, select }
}
