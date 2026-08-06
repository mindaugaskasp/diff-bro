import { nextTick, onScopeDispose, watch } from 'vue'

// A marker that outlives the session becomes a second permanent row state, and
// the sidebar already has one of those (pinned).
export const NEW_ROW_TTL_MS = 60_000

/**
 * Reveal and retire the "just created" row for one sidebar section.
 *
 * `locate` is what keeps two sections from fighting over one id: the section
 * that would show the row unfiltered owns it, and every other section answers
 * `'elsewhere'` and does nothing at all.
 *
 * @param {import('../types').NewRowMarkerOptions} options
 */
export function useNewRowMarker({ markedId, locate, retire, onHidden, open }) {
  let timer = null
  const stop = () => {
    clearTimeout(timer)
    timer = null
  }

  watch(
    markedId,
    async (id) => {
      stop()
      if (!id) return
      const where = locate(id)
      if (where === 'elsewhere') return
      timer = setTimeout(retire, NEW_ROW_TTL_MS)
      // Excluded by a search or a tag: say so. Clearing the filter would be
      // undoing something the user asked for.
      if (where === 'filtered') return onHidden?.(id)
      open?.()
      await nextTick()
      document.querySelector(`[data-new-row="${id}"]`)?.scrollIntoView({ block: 'nearest' })
    },
    { flush: 'post' }
  )

  onScopeDispose(stop)
}
