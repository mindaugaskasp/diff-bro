import { ref, watch } from 'vue'

// Renderer memory only: a tool closed by a stray click keeps its input until relaunch.
const drafts = new Map()

/** @param {string} key  tool id plus field, e.g. `json.input` */
export function useToolDraft(key) {
  const value = ref(drafts.get(key) ?? '')
  watch(value, (text) => drafts.set(key, text))
  return value
}

export const clearToolDrafts = () => drafts.clear()
