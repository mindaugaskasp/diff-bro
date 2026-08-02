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
