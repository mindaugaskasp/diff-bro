import { computed } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { indexableNames } from '../utils/nameComplete'
import { useNameComplete } from './useNameComplete'

// The store binding, kept apart so useNameComplete stays Pinia-free and
// unit-tests without a mount. Both windows own an instance of the same store,
// so neither surface needs the index passed down as a prop.

/**
 * @param {{ value: string }} name the field's bound value
 * @returns {object} the same shape as useNameComplete
 */
export function useSnippetNameComplete(name) {
  const snippets = useSnippetStore()
  return useNameComplete({ name, names: computed(() => indexableNames(snippets.entries)) })
}
