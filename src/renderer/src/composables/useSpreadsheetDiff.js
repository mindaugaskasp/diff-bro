import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { diffWorkbooks } from '../utils/spreadsheetDiff'

// An absolute floor kills float-rounding noise; a percentage is what
// materiality means. Neither covers the other, so both are offered.
export const TOLERANCES = [
  { value: 'exact', label: 'Exact', tolerance: null },
  { value: 'abs', label: '±0.01', tolerance: { abs: 0.01 } },
  { value: 'half', label: '±0.5%', tolerance: { pct: 0.5 } },
  { value: 'one', label: '±1%', tolerance: { pct: 1 } },
  // The threshold the engagement set, which is never one of four numbers.
  { value: 'custom', label: 'Custom', tolerance: null }
]

// Explicit, never sniffed from the text: "50" meaning half a percent or fifty
// pounds is not something to guess at.
export const TOLERANCE_UNITS = [
  { value: 'pct', label: '%' },
  { value: 'abs', label: 'abs' }
]

// Per-sheet diff of the two loaded spreadsheets + the active tab.
export function useSpreadsheetDiff() {
  const store = useDiffStore()
  const active = ref(0)

  const showFormulas = ref(false)
  const toleranceId = ref('exact')
  const customValue = ref('')
  const customUnit = ref('pct')
  // Empty, unparseable or non-positive reads as Exact: a zero threshold forgives
  // nothing while claiming a tolerance is set.
  const customTolerance = computed(() => {
    const n = Number(String(customValue.value).trim())
    if (!Number.isFinite(n) || n <= 0) return null
    return customUnit.value === 'abs' ? { abs: n } : { pct: n }
  })
  const tolerance = computed(() =>
    toleranceId.value === 'custom'
      ? customTolerance.value
      : (TOLERANCES.find((t) => t.value === toleranceId.value)?.tolerance ?? null)
  )

  const sheets = computed(() =>
    diffWorkbooks(store.gridSheets.left, store.gridSheets.right, { tolerance: tolerance.value })
  )

  // Clamp to the last sheet if the active index falls out of range.
  const activeSheet = computed(() => {
    if (!sheets.value.length) return null
    return sheets.value[Math.min(active.value, sheets.value.length - 1)]
  })

  const totals = computed(() =>
    sheets.value.reduce(
      (t, s) => ({
        changed: t.changed + s.stats.changed,
        added: t.added + s.stats.added,
        removed: t.removed + s.stats.removed,
        columns: t.columns + s.columnsAdded + s.columnsRemoved
      }),
      { changed: 0, added: 0, removed: 0, columns: 0 }
    )
  )

  const identical = computed(
    () =>
      totals.value.changed === 0 &&
      totals.value.added === 0 &&
      totals.value.removed === 0 &&
      totals.value.columns === 0
  )

  function select(index) {
    if (index >= 0 && index < sheets.value.length) active.value = index
  }

  // Only worth offering where a formula exists to show.
  const hasFormulas = computed(() => sheets.value.some((s) => s.hasFormulas))

  return {
    sheets,
    active,
    activeSheet,
    totals,
    identical,
    select,
    showFormulas,
    hasFormulas,
    toleranceId,
    customValue,
    customUnit,
    tolerance
  }
}
