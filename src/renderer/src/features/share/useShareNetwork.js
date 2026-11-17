import { computed, ref, watch } from 'vue'
import { useLanStore } from '../lan'

export function useShareNetwork(picker, isSnippet) {
  const lan = useLanStore()
  const dropped = ref(false)
  const network = computed(() => lan.enabled || isSnippet())
  const reachable = computed(() => (network.value ? lan.reachable : null))
  let opened = false
  watch(
    reachable,
    (set) => {
      const offline = set ? picker.selected.value.filter((fp) => !set.has(fp)) : []
      offline.forEach((fp) => picker.toggle(fp))
      if (opened && offline.length) dropped.value = true
      opened = true
    },
    { immediate: true }
  )
  watch(
    () => picker.selected.value.length,
    (n) => n && (dropped.value = false)
  )
  const networkNote = computed(() => {
    if (!network.value) return null
    if (!lan.online) return 'lan.share.noNetwork'
    return dropped.value && !picker.selected.value.length ? 'lan.share.dropped' : null
  })
  return { network, reachable, networkNote }
}
