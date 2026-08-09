import { computed, ref, watch } from 'vue'

/**
 * Which columns name a row, held per sheet — the columns differ per sheet, so
 * one workbook-wide choice would be wrong on the second tab. A Map rather than
 * an object: the sheet name comes from the file, and `__proto__` must not
 * resolve to anything.
 * @param {() => string|undefined} sheetName the sheet the choice applies to
 * @param {Array<() => unknown>} resetOn sources that mean "a different pair of
 *   files": keys are held by NAME, and two workbooks routinely share one.
 */
export function useKeyColumns(sheetName, resetOn = []) {
  const bySheet = ref(new Map())

  if (resetOn.length) watch(resetOn, () => bySheet.value.clear())

  const activeKeyColumns = computed(() => bySheet.value.get(sheetName()) ?? [])

  function toggleKeyColumn(index) {
    const name = sheetName()
    if (!name) return
    const current = activeKeyColumns.value
    const next = current.includes(index)
      ? current.filter((i) => i !== index)
      : [...current, index].sort((a, b) => a - b)
    if (next.length) bySheet.value.set(name, next)
    else bySheet.value.delete(name)
  }

  function clearKeyColumns() {
    const name = sheetName()
    if (name) bySheet.value.delete(name)
  }

  return { bySheet, activeKeyColumns, toggleKeyColumn, clearKeyColumns }
}
