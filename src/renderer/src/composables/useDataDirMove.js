import { useTabsStore } from '../stores/tabsStore'
import { useDiffStore } from '../stores/diffStore'
import { isSnippetTab } from '../utils/tabs'
import { t } from '../i18n'

/**
 * Settings ▸ Storage: move the data folder, then restart into it. Snippet drafts
 * are not part of the session, so one with unsaved edits blocks the move.
 * @returns {{ choose: () => Promise<void>, reset: () => Promise<void> }}
 */
export function useDataDirMove() {
  const tabs = useTabsStore()

  async function move(run) {
    const draft = tabs.tabs.find((tab) => isSnippetTab(tab) && tabs.unsaved(tab))
    if (draft) {
      tabs.activate(draft.id)
      useDiffStore().showNotice(t('appUpdatedNotice.saveSnippetFirst'))
      return
    }
    const res = await run()
    if (!res?.ok) return
    await tabs.saveSession()
    await window.api.relaunch()
  }

  return {
    choose: () => move(() => window.api.dataDirChoose()),
    reset: () => move(() => window.api.dataDirReset())
  }
}
