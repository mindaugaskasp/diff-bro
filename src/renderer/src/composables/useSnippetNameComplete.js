import { computed } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { indexableNames } from '../utils/nameComplete'
import { useNameComplete } from './useNameComplete'

// The store binding, kept apart so useNameComplete stays Pinia-free and
// unit-tests without a mount. Both windows own an instance of the same store,
// so neither surface needs the index passed down as a prop.

/**
 * @param {{ value: string }} name the field's bound value
 * @param {{ value: boolean }} [readonly]
 * @returns {object} the same shape as useNameComplete
 */
export function useSnippetNameComplete(name, readonly) {
  const snippets = useSnippetStore()
  const names = computed(() => indexableNames(snippets.entries))
  return useNameComplete({ name, names, readonly })
}
