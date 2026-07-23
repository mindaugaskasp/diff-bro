import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { diffWorkbooks } from '../utils/spreadsheetDiff'

// Binds the two loaded spreadsheet comparables to a per-sheet diff and tracks
// which sheet tab is active. Kept out of the .vue so the selection/clamping
// logic is unit-testable (see tests/renderer/composables/).
export function useSpreadsheetDiff() {
  const store = useDiffStore()
  const active = ref(0)

  const sheets = computed(() =>
    diffWorkbooks(store.leftComparable?.sheets ?? [], store.rightComparable?.sheets ?? [])
  )

  // Clamp rather than reset: if the active index falls out of range (sheet count
  // shrank), fall back to the last sheet instead of throwing.
  const activeSheet = computed(() => {
    if (!sheets.value.length) return null
    return sheets.value[Math.min(active.value, sheets.value.length - 1)]
  })

  const totals = computed(() =>
    sheets.value.reduce(
      (t, s) => ({
        changed: t.changed + s.stats.changed,
        added: t.added + s.stats.added,
        removed: t.removed + s.stats.removed
      }),
      { changed: 0, added: 0, removed: 0 }
    )
  )

  const identical = computed(
    () => totals.value.changed === 0 && totals.value.added === 0 && totals.value.removed === 0
  )

  function select(index) {
    if (index >= 0 && index < sheets.value.length) active.value = index
  }

  return { sheets, active, activeSheet, totals, identical, select }
}
