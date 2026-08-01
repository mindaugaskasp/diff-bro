import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useVaultStore, DEFAULT_TTL_HOURS } from '../stores/vaultStore'
import { useTabsStore } from '../stores/tabsStore'

// Where a save lands. A tab and the diff it was opened from are the same
// comparison (renaming the tab already renames the diff), so an edited one is
// rewritten rather than stacked beside its original.

/**
 * @typedef {object} SaveDraft
 * @property {string} name
 * @property {number|null} ttlHours  null keeps the diff until it is deleted
 * @property {object} snapshot
 * @property {string[]} tags
 */

export function useSaveDiffTarget() {
  const diff = useDiffStore()
  const vault = useVaultStore()
  const tabs = useTabsStore()

  // A diff someone else signed is theirs — editing it makes one of your own.
  const entry = computed(() => {
    const id = tabs.active?.entryId
    if (!id) return null
    return vault.entries.find((e) => e.id === id && !e.from) ?? null
  })
  const isUpdate = computed(() => !!entry.value)

  const derivedName = () =>
    diff.mode === 'paste'
      ? `Pasted text (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
      : `${diff.left?.name ?? '?'} ↔ ${diff.right?.name ?? '?'}`

  /**
   * What the dialog opens on. An update offers the diff's own name, tags and
   * expiry back, so re-saving never silently resets a kept diff to an hour.
   * @returns {{ name: string, secure: boolean, ttl: number, tags: string[] }}
   */
  const initial = () => {
    const e = entry.value
    if (e) {
      return {
        name: e.name,
        secure: e.expiresAt !== null,
        ttl: DEFAULT_TTL_HOURS,
        tags: [...(e.tags ?? [])]
      }
    }
    return {
      name: tabs.active?.customTitle || derivedName(),
      secure: true,
      ttl: DEFAULT_TTL_HOURS,
      tags: []
    }
  }

  /**
   * @param {SaveDraft} draft
   * @returns {Promise<string|null>} the entry id, or null when nothing was written
   */
  const commit = ({ name, ttlHours, snapshot, tags = [] }) =>
    entry.value
      ? vault.update(entry.value.id, { name, ttlHours, payload: snapshot, tags })
      : vault.save(name, ttlHours, snapshot, tags)

  return { entry, isUpdate, initial, commit }
}
