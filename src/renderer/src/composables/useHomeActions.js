import { openSavedDiff } from './useSavedDiffOpen'
import { useCommands } from './useCommands'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { useVaultStore } from '../stores/vaultStore'
import { t } from '../i18n'

// Each item opens the way its own panel's row does, so the two cannot drift.
export function useHomeActions() {
  const { run } = useCommands()
  const snippets = useSnippetStore()
  const diff = useDiffStore()

  async function openItem(item) {
    if (item.kind === 'tool') return run(item.action)
    if (item.kind === 'snippet') {
      snippets.editingSnippet = { id: item.id }
      return
    }
    if (!(await openSavedDiff(item.id))) diff.showNotice(t('savedDiffRow.expiredOrUndecryptable'))
  }

  // The same confirm-first requests the panels' own rows make; tools are not deletable.
  function deleteItem(item) {
    if (item.kind === 'snippet') snippets.requestDelete('snippet', item.id, item.name)
    else if (item.kind === 'diff' || item.kind === 'received') {
      useVaultStore().requestDelete(item.id, item.name)
    }
  }

  return { openItem, deleteItem }
}
