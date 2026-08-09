import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useSpreadsheetDiff } from '../../../src/renderer/src/composables/useSpreadsheetDiff'

const book = (sheets) => ({ name: 'book.xlsx', kind: 'spreadsheet', sheets })

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

describe('useSpreadsheetDiff', () => {
  it('diffs the two loaded workbooks into per-sheet results', () => {
    const store = useDiffStore()
    store.left = book([{ name: 'S', rows: [['a', 1]] }])
    store.right = book([{ name: 'S', rows: [['a', 2]] }])
    const { sheets, totals, identical } = useSpreadsheetDiff()
    expect(sheets.value).toHaveLength(1)
    expect(totals.value).toEqual({ changed: 1, added: 0, removed: 0, columns: 0 })
    expect(identical.value).toBe(false)
  })

  it('reports identical when nothing differs', () => {
    const store = useDiffStore()
    const sheetsData = [{ name: 'S', rows: [['a', 1]] }]
    store.left = book(sheetsData)
    store.right = book(sheetsData)
    expect(useSpreadsheetDiff().identical.value).toBe(true)
  })

  it('select changes the active sheet and ignores out-of-range indices', () => {
    const store = useDiffStore()
    const two = [
      { name: 'One', rows: [['a']] },
      { name: 'Two', rows: [['b']] }
    ]
    store.left = book(two)
    store.right = book(two)
    const { active, activeSheet, select } = useSpreadsheetDiff()
    expect(activeSheet.value.name).toBe('One')
    select(1)
    expect(activeSheet.value.name).toBe('Two')
    select(5) // out of range — ignored
    expect(active.value).toBe(1)
  })

  it('clamps the active sheet when the sheet count shrinks', () => {
    const store = useDiffStore()
    store.left = book([
      { name: 'One', rows: [['a']] },
      { name: 'Two', rows: [['b']] }
    ])
    store.right = store.left
    const { active, activeSheet } = useSpreadsheetDiff()
    active.value = 1
    // Now only one sheet on each side: the clamp keeps activeSheet valid.
    store.left = book([{ name: 'One', rows: [['a']] }])
    store.right = book([{ name: 'One', rows: [['a']] }])
    expect(activeSheet.value.name).toBe('One')
  })
})

// A materiality threshold belongs to the engagement, not to a preset list: ±2%
// and ±50 are as ordinary as ±1%, and neither was reachable.
describe('a tolerance of your own', () => {
  it('reads the typed value as a percentage or a raw amount, by the switch', () => {
    const { toleranceId, customValue, customUnit, tolerance } = useSpreadsheetDiff()
    toleranceId.value = 'custom'

    customValue.value = '2.5'
    customUnit.value = 'pct'
    expect(tolerance.value).toEqual({ pct: 2.5 })

    customUnit.value = 'abs'
    expect(tolerance.value).toEqual({ abs: 2.5 })
  })

  // A zero threshold forgives nothing while claiming a tolerance is set, so an
  // empty or nonsense field has to read as the honest thing: Exact.
  it('falls back to exact rather than to a threshold that forgives nothing', () => {
    const { toleranceId, customValue, customUnit, tolerance } = useSpreadsheetDiff()
    toleranceId.value = 'custom'
    customUnit.value = 'pct'

    for (const bad of ['', '   ', 'abc', '0', '-4']) {
      customValue.value = bad
      expect(tolerance.value, `"${bad}" should read as exact`).toBeNull()
    }
  })

  it('leaves the presets alone', () => {
    const { toleranceId, customValue, tolerance } = useSpreadsheetDiff()
    customValue.value = '99'
    toleranceId.value = 'one'
    expect(tolerance.value).toEqual({ pct: 1 })
    toleranceId.value = 'exact'
    expect(tolerance.value).toBeNull()
  })
})

describe('useSpreadsheetDiff — key columns', () => {
  const ledger = (rows) => [{ name: 'Ledger', rows }]
  const header = ['Account', 'Centre', 'Amount']
  const left = ledger([header, ['1001', 'EMEA', 500], ['1002', 'APAC', 300]])
  const right = ledger([header, ['1002', 'APAC', 300], ['1001', 'EMEA', 500]])

  const loaded = () => {
    const store = useDiffStore()
    store.left = book(left)
    store.right = book(right)
    return useSpreadsheetDiff()
  }

  it('reads a re-sorted sheet as changed until a key column is named', () => {
    const diff = loaded()
    expect(diff.identical.value).toBe(false)
    diff.toggleKeyColumn(0)
    expect(diff.activeKeyColumns.value).toEqual([0])
    expect(diff.identical.value).toBe(true)
  })

  it('toggles a column back off and returns to Auto', () => {
    const diff = loaded()
    diff.toggleKeyColumn(0)
    diff.toggleKeyColumn(0)
    expect(diff.activeKeyColumns.value).toEqual([])
    expect(diff.identical.value).toBe(false)
  })

  it('keeps the columns in ascending order however they were picked', () => {
    const diff = loaded()
    diff.toggleKeyColumn(1)
    diff.toggleKeyColumn(0)
    expect(diff.activeKeyColumns.value).toEqual([0, 1])
  })

  it('holds a choice per sheet', () => {
    const store = useDiffStore()
    const rows = [header, ['1001', 'EMEA', 500]]
    store.left = book([
      { name: 'Ledger', rows },
      { name: 'Other', rows }
    ])
    store.right = book([
      { name: 'Ledger', rows },
      { name: 'Other', rows }
    ])
    const diff = useSpreadsheetDiff()
    diff.toggleKeyColumn(0)
    diff.select(1)
    expect(diff.activeKeyColumns.value).toEqual([])
    diff.select(0)
    expect(diff.activeKeyColumns.value).toEqual([0])
  })

  it('clears the active sheet’s keys', () => {
    const diff = loaded()
    diff.toggleKeyColumn(0)
    diff.clearKeyColumns()
    expect(diff.activeKeyColumns.value).toEqual([])
  })

  // Two workbooks routinely share a sheet name, so a key held by name would
  // otherwise carry silently into the next comparison.
  it('starts a new pair of files on Auto', async () => {
    const store = useDiffStore()
    const diff = loaded()
    diff.toggleKeyColumn(0)
    store.left = book(ledger([header, ['9001', 'EMEA', 1]]))
    await Promise.resolve()
    expect(diff.activeKeyColumns.value).toEqual([])
  })

  it('reports the duplicate keys the choice leaves ambiguous', () => {
    const store = useDiffStore()
    const rows = [header, ['1001', 'EMEA', 500], ['1001', 'APAC', 300]]
    store.left = book([{ name: 'Ledger', rows }])
    store.right = book([{ name: 'Ledger', rows }])
    const diff = useSpreadsheetDiff()
    diff.toggleKeyColumn(0)
    expect(diff.activeSheet.value.duplicateKeys).toBe(1)
    diff.toggleKeyColumn(1)
    expect(diff.activeSheet.value.duplicateKeys).toBe(0)
  })
})
