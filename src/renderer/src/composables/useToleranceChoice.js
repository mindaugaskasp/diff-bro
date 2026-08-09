import { computed, ref } from 'vue'

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

/** How close two numbers have to be to count as the same figure. */
export function useToleranceChoice() {
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

  return { toleranceId, customValue, customUnit, tolerance }
}
