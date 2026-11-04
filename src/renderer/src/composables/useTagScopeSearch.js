import { computed, ref, watch } from 'vue'
import { scopeOptions } from '../utils/tagTree'

/**
 * The sidebar search's tag scopes (#121): listed while the query starts with #,
 * or while the focused box has no scope yet. Picking one turns it into a chip
 * that keeps everything nested under it.
 * @param {{ query: import('vue').Ref<string>, scope: import('vue').Ref<string>,
 *   tags: () => string[] }} o
 */
export function useTagScopeSearch({ query, scope, tags }) {
  const hashMode = computed(() => query.value.startsWith('#'))
  const listOpen = ref(false)
  const typed = computed(() => {
    if (hashMode.value) return query.value.slice(1)
    return listOpen.value && !scope.value ? query.value : null
  })
  const options = computed(() => (typed.value === null ? [] : scopeOptions(tags(), typed.value)))
  const openList = () => (listOpen.value = true)
  const closeList = () => (listOpen.value = false)
  const cursor = ref(0)
  watch(options, () => (cursor.value = 0))

  function pick(path) {
    scope.value = path
    query.value = ''
    closeList()
  }
  const startHash = () => (query.value = '#')

  const KEYS = {
    ArrowDown: () => (cursor.value = Math.min(cursor.value + 1, options.value.length - 1)),
    ArrowUp: () => (cursor.value = Math.max(cursor.value - 1, 0)),
    Enter: () => options.value[cursor.value] && pick(options.value[cursor.value]),
    Escape: () => (hashMode.value ? (query.value = '') : closeList())
  }
  function onKeydown(e) {
    if ((hashMode.value || options.value.length) && KEYS[e.key]) {
      e.preventDefault()
      return KEYS[e.key]()
    }
    if (e.key === 'Backspace' && !query.value && scope.value) {
      e.preventDefault()
      scope.value = ''
    }
  }
  return { options, cursor, pick, startHash, openList, closeList, onKeydown }
}
