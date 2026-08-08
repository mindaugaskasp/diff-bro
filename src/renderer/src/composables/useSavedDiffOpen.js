import { useTabsStore } from '../stores/tabsStore'
import { useVaultStore } from '../stores/vaultStore'

// Opening a SAVED diff by id — one path for the row click and for a row dropped
// into the comparison column, so the two cannot drift. Its own module because
// tabsStore is at its file cap and this needs nothing of its state.

/**
 * @param {string} entryId
 * @returns {Promise<boolean>} false when it is gone or could not be decrypted
 */
export async function openSavedDiff(entryId) {
  const vault = useVaultStore()
  const entry = vault.entries.find((e) => e.id === entryId)
  if (!entry) return false
  const payload = await vault.load(entryId)
  if (!payload) return false
  // Keyed by the vault id, so opening it twice focuses the tab already there
  // rather than stacking a duplicate.
  useTabsStore().open(payload, { diffSaved: true, entryId, name: entry.name })
  return true
}
