import { ref } from 'vue'

/**
 * Format replaces the whole content, so a saved snippet asks first.
 * @param {{ isSaved: import('vue').Ref<boolean>, run: () => void }} args
 */
export function useFormatConfirm({ isSaved, run }) {
  const asking = ref(false)
  function request() {
    if (isSaved.value) asking.value = true
    else run()
  }
  function confirm() {
    asking.value = false
    run()
  }
  const cancel = () => (asking.value = false)
  return { asking, request, confirm, cancel }
}
