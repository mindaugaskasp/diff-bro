import { computed } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { indexableNames } from '../utils/nameComplete'
import { useNameComplete } from './useNameComplete'

// The store binding for name completion. useNameComplete stays free of Pinia so
// it unit-tests without a mount; this is the one line that names the source.
// Both windows have their own instance of the same store, so neither surface
// needs the index threaded down to it as a prop.

/**
 * @param {{ value: string }} name the field's bound value
 * @returns {object} the same shape as useNameComplete
 */
export function useSnippetNameComplete(name) {
  const snippets = useSnippetStore()
  return useNameComplete({ name, names: computed(() => indexableNames(snippets.entries)) })
}
