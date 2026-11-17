import { onBeforeUnmount, ref } from 'vue'

export const COPIED_MS = 2000

export function useCopiedFlag() {
  const copied = ref(false)
  let timer = null
  const markCopied = () => {
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), COPIED_MS)
  }
  onBeforeUnmount(() => clearTimeout(timer))
  return { copied, markCopied }
}
