import { ref } from 'vue'
import { useTabsStore } from '../stores/tabsStore'
import { isSnippetTab } from '../utils/tabs'

const version = ref(null)
const blocked = ref(false)

export function listenForAppUpdate() {
  window.api?.onAppUpdated?.((next) => {
    version.value = next
    blocked.value = false
  })
}

/**
 * A newer build replaced the bundle under this process (`brew upgrade`).
 * @returns {{ version: import('vue').Ref<string|null>, blocked: import('vue').Ref<boolean>,
 *            restart: () => Promise<void>, dismiss: () => void }}
 */
export function useAppUpdated() {
  const tabs = useTabsStore()

  // Snippet drafts are not part of the sealed session, so a relaunch would drop them.
  async function restart() {
    const draft = tabs.tabs.find((tab) => isSnippetTab(tab) && tabs.unsaved(tab))
    if (draft) {
      tabs.activate(draft.id)
      blocked.value = true
      return
    }
    await tabs.saveSession()
    await window.api.relaunch()
  }

  function dismiss() {
    version.value = null
    blocked.value = false
  }

  return { version, blocked, restart, dismiss }
}
