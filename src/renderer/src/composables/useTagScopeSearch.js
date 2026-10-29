import { computed, ref, watch } from 'vue'
import { scopeOptions } from '../utils/tagTree'

/**
 * `#` in the sidebar search (#121): a leading # lists tag paths, and picking
 * one turns it into a scope chip that keeps everything nested under it.
 * @param {{ query: import('vue').Ref<string>, scope: import('vue').Ref<string>,
 *   tags: () => string[] }} o
 */
export function useTagScopeSearch({ query, scope, tags }) {
  const hashMode = computed(() => query.value.startsWith('#'))
  const options = computed(() => (hashMode.value ? scopeOptions(tags(), query.value.slice(1)) : []))
  const cursor = ref(0)
  watch(options, () => (cursor.value = 0))

  function pick(path) {
    scope.value = path
    query.value = ''
  }
  const startHash = () => (query.value = '#')

  const KEYS = {
    ArrowDown: () => (cursor.value = Math.min(cursor.value + 1, options.value.length - 1)),
    ArrowUp: () => (cursor.value = Math.max(cursor.value - 1, 0)),
    Enter: () => options.value[cursor.value] && pick(options.value[cursor.value]),
    Escape: () => (query.value = '')
  }
  function onKeydown(e) {
    if (hashMode.value && KEYS[e.key]) {
      e.preventDefault()
      return KEYS[e.key]()
    }
    if (e.key === 'Backspace' && !query.value && scope.value) {
      e.preventDefault()
      scope.value = ''
    }
  }
  return { options, cursor, pick, startHash, onKeydown }
}
