const STEP = { ArrowDown: 1, ArrowUp: -1 }

/**
 * Keyboard model for the sidebar rail: arrows move (wrapping), Home/End jump.
 * @param {import('vue').Ref<string[]>} ids        rail order
 * @param {import('vue').Ref<string>} current      the open panel
 * @param {(id: string) => void} select
 * @returns {(e: KeyboardEvent) => void}
 */
export function useRailKeys(ids, current, select) {
  return (e) => {
    const list = ids.value
    let next = null
    if (e.key in STEP) {
      const at = list.indexOf(current.value)
      next = list[(at + STEP[e.key] + list.length) % list.length]
    } else if (e.key === 'Home') next = list[0]
    else if (e.key === 'End') next = list.at(-1)
    if (next == null) return
    e.preventDefault()
    select(next)
  }
}
