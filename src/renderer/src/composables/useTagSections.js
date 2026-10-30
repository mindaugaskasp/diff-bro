import { ref, unref } from 'vue'
import { loadPersisted, savePersisted } from '../persist'

// Which tag sections are closed, per list (#121), so a tag that appears later starts open.
const KEY = 'tagSections'

function readAll() {
  try {
    const all = JSON.parse(loadPersisted(KEY) ?? '{}')
    return all && typeof all === 'object' ? all : {}
  } catch {
    return {}
  }
}

/**
 * @param {'snippets'|'diffs'} list
 * @param {import('vue').Ref<boolean>|boolean} [searching] opens every section
 *   while true, without changing what is remembered
 */
export function useTagSections(list, searching = false) {
  const closed = ref(new Set(readAll()[list] ?? []))

  function toggle(path) {
    const next = new Set(closed.value)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    closed.value = next
    savePersisted(KEY, JSON.stringify({ ...readAll(), [list]: [...next] }))
  }

  return {
    isOpen: (path) => !!unref(searching) || !closed.value.has(path),
    toggle
  }
}
