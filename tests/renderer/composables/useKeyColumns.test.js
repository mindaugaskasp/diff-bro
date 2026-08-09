import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useKeyColumns } from '../../../src/renderer/src/composables/useKeyColumns'

describe('useKeyColumns', () => {
  it('holds a choice per sheet name', () => {
    const name = ref('Ledger')
    const keys = useKeyColumns(() => name.value)
    keys.toggleKeyColumn(0)
    keys.toggleKeyColumn(2)
    expect(keys.activeKeyColumns.value).toEqual([0, 2])
    name.value = 'Regions'
    expect(keys.activeKeyColumns.value).toEqual([])
    name.value = 'Ledger'
    expect(keys.activeKeyColumns.value).toEqual([0, 2])
  })

  it('keeps the columns ascending however they were picked', () => {
    const keys = useKeyColumns(() => 'S')
    keys.toggleKeyColumn(3)
    keys.toggleKeyColumn(1)
    expect(keys.activeKeyColumns.value).toEqual([1, 3])
  })

  it('drops the sheet entirely once its last column is toggled off', () => {
    const keys = useKeyColumns(() => 'S')
    keys.toggleKeyColumn(1)
    keys.toggleKeyColumn(1)
    expect(keys.activeKeyColumns.value).toEqual([])
    expect(keys.bySheet.value.has('S')).toBe(false)
  })

  it('clears only the active sheet', () => {
    const name = ref('A')
    const keys = useKeyColumns(() => name.value)
    keys.toggleKeyColumn(0)
    name.value = 'B'
    keys.toggleKeyColumn(1)
    keys.clearKeyColumns()
    expect(keys.activeKeyColumns.value).toEqual([])
    name.value = 'A'
    expect(keys.activeKeyColumns.value).toEqual([0])
  })

  // The picker is mounted only for a real sheet, but a toggle arriving between
  // one comparison and the next must not mint a key under `undefined`.
  it('ignores a toggle with no sheet to attach it to', () => {
    const keys = useKeyColumns(() => undefined)
    keys.toggleKeyColumn(0)
    keys.clearKeyColumns()
    expect(keys.bySheet.value.size).toBe(0)
  })

  it('starts a new pair of files on Auto', async () => {
    const files = ref('first')
    const keys = useKeyColumns(() => 'Ledger', [() => files.value])
    keys.toggleKeyColumn(0)
    files.value = 'second'
    await nextTick()
    expect(keys.activeKeyColumns.value).toEqual([])
  })

  it('does not watch anything when given no reset sources', async () => {
    const keys = useKeyColumns(() => 'Ledger')
    keys.toggleKeyColumn(0)
    await nextTick()
    expect(keys.activeKeyColumns.value).toEqual([0])
  })
})
